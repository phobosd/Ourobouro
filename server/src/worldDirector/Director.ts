import { Server, Socket } from 'socket.io';
import { Logger } from '../utils/Logger';
import { GuardrailService } from '../services/GuardrailService';
import { SnapshotService } from '../services/SnapshotService';
import { PublisherService } from '../services/PublisherService';
import { NPCGenerator } from '../generation/generators/NPCGenerator';
import { ItemGenerator } from '../generation/generators/ItemGenerator';
import { QuestGenerator } from '../generation/generators/QuestGenerator';
import { RoomGenerator } from '../generation/generators/RoomGenerator';
import { LLMService } from '../generation/llm/LLMService';
import { ProposalStatus, ProposalType, NPCPayload, ItemPayload, RoomPayload } from '../generation/proposals/schemas';
import { ItemRegistry } from '../services/ItemRegistry';
import { NPCRegistry } from '../services/NPCRegistry';
import { RoomRegistry } from '../services/RoomRegistry';
import { PrefabFactory } from '../factories/PrefabFactory';
import { CompendiumService } from '../services/CompendiumService';
import { Engine } from '../ecs/Engine';
import { ChunkSystem } from '../world/ChunkSystem';
import * as fs from 'fs';
import * as path from 'path';
import { IsRoom } from '../components/IsRoom';
import { Position } from '../components/Position';
import { Loot } from '../components/Loot';
import { NPC } from '../components/NPC';
import { Terminal } from '../components/Terminal';
import { ImageDownloader } from '../utils/ImageDownloader';
import { v4 as uuidv4 } from 'uuid';
import { DirectorSocketHandler } from './services/DirectorSocketHandler';
import { DirectorManagementService } from './services/DirectorManagementService';

export enum DirectorLogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    SUCCESS = 'success'
}

export interface DirectorLogEntry {
    timestamp: number;
    level: DirectorLogLevel;
    message: string;
    context?: any;
}

interface ActiveEvent {
    id: string;
    type: string;
    startTime: number;
    duration: number;
    entityIds: string[];
}

export class WorldDirector {
    public io: Server;
    public adminNamespace: any;
    public guardrails: GuardrailService;
    public snapshots: SnapshotService;
    public publisher: PublisherService;
    public llm: LLMService;

    // Generators
    public npcGen: NPCGenerator;
    public itemGen: ItemGenerator;
    public questGen: QuestGenerator;
    public roomGen: RoomGenerator;

    public engine: Engine;
    public chunkSystem: ChunkSystem;
    private automationInterval: NodeJS.Timeout | null = null;

    public management: DirectorManagementService;

    public logs: DirectorLogEntry[] = [];
    public proposals: any[] = []; // Pending content proposals
    public activeEvents: ActiveEvent[] = [];
    private innerThoughts: { timestamp: number, thought: string }[] = [];

    private configPath = path.join(process.cwd(), 'data', 'director_config.json');

    private socketHandler: DirectorSocketHandler;

    public getLLM(): LLMService {
        return this.llm;
    }

    constructor(io: Server, guardrails: GuardrailService, snapshots: SnapshotService, publisher: PublisherService, engine: Engine) {
        this.io = io;
        this.guardrails = guardrails;
        this.snapshots = snapshots;
        this.publisher = publisher;
        this.engine = engine;
        this.chunkSystem = new ChunkSystem(engine);
        this.llm = new LLMService(guardrails.getConfig().llmProfiles);
        this.adminNamespace = io.of('/admin');

        // Subscribe to guardrail updates to keep LLM profiles in sync
        this.guardrails.onUpdate((config) => {
            this.llm.updateConfig(config.llmProfiles);
            this.log(DirectorLogLevel.INFO, 'LLM Profiles updated from GuardrailService.');
        });

        // Initialize Generators
        this.npcGen = new NPCGenerator();
        this.itemGen = new ItemGenerator();
        this.questGen = new QuestGenerator();
        this.roomGen = new RoomGenerator();

        this.management = new DirectorManagementService(this);
        this.management.loadConfig();

        // Start the automation loop (it will respect isPaused)
        this.startAutomationLoop();

        this.socketHandler = new DirectorSocketHandler(this, this.adminNamespace);
        this.socketHandler.setup();

        this.setupEventListeners();
    }


    private async setupEventListeners() {
        const { GameEventBus, GameEventType } = await import('../utils/GameEventBus');
        const { CharacterService } = await import('../services/CharacterService');

        GameEventBus.getInstance().subscribe(GameEventType.PLAYER_CONNECTED, async () => {
            const charService = CharacterService.getInstance();
            const characters = charService.getAllCharacters();
            const enriched = characters.map(c => ({
                ...c,
                online: !!charService.getActiveEntityByCharId(c.id, this.engine)
            }));
            this.adminNamespace.emit('director:characters_update', enriched);
        });

        GameEventBus.getInstance().subscribe(GameEventType.PLAYER_DISCONNECTED, async () => {
            const charService = CharacterService.getInstance();
            const characters = charService.getAllCharacters();
            const enriched = characters.map(c => ({
                ...c,
                online: !!charService.getActiveEntityByCharId(c.id, this.engine)
            }));
            this.adminNamespace.emit('director:characters_update', enriched);
        });
    }

    public log(level: DirectorLogLevel, message: string, context?: any) {
        const entry: DirectorLogEntry = {
            timestamp: Date.now(),
            level,
            message,
            context
        };
        this.logs.push(entry);
        // Keep log size manageable
        if (this.logs.length > 1000) this.logs.shift();

        // Broadcast to admin
        this.adminNamespace.emit('director:log', entry);
    }

    private think(thought: string) {
        const entry = { timestamp: Date.now(), thought };
        this.innerThoughts.unshift(entry);
        if (this.innerThoughts.length > 100) this.innerThoughts.pop();
        this.adminNamespace.emit('director:thoughts_update', this.innerThoughts);
    }



    public async generateGlitchRun(): Promise<{ mobs: NPCPayload[], items: ItemPayload[] }> {
        this.log(DirectorLogLevel.INFO, 'Generating Glitch Run content...');

        const mobs: NPCPayload[] = [];
        const items: ItemPayload[] = [];

        // Generate Mobs
        // Generate Mobs
        for (let i = 0; i < this.management.glitchConfig.mobCount; i++) {
            try {
                const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm);
                if (proposal && proposal.payload) {
                    const payload = proposal.payload as NPCPayload;
                    // Force tag to be glitch_enemy
                    payload.tags = ['glitch_enemy'];
                    payload.behavior = 'aggressive';
                    mobs.push(payload);
                }
            } catch (err) {
                Logger.error('Director', `Failed to generate glitch mob: ${err}`);
            }
        }

        // Generate Items
        // Generate Items
        for (let i = 0; i < this.management.glitchConfig.itemCount; i++) {
            try {
                const proposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm);
                if (proposal && proposal.payload) {
                    const payload = proposal.payload as ItemPayload;
                    // Check for Legendary Chance
                    if (Math.random() < this.management.glitchConfig.legendaryChance) {
                        payload.rarity = 'legendary';
                        payload.name = `[GLITCH] ${payload.name}`;
                        payload.description += " It pulses with unstable energy.";
                    }
                    items.push(payload);
                }
            } catch (err) {
                Logger.error('Director', `Failed to generate glitch item: ${err}`);
            }
        }

        this.log(DirectorLogLevel.SUCCESS, `Glitch Run Generated: ${mobs.length} mobs, ${items.length} items.`);
        return { mobs, items };
    }

    public async generateBoss(context?: any) {
        this.log(DirectorLogLevel.INFO, 'Generating BOSS...');
        try {
            const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, {
                generatedBy: context?.generatedBy || 'Manual',
                subtype: 'BOSS',
                ...context
            });
            if (proposal && proposal.payload) {
                const payload = proposal.payload as NPCPayload;
                payload.tags = ['boss', 'aggressive'];
                payload.behavior = 'aggressive';
                // Boost stats for boss (World Boss scaling)
                payload.stats.health = (payload.stats.health || 100) * 5;
                payload.stats.attack = (payload.stats.attack || 10) * 2;
                payload.stats.defense = (payload.stats.defense || 5) * 2;

                // Generate Legendary Loot for Boss
                const itemProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, { generatedBy: 'Boss:Loot', subtype: 'LEGENDARY' });
                if (itemProposal && itemProposal.payload) {
                    // Auto-approve the item so it exists in the registry for the boss to "hold"
                    itemProposal.status = ProposalStatus.APPROVED;
                    await this.publisher.publish(itemProposal);
                    ItemRegistry.getInstance().reloadGeneratedItems();
                    CompendiumService.updateCompendium();

                    // Link item to boss equipment
                    if (!payload.equipment) payload.equipment = [];
                    payload.equipment.push(itemProposal.payload.id);

                    this.log(DirectorLogLevel.INFO, `Linked legendary loot (${itemProposal.payload.id}) to BOSS proposal.`);
                }

                return proposal;
            }
        } catch (err) {
            Logger.error('Director', `Failed to generate BOSS: ${err}`);
        }
        return null;
    }

    public async triggerWorldEvent(eventType: string, force: boolean = false, durationOverride?: number) {
        const config = this.guardrails.getConfig();

        // Default Durations
        const MOB_INVASION_DURATION = 30 * 60 * 1000; // 30 mins
        const BOSS_EVENT_DURATION = 15 * 60 * 1000;   // 15 mins
        const TRAVELING_MERCHANT_DURATION = 20 * 60 * 1000; // 20 mins
        const DATA_COURIER_DURATION = 20 * 60 * 1000; // 20 mins
        const SCAVENGER_HUNT_DURATION = 20 * 60 * 1000; // 20 mins

        if (config.features.requireHumanApproval && !force) {
            this.think(`Creating proposal for World Event: ${eventType} (Approval Required)`);
            const proposal: any = {
                id: uuidv4(),
                type: ProposalType.EVENT,
                status: ProposalStatus.DRAFT,
                payload: {
                    id: `event_${Math.random().toString(36).substring(7)}`,
                    type: eventType,
                    description: `A massive ${eventType} is about to occur.`,
                    duration: durationOverride || (eventType === 'BOSS_SPAWN' ? BOSS_EVENT_DURATION : MOB_INVASION_DURATION)
                },
                seed: Math.random().toString(),
                generatedBy: 'Director',
                createdAt: Date.now(),
                flavor: {
                    rationale: `High aggression levels (${(this.management.personality.aggression.value * 100).toFixed(0)}%) triggered a hostile world event.`
                }
            };
            this.proposals.push(proposal);
            this.adminNamespace.emit('director:proposals_update', this.proposals);
            return;
        }

        this.log(DirectorLogLevel.INFO, `Triggering World Event: ${eventType}`);
        const eventId = uuidv4();
        const entityIds: string[] = [];
        let duration = durationOverride || 0;

        if (eventType === 'MOB_INVASION') {
            duration = durationOverride || MOB_INVASION_DURATION;
            // Spawn 10-20 mobs in random locations
            const mobCount = 10 + Math.floor(Math.random() * 10);
            this.log(DirectorLogLevel.WARN, `⚠️ MOB INVASION DETECTED! Spawning ${mobCount} entities... Duration: ${(duration / 60000).toFixed(1)}m`);

            this.io.emit('message', {
                type: 'system',
                content: `\n\n[WARNING] SYSTEM BREACH DETECTED. MASSIVE BIOLOGICAL SIGNATURES INBOUND. THREAT LEVEL: HIGH.\n`
            });

            for (let i = 0; i < mobCount; i++) {
                try {
                    // Quick generation without proposals for events
                    const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, { generatedBy: 'Event:Invasion', subtype: 'MOB' });
                    if (proposal && proposal.payload) {
                        const payload = proposal.payload as NPCPayload;
                        payload.tags = ['invasion_mob', 'aggressive'];
                        payload.behavior = 'aggressive';

                        if (!proposal.flavor) proposal.flavor = {};
                        proposal.flavor.rationale = `Spawned as part of a MOB_INVASION event. ${proposal.flavor.rationale || ''}`;

                        // Auto-publish/spawn
                        proposal.status = ProposalStatus.APPROVED;
                        await this.processProposalAssets(proposal);
                        await this.publisher.publish(proposal);
                        NPCRegistry.getInstance().reloadGeneratedNPCs();

                        // Spawn in a random room
                        const x = 10 + Math.floor(Math.random() * 10) - 5;
                        const y = 10 + Math.floor(Math.random() * 10) - 5;

                        const npcEntity = PrefabFactory.createNPC(proposal.payload.id);
                        if (npcEntity) {
                            // Override position
                            let pos = npcEntity.getComponent(Position);
                            if (!pos) {
                                pos = new Position(x, y);
                                npcEntity.addComponent(pos);
                            } else {
                                pos.x = x;
                                pos.y = y;
                            }

                            this.engine.addEntity(npcEntity);
                            entityIds.push(npcEntity.id);
                        }
                    }
                } catch (err) {
                    Logger.error('Director', `Failed to spawn invasion mob: ${err}`);
                }
            }
        } else if (eventType === 'BOSS_SPAWN') {
            duration = durationOverride || BOSS_EVENT_DURATION;
            this.log(DirectorLogLevel.WARN, `⚠️ BOSS EVENT DETECTED! Duration: ${(duration / 60000).toFixed(1)}m`);

            this.io.emit('message', {
                type: 'system',
                content: `\n\n[CRITICAL] OMEGA-CLASS THREAT DETECTED. A POWERFUL ENTITY HAS ENTERED THE SECTOR. EXTREME CAUTION ADVISED.\n`
            });

            try {
                const proposal = await this.generateBoss({ generatedBy: 'Event:Boss' });
                if (proposal && proposal.payload) {
                    proposal.status = ProposalStatus.APPROVED;
                    await this.processProposalAssets(proposal);
                    await this.publisher.publish(proposal);
                    NPCRegistry.getInstance().reloadGeneratedNPCs();
                    await CompendiumService.updateCompendium();

                    // Spawn Boss at Center (or random)
                    const x = 10;
                    const y = 10;

                    const bossEntity = PrefabFactory.createNPC(proposal.payload.id);
                    if (bossEntity) {
                        let pos = bossEntity.getComponent(Position);
                        if (!pos) {
                            pos = new Position(x, y);
                            bossEntity.addComponent(pos);
                        } else {
                            pos.x = x;
                            pos.y = y;
                        }
                        this.engine.addEntity(bossEntity);
                        entityIds.push(bossEntity.id);
                        this.log(DirectorLogLevel.SUCCESS, `Spawned BOSS ${(proposal.payload as NPCPayload).name} at ${x},${y}`);
                    }
                }
            } catch (err) {
                Logger.error('Director', `Failed to spawn BOSS event: ${err}`);
            }
        } else if (eventType === 'TRAVELING_MERCHANT') {
            duration = durationOverride || TRAVELING_MERCHANT_DURATION;
            this.log(DirectorLogLevel.INFO, `🛒 TRAVELING MERCHANT EVENT! Duration: ${(duration / 60000).toFixed(1)}m`);

            this.io.emit('message', {
                type: 'success',
                content: `\n\n[NEURAL LINK] A traveling merchant has been spotted in the sector. They carry exotic wares from distant sprawls. Seek them out before they move on!\n`
            });

            try {
                // Generate merchant NPC with LLM
                const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, {
                    generatedBy: 'Event:TravelingMerchant',
                    subtype: 'MERCHANT',
                    context: 'A wandering merchant with rare and exotic cyberpunk goods. They should have a mysterious background and unique dialogue about their travels across different sectors.'
                });

                if (proposal && proposal.payload) {
                    const payload = proposal.payload as NPCPayload;
                    payload.tags = ['event_merchant', 'passive'];
                    payload.behavior = 'passive';

                    // Generate 3-5 rare items for the merchant
                    const itemCount = 3 + Math.floor(Math.random() * 3);
                    const merchantItems: string[] = [];

                    for (let i = 0; i < itemCount; i++) {
                        const itemProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, {
                            generatedBy: 'Event:MerchantInventory',
                            rarity: Math.random() < 0.3 ? 'epic' : 'rare'
                        });

                        if (itemProposal && itemProposal.payload) {
                            itemProposal.status = ProposalStatus.APPROVED;
                            await this.publisher.publish(itemProposal);
                            ItemRegistry.getInstance().reloadGeneratedItems();
                            merchantItems.push(itemProposal.payload.id);
                        }
                    }

                    // Add items to merchant's inventory
                    if (!payload.equipment) payload.equipment = [];
                    payload.equipment.push(...merchantItems);

                    // Auto-publish merchant
                    proposal.status = ProposalStatus.APPROVED;
                    await this.processProposalAssets(proposal);
                    await this.publisher.publish(proposal);
                    NPCRegistry.getInstance().reloadGeneratedNPCs();

                    // Spawn in random location
                    const x = 10 + Math.floor(Math.random() * 10) - 5;
                    const y = 10 + Math.floor(Math.random() * 10) - 5;

                    const merchantEntity = PrefabFactory.createNPC(proposal.payload.id);
                    if (merchantEntity) {
                        let pos = merchantEntity.getComponent(Position);
                        if (!pos) {
                            pos = new Position(x, y);
                            merchantEntity.addComponent(pos);
                        } else {
                            pos.x = x;
                            pos.y = y;
                        }

                        // Add Terminal component so players can "read" the merchant to see items
                        const merchantName = (proposal.payload as NPCPayload).name || 'Traveling Merchant';
                        merchantEntity.addComponent(new Terminal(merchantName, {
                            title: `${merchantName} - Exotic Wares`,
                            items: merchantItems
                        }));

                        this.engine.addEntity(merchantEntity);
                        entityIds.push(merchantEntity.id);
                        this.log(DirectorLogLevel.SUCCESS, `Spawned Traveling Merchant at ${x},${y} with ${merchantItems.length} rare items`);
                    }
                }
            } catch (err) {
                Logger.error('Director', `Failed to spawn TRAVELING_MERCHANT event: ${err}`);
            }
        } else if (eventType === 'DATA_COURIER') {
            duration = durationOverride || DATA_COURIER_DURATION;
            this.log(DirectorLogLevel.INFO, `📨 DATA COURIER EVENT! Duration: ${(duration / 60000).toFixed(1)}m`);

            this.io.emit('message', {
                type: 'info',
                content: `\n\n[NEURAL LINK] URGENT: A data courier is seeking assistance with a time-sensitive delivery. Generous compensation offered.\n`
            });

            try {
                // Generate courier NPC
                const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, {
                    generatedBy: 'Event:DataCourier',
                    subtype: 'COURIER',
                    context: 'A nervous courier with an urgent package delivery. They need someone trustworthy to complete the delivery. Should have dialogue explaining the urgency and importance of the package.'
                });

                if (proposal && proposal.payload) {
                    const payload = proposal.payload as NPCPayload;
                    payload.tags = ['event_courier', 'passive'];
                    payload.behavior = 'passive';

                    // Generate the package item
                    const packageProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, {
                        generatedBy: 'Event:CourierPackage',
                        context: 'A mysterious sealed package or data chip that needs urgent delivery. Should look valuable and important.'
                    });

                    if (packageProposal && packageProposal.payload) {
                        packageProposal.status = ProposalStatus.APPROVED;
                        await this.publisher.publish(packageProposal);
                        ItemRegistry.getInstance().reloadGeneratedItems();

                        // Add package to courier's hands
                        if (!payload.equipment) payload.equipment = [];
                        payload.equipment.push(packageProposal.payload.id);
                    }

                    // Auto-publish courier
                    proposal.status = ProposalStatus.APPROVED;
                    await this.processProposalAssets(proposal);
                    await this.publisher.publish(proposal);
                    NPCRegistry.getInstance().reloadGeneratedNPCs();

                    // Spawn courier
                    const x = 10 + Math.floor(Math.random() * 10) - 5;
                    const y = 10 + Math.floor(Math.random() * 10) - 5;

                    const courierEntity = PrefabFactory.createNPC(proposal.payload.id);
                    if (courierEntity) {
                        let pos = courierEntity.getComponent(Position);
                        if (!pos) {
                            pos = new Position(x, y);
                            courierEntity.addComponent(pos);
                        } else {
                            pos.x = x;
                            pos.y = y;
                        }
                        this.engine.addEntity(courierEntity);
                        entityIds.push(courierEntity.id);
                        this.log(DirectorLogLevel.SUCCESS, `Spawned Data Courier at ${x},${y}`);

                        // TODO: Generate quest for delivery (requires quest system integration)
                        this.log(DirectorLogLevel.WARN, 'Quest generation for courier not yet implemented');
                    }
                }
            } catch (err) {
                Logger.error('Director', `Failed to spawn DATA_COURIER event: ${err}`);
            }
        } else if (eventType === 'SCAVENGER_HUNT') {
            duration = durationOverride || SCAVENGER_HUNT_DURATION;
            this.log(DirectorLogLevel.INFO, `🔍 SCAVENGER HUNT EVENT! Duration: ${(duration / 60000).toFixed(1)}m`);

            this.io.emit('message', {
                type: 'warning',
                content: `\n\n[NEURAL LINK] ENCRYPTED TRANSMISSION DETECTED: "The first clue awaits those brave enough to seek the hidden treasure..."\n`
            });

            try {
                // Generate mysterious NPC who gives the first clue
                const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, {
                    generatedBy: 'Event:ScavengerHunt',
                    subtype: 'MYSTERIOUS',
                    context: 'A mysterious hooded figure who speaks in riddles and offers the first clue to a treasure hunt. Should be enigmatic and cryptic.'
                });

                if (proposal && proposal.payload) {
                    const payload = proposal.payload as NPCPayload;
                    payload.tags = ['event_scavenger', 'passive'];
                    payload.behavior = 'passive';

                    // Generate the legendary treasure item
                    const treasureProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, {
                        generatedBy: 'Event:ScavengerTreasure',
                        subtype: 'LEGENDARY',
                        rarity: 'legendary'
                    });

                    if (treasureProposal && treasureProposal.payload) {
                        treasureProposal.status = ProposalStatus.APPROVED;
                        await this.publisher.publish(treasureProposal);
                        ItemRegistry.getInstance().reloadGeneratedItems();
                        CompendiumService.updateCompendium();

                        this.log(DirectorLogLevel.INFO, `Generated legendary treasure: ${(treasureProposal.payload as ItemPayload).name}`);
                    }

                    // Auto-publish the mysterious NPC
                    proposal.status = ProposalStatus.APPROVED;
                    await this.processProposalAssets(proposal);
                    await this.publisher.publish(proposal);
                    NPCRegistry.getInstance().reloadGeneratedNPCs();

                    // Spawn the NPC with first clue
                    const startX = 10 + Math.floor(Math.random() * 10) - 5;
                    const startY = 10 + Math.floor(Math.random() * 10) - 5;

                    const npcEntity = PrefabFactory.createNPC(proposal.payload.id);
                    if (npcEntity) {
                        let pos = npcEntity.getComponent(Position);
                        if (!pos) {
                            pos = new Position(startX, startY);
                            npcEntity.addComponent(pos);
                        } else {
                            pos.x = startX;
                            pos.y = startY;
                        }
                        this.engine.addEntity(npcEntity);
                        entityIds.push(npcEntity.id);
                        this.log(DirectorLogLevel.SUCCESS, `Spawned Scavenger Hunt NPC at ${startX},${startY}`);

                        // TODO: Generate clue chain (requires quest/clue system)
                        this.log(DirectorLogLevel.WARN, 'Clue chain generation not yet implemented');
                    }
                }
            } catch (err) {
                Logger.error('Director', `Failed to spawn SCAVENGER_HUNT event: ${err}`);
            }
        }


        // Register Active Event
        if (entityIds.length > 0) {
            this.activeEvents.push({
                id: eventId,
                type: eventType,
                startTime: Date.now(),
                duration,
                entityIds
            });
            this.log(DirectorLogLevel.INFO, `Event ${eventType} (${eventId}) registered with ${entityIds.length} entities.`);
        }
    }

    private checkActiveEvents() {
        const now = Date.now();
        const expiredEvents = this.activeEvents.filter(e => now > e.startTime + e.duration);

        for (const event of expiredEvents) {
            this.log(DirectorLogLevel.INFO, `Event ${event.type} (${event.id}) EXPIRED. Cleaning up...`);

            let removedCount = 0;
            for (const entityId of event.entityIds) {
                if (this.engine.getEntity(entityId)) {
                    this.engine.removeEntity(entityId);
                    removedCount++;
                }
            }

            this.log(DirectorLogLevel.SUCCESS, `Event Cleanup: Removed ${removedCount} entities.`);

            if (event.type === 'MOB_INVASION') {
                this.io.emit('message', {
                    type: 'system',
                    content: `\n\n[SYSTEM] INVASION CONTAINED. BIOLOGICAL SIGNATURES DISSIPATING.\n`
                });
            } else if (event.type === 'BOSS_SPAWN') {
                this.io.emit('message', {
                    type: 'system',
                    content: `\n\n[SYSTEM] OMEGA THREAT SIGNAL LOST. ENTITY HAS DEPARTED THE SECTOR.\n`
                });
            } else if (event.type === 'TRAVELING_MERCHANT') {
                this.io.emit('message', {
                    type: 'info',
                    content: `\n\n[NEURAL LINK] The traveling merchant has packed up their wares and moved on to another sector.\n`
                });
            } else if (event.type === 'DATA_COURIER') {
                this.io.emit('message', {
                    type: 'info',
                    content: `\n\n[NEURAL LINK] The courier's time window has expired. The delivery opportunity has been lost.\n`
                });
            } else if (event.type === 'SCAVENGER_HUNT') {
                this.io.emit('message', {
                    type: 'warning',
                    content: `\n\n[NEURAL LINK] The mysterious figure has vanished. The treasure hunt has ended.\n`
                });
            }
        }

        // Remove expired from list
        if (expiredEvents.length > 0) {
            this.activeEvents = this.activeEvents.filter(e => now <= e.startTime + e.duration);
        }
    }

    private cleanupOrphanedEventEntities() {
        // Remove any event NPCs that persisted from previous server session
        const eventTags = ['event_merchant', 'event_courier', 'event_scavenger'];
        const allNPCs = this.engine.getEntitiesWithComponent(NPC);

        let removedCount = 0;
        for (const npcEntity of allNPCs) {
            const npcComp = npcEntity.getComponent(NPC);
            if (npcComp && npcComp.tag) {
                const hasEventTag = eventTags.includes(npcComp.tag);
                if (hasEventTag) {
                    this.engine.removeEntity(npcEntity.id);
                    removedCount++;
                }
            }
        }

        if (removedCount > 0) {
            this.log(DirectorLogLevel.INFO, `Cleaned up ${removedCount} orphaned event entities from previous session.`);
        }
    }

    public stopEvent(eventId: string) {
        const event = this.activeEvents.find(e => e.id === eventId);
        if (!event) {
            this.log(DirectorLogLevel.WARN, `Cannot stop event ${eventId}: Event not found.`);
            return false;
        }

        this.log(DirectorLogLevel.INFO, `Manually stopping event: ${event.type} (${eventId})`);

        // Remove all entities associated with this event
        let removedCount = 0;
        for (const entityId of event.entityIds) {
            if (this.engine.getEntity(entityId)) {
                this.engine.removeEntity(entityId);
                removedCount++;
            }
        }

        this.log(DirectorLogLevel.SUCCESS, `Event stopped: Removed ${removedCount} entities.`);

        // Send end message based on event type
        if (event.type === 'MOB_INVASION') {
            this.io.emit('message', {
                type: 'system',
                content: `\n\n[SYSTEM] INVASION CONTAINED. BIOLOGICAL SIGNATURES DISSIPATING.\n`
            });
        } else if (event.type === 'BOSS_SPAWN') {
            this.io.emit('message', {
                type: 'system',
                content: `\n\n[SYSTEM] OMEGA THREAT SIGNAL LOST. ENTITY HAS DEPARTED THE SECTOR.\n`
            });
        } else if (event.type === 'TRAVELING_MERCHANT') {
            this.io.emit('message', {
                type: 'info',
                content: `\n\n[NEURAL LINK] The traveling merchant has packed up their wares and moved on to another sector.\n`
            });
        } else if (event.type === 'DATA_COURIER') {
            this.io.emit('message', {
                type: 'info',
                content: `\n\n[NEURAL LINK] The courier's time window has expired. The delivery opportunity has been lost.\n`
            });
        } else if (event.type === 'SCAVENGER_HUNT') {
            this.io.emit('message', {
                type: 'warning',
                content: `\n\n[NEURAL LINK] The mysterious figure has vanished. The treasure hunt has ended.\n`
            });
        }

        // Remove from active events
        this.activeEvents = this.activeEvents.filter(e => e.id !== eventId);
        return true;
    }

    public getStatus() {
        return {
            paused: this.management.isPaused,
            personality: this.management.personality,
            glitchConfig: this.management.glitchConfig, // Expose config
            guardrails: this.guardrails.getSafeConfig(),
            proposals: this.proposals,
            activeEvents: this.activeEvents, // Expose active events
            innerThoughts: this.innerThoughts
        };
    }



    public findAdjacentEmptySpot(): { x: number, y: number } | null {
        // Query the engine for ALL entities with IsRoom component (includes static and generated rooms)
        const roomEntities = this.engine.getEntitiesWithComponent(IsRoom);

        if (roomEntities.length === 0) {
            // If truly empty, start at a reasonable center
            return { x: 10, y: 10 };
        }

        // Shuffle rooms to pick a random starting point for expansion
        const shuffledRooms = [...roomEntities].sort(() => Math.random() - 0.5);

        for (const roomEntity of shuffledRooms) {
            const pos = roomEntity.getComponent(Position);
            if (!pos) continue;

            const { x, y } = pos;
            const adjacents = [
                { x: x + 1, y },
                { x: x - 1, y },
                { x, y: y + 1 },
                { x, y: y - 1 }
            ];

            // Shuffle adjacents to avoid bias
            for (const spot of adjacents.sort(() => Math.random() - 0.5)) {
                // 1. Check if a room already exists at this spot in the engine
                const existingRoom = roomEntities.find(r => {
                    const rPos = r.getComponent(Position);
                    return rPos && rPos.x === spot.x && rPos.y === spot.y;
                });

                if (!existingRoom) {
                    // 2. Check if this spot is already in a pending proposal
                    const isPending = this.proposals.some(p =>
                        p.type === ProposalType.WORLD_EXPANSION &&
                        p.payload.coordinates.x === spot.x &&
                        p.payload.coordinates.y === spot.y
                    );

                    if (!isPending) return spot;
                }
            }
        }

        return null;
    }

    private startAutomationLoop() {
        if (this.automationInterval) clearInterval(this.automationInterval);

        this.automationInterval = setInterval(async () => {
            if (this.management.isPaused) {
                this.think("System paused. Standing by.");
                return;
            }

            this.think("Evaluating world state for autonomous actions...");

            // Check for expired events
            this.checkActiveEvents();

            // 1. Random Event Trigger (if Aggression is high)
            const aggressionRoll = Math.random();
            const aggressionThreshold = this.management.personality.aggression.value * this.guardrails.getConfig().budgets.aggressionProbability;

            if (this.management.personality.aggression.enabled) {
                if (aggressionRoll < aggressionThreshold) {
                    this.think(`Aggression check PASSED (Roll: ${aggressionRoll.toFixed(4)} < Threshold: ${aggressionThreshold.toFixed(4)}). Triggering event...`);
                    await this.triggerWorldEvent('MOB_INVASION');
                } else {
                    this.think(`Aggression check FAILED (Roll: ${aggressionRoll.toFixed(4)} >= Threshold: ${aggressionThreshold.toFixed(4)}). No hostile events triggered.`);
                }
            } else {
                this.think("Aggression disabled. Skipping hostile event checks.");
            }

            // 2. Autonomous World Expansion
            const expansionRoll = Math.random();
            const expansionThreshold = this.management.personality.expansion.value * this.guardrails.getConfig().budgets.expansionProbability;

            if (this.management.personality.expansion.enabled) {
                if (expansionRoll < expansionThreshold) {
                    this.think(`Expansion check PASSED (Roll: ${expansionRoll.toFixed(4)} < Threshold: ${expansionThreshold.toFixed(4)}). Searching for expansion spot...`);
                    const spot = this.findAdjacentEmptySpot();
                    if (spot) {
                        this.think(`Found expansion spot at ${spot.x}, ${spot.y}. Generating proposal...`);
                        this.log(DirectorLogLevel.INFO, `Autonomous expansion: Targeting spot at ${spot.x}, ${spot.y}`);
                        try {
                            const proposal = await this.roomGen.generate(this.guardrails.getConfig(), this.llm, {
                                generatedBy: 'Autonomous',
                                x: spot.x,
                                y: spot.y,
                                existingNames: RoomRegistry.getInstance().getAllRooms().map(r => r.name)
                            });
                            if (proposal) {
                                if (!proposal.flavor) proposal.flavor = {};
                                proposal.flavor.rationale = `Autonomous expansion triggered by Expansion personality (${(this.management.personality.expansion.value * 100).toFixed(0)}%). ${proposal.flavor.rationale || ''}`;
                                this.proposals.push(proposal);
                                this.adminNamespace.emit('director:proposals_update', this.proposals);
                                this.log(DirectorLogLevel.SUCCESS, `Autonomous expansion proposal created for ${spot.x}, ${spot.y}`);
                            }
                        } catch (err) {
                            this.think(`Expansion generation FAILED: ${err}`);
                            this.log(DirectorLogLevel.ERROR, `Autonomous expansion failed: ${err}`);
                        }
                    } else {
                        this.think("No suitable expansion spots found adjacent to existing rooms.");
                    }
                } else {
                    this.think(`Expansion check FAILED (Roll: ${expansionRoll.toFixed(4)} >= Threshold: ${expansionThreshold.toFixed(4)}). No expansion triggered.`);
                }
            } else {
                this.think("Expansion disabled. Skipping world growth checks.");
            }

            // 3. Chaos Check (just for thoughts)
            if (this.management.personality.chaos.enabled) {
                const chaosRoll = Math.random();
                if (chaosRoll < this.management.personality.chaos.value * this.guardrails.getConfig().budgets.chaosProbability) {
                    this.think(`Chaos roll high (${chaosRoll.toFixed(4)}). The Matrix feels unstable...`);
                }
            }

        }, 10000); // Check every 10 seconds
    }



    public async generateChunk(cx: number, cy: number) {
        this.log(DirectorLogLevel.INFO, `Generating chunk at ${cx},${cy}`);

        // Define chunk bounds (e.g. 20x20 area)
        const CHUNK_SIZE = 20;
        const startX = cx * CHUNK_SIZE;
        const startY = cy * CHUNK_SIZE;

        // Generate 3-5 rooms in this chunk
        const roomCount = 3 + Math.floor(Math.random() * 3);

        for (let i = 0; i < roomCount; i++) {
            const rx = startX + Math.floor(Math.random() * CHUNK_SIZE);
            const ry = startY + Math.floor(Math.random() * CHUNK_SIZE);

            await this.createAndPublishRoom(rx, ry, 'street', 'Cyberpunk Street');
        }

        this.chunkSystem.markChunkGenerated(cx, cy);
    }

    public async createAndPublishRoom(x: number, y: number, type: string, namePrefix: string) {
        try {
            const proposal = await this.roomGen.generate(this.guardrails.getConfig(), this.llm, {
                generatedBy: 'ChunkSystem',
                x: x,
                y: y
            });

            if (proposal && proposal.payload) {
                const payload = proposal.payload as RoomPayload;
                payload.name = `${namePrefix} ${x},${y}`;
                proposal.status = ProposalStatus.APPROVED;
                await this.publisher.publish(proposal);

                // Spawn it
                const roomEntity = PrefabFactory.createRoom(proposal.payload.id);
                if (roomEntity) {
                    this.engine.addEntity(roomEntity);
                }
            }
        } catch (err) {
            this.log(DirectorLogLevel.ERROR, `Failed to generate room at ${x},${y}: ${err}`);
        }
    }

    public async processProposalAssets(proposal: any) {
        if (proposal && proposal.payload && proposal.payload.portrait && proposal.payload.portrait.startsWith('http')) {
            const filename = `${proposal.payload.id}.jpg`;
            this.log(DirectorLogLevel.INFO, `Downloading asset for ${proposal.payload.id}...`);
            const localPath = await ImageDownloader.downloadImage(proposal.payload.portrait, filename);
            if (localPath) {
                proposal.payload.portrait = localPath;
            }
        }
    }
}
