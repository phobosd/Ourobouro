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
import { ImageDownloader } from '../utils/ImageDownloader';
import { v4 as uuidv4 } from 'uuid';

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
    private io: Server;
    private adminNamespace: any;
    public guardrails: GuardrailService;
    private snapshots: SnapshotService;
    private publisher: PublisherService;
    public llm: LLMService;

    // Generators
    private npcGen: NPCGenerator;
    private itemGen: ItemGenerator;
    private questGen: QuestGenerator;
    private roomGen: RoomGenerator;

    private engine: Engine;
    private chunkSystem: ChunkSystem;
    private automationInterval: NodeJS.Timeout | null = null;

    private isPaused: boolean = true; // Start paused for safety
    private logs: DirectorLogEntry[] = [];
    private proposals: any[] = []; // Pending content proposals
    private activeEvents: ActiveEvent[] = [];
    private innerThoughts: { timestamp: number, thought: string }[] = [];
    private personality = {
        chaos: { value: 0.2, enabled: true },
        aggression: { value: 0.0, enabled: false },
        expansion: { value: 0.1, enabled: true }
    };

    private glitchConfig = {
        mobCount: 5,
        itemCount: 5,
        legendaryChance: 0.05
    };

    private configPath = path.join(process.cwd(), 'data', 'director_config.json');

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

        // Start the automation loop (it will respect isPaused)
        // Start the automation loop (it will respect isPaused)
        this.startAutomationLoop();

        this.loadConfig();
        this.setupAdminSocket();
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

    private log(level: DirectorLogLevel, message: string, context?: any) {
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

    public pause() {
        this.isPaused = true;
        this.saveConfig();
        this.log(DirectorLogLevel.WARN, 'Director PAUSED.');
        this.adminNamespace.emit('director:status', this.getStatus());
    }

    public resume() {
        this.isPaused = false;
        this.saveConfig();
        this.log(DirectorLogLevel.SUCCESS, 'Director RESUMED.');
        this.adminNamespace.emit('director:status', this.getStatus());
    }

    public async generateGlitchRun(): Promise<{ mobs: NPCPayload[], items: ItemPayload[] }> {
        this.log(DirectorLogLevel.INFO, 'Generating Glitch Run content...');

        const mobs: NPCPayload[] = [];
        const items: ItemPayload[] = [];

        // Generate Mobs
        for (let i = 0; i < this.glitchConfig.mobCount; i++) {
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
        for (let i = 0; i < this.glitchConfig.itemCount; i++) {
            try {
                const proposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm);
                if (proposal && proposal.payload) {
                    const payload = proposal.payload as ItemPayload;
                    // Check for Legendary Chance
                    if (Math.random() < this.glitchConfig.legendaryChance) {
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
                    rationale: `High aggression levels (${(this.personality.aggression.value * 100).toFixed(0)}%) triggered a hostile world event.`
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
            }
        }

        // Remove expired from list
        if (expiredEvents.length > 0) {
            this.activeEvents = this.activeEvents.filter(e => now <= e.startTime + e.duration);
        }
    }

    public getStatus() {
        return {
            paused: this.isPaused,
            personality: this.personality,
            glitchConfig: this.glitchConfig, // Expose config
            guardrails: this.guardrails.getSafeConfig(),
            proposals: this.proposals,
            innerThoughts: this.innerThoughts
        };
    }

    private loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                const config = JSON.parse(data);
                if (config.glitchConfig) {
                    this.glitchConfig = { ...this.glitchConfig, ...config.glitchConfig };
                }
                if (config.personality) {
                    this.personality = { ...this.personality, ...config.personality };
                }
                if (config.paused !== undefined) {
                    this.isPaused = config.paused;
                }
                Logger.info('Director', 'Loaded configuration from disk.');
            }
        } catch (err) {
            Logger.error('Director', `Failed to load config: ${err}`);
        }
    }

    private saveConfig() {
        try {
            const config = {
                glitchConfig: this.glitchConfig,
                personality: this.personality,
                paused: this.isPaused
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 4));
            Logger.info('Director', 'Saved configuration to disk.');
        } catch (err) {
            Logger.error('Director', `Failed to save config: ${err}`);
        }
    }

    private findAdjacentEmptySpot(): { x: number, y: number } | null {
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
            if (this.isPaused) {
                this.think("System paused. Standing by.");
                return;
            }

            this.think("Evaluating world state for autonomous actions...");

            // Check for expired events
            this.checkActiveEvents();

            // 1. Random Event Trigger (if Aggression is high)
            const aggressionRoll = Math.random();
            const aggressionThreshold = this.personality.aggression.value * this.guardrails.getConfig().budgets.aggressionProbability;

            if (this.personality.aggression.enabled) {
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
            const expansionThreshold = this.personality.expansion.value * this.guardrails.getConfig().budgets.expansionProbability;

            if (this.personality.expansion.enabled) {
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
                                proposal.flavor.rationale = `Autonomous expansion triggered by Expansion personality (${(this.personality.expansion.value * 100).toFixed(0)}%). ${proposal.flavor.rationale || ''}`;
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
            if (this.personality.chaos.enabled) {
                const chaosRoll = Math.random();
                if (chaosRoll < this.personality.chaos.value * this.guardrails.getConfig().budgets.chaosProbability) {
                    this.think(`Chaos roll high (${chaosRoll.toFixed(4)}). The Matrix feels unstable...`);
                }
            }

        }, 10000); // Check every 10 seconds
    }

    private setupAdminSocket() {
        this.adminNamespace.use(async (socket: Socket, next: (err?: any) => void) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                Logger.warn('Director', `Admin connection rejected: No token from ${socket.id}`);
                return next(new Error('Authentication error: No token provided'));
            }

            try {
                const { AuthService } = await import('../services/AuthService');
                const user = AuthService.getInstance().verifyToken(token);

                if (!user) {
                    Logger.warn('Director', `Admin connection rejected: Invalid token from ${socket.id}`);
                    return next(new Error('Authentication error: Invalid token'));
                }

                if (user.role !== 'god' && user.role !== 'admin') {
                    Logger.warn('Director', `Admin connection rejected: User ${user.username} has insufficient permissions (${user.role})`);
                    return next(new Error('Authentication error: Insufficient permissions'));
                }

                // Attach user to socket
                (socket as any).user = user;
                next();
            } catch (err) {
                Logger.error('Director', `Auth middleware error: ${err}`);
                next(new Error('Internal server error during auth'));
            }
        });

        this.adminNamespace.on('connection', (socket: Socket) => {
            Logger.info('Director', `Admin connected: ${socket.id}`);

            // Send current state
            try {
                Logger.info('Director', `Admin ${socket.id} - fetching status...`);
                const status = this.getStatus();
                Logger.info('Director', `Admin ${socket.id} - status fetched. Sending...`);
                socket.emit('director:status', status);
                Logger.info('Director', `Admin ${socket.id} - status sent.`);
            } catch (err) {
                Logger.error('Director', `Failed to get or send status to admin ${socket.id}:`, err);
            }

            // Send recent logs
            this.logs.slice(-50).forEach(log => socket.emit('director:log', log));

            socket.on('director:pause', () => this.pause());
            socket.on('director:resume', () => this.resume());

            socket.on('director:update_personality', (update: any) => {
                if (update.chaos !== undefined) this.personality.chaos = { ...this.personality.chaos, ...update.chaos };
                if (update.aggression !== undefined) this.personality.aggression = { ...this.personality.aggression, ...update.aggression };
                if (update.expansion !== undefined) this.personality.expansion = { ...this.personality.expansion, ...update.expansion };

                this.log(DirectorLogLevel.INFO, `Personality updated: ${JSON.stringify(this.personality)}`);
                this.saveConfig();
                this.adminNamespace.emit('director:status', this.getStatus());
            });

            socket.on('director:update_glitch_config', (config: any) => {
                this.glitchConfig = { ...this.glitchConfig, ...config };
                this.saveConfig();
                this.log(DirectorLogLevel.INFO, 'Glitch Door configuration updated.');
                this.adminNamespace.emit('director:status', this.getStatus());
            });

            socket.on('director:update_guardrail', (update: any) => {
                // Deep clone to avoid mutating the reference held by GuardrailService
                // This is critical so that saveConfig() can compare new vs old to restore masked keys
                const config = JSON.parse(JSON.stringify(this.guardrails.getConfig()));

                if (update.requireHumanApproval !== undefined) config.features.requireHumanApproval = update.requireHumanApproval;
                if (update.autoSnapshotHighRisk !== undefined) config.features.autoSnapshotHighRisk = update.autoSnapshotHighRisk;
                if (update.enableNPCs !== undefined) config.features.enableNPCs = update.enableNPCs;
                if (update.enableItems !== undefined) config.features.enableItems = update.enableItems;
                if (update.enableQuests !== undefined) config.features.enableQuests = update.enableQuests;
                if (update.enableExpansions !== undefined) config.features.enableExpansions = update.enableExpansions;
                if (update.restrictedToGlitchArea !== undefined) config.features.restrictedToGlitchArea = update.restrictedToGlitchArea;

                if (update.budgets !== undefined) {
                    config.budgets = { ...config.budgets, ...update.budgets };
                }
                if (update.llmProfiles !== undefined) {
                    config.llmProfiles = update.llmProfiles;
                    // Note: We do NOT call this.llm.updateConfig here.
                    // this.guardrails.saveConfig() triggers the onUpdate callback which handles it.
                }
                this.guardrails.saveConfig(config);
                this.log(DirectorLogLevel.INFO, `Guardrails updated: ${JSON.stringify(update)}`);
                this.adminNamespace.emit('director:status', this.getStatus());
            });

            socket.on('director:approve_proposal', async (id: string) => {
                const proposal = this.proposals.find(p => p.id === id);
                if (proposal) {
                    try {
                        proposal.status = ProposalStatus.APPROVED;
                        const filePath = await this.publisher.publish(proposal);
                        this.log(DirectorLogLevel.SUCCESS, `Proposal PUBLISHED: ${proposal.type} -> ${filePath}`);

                        // Trigger registry reloads
                        if (proposal.type === ProposalType.ITEM) {
                            ItemRegistry.getInstance().reloadGeneratedItems();
                        } else if (proposal.type === ProposalType.NPC) {
                            NPCRegistry.getInstance().reloadGeneratedNPCs();
                        } else if (proposal.type === ProposalType.WORLD_EXPANSION) {
                            RoomRegistry.getInstance().reloadGeneratedRooms();
                        } else if (proposal.type === ProposalType.EVENT) {
                            // Execute the event immediately upon approval
                            await this.triggerWorldEvent(proposal.payload.type, true, proposal.payload.duration);
                        }

                        // Update Compendium whenever an NPC or Item is published (skip for mobs)
                        if (proposal.type === ProposalType.ITEM || (proposal.type === ProposalType.NPC && proposal.payload.role !== 'mob')) {
                            await CompendiumService.updateCompendium();
                        }

                        // Spawn the new room immediately
                        if (proposal.type === ProposalType.WORLD_EXPANSION) {
                            const roomEntity = PrefabFactory.createRoom(proposal.payload.id);
                            if (roomEntity) {
                                this.engine.addEntity(roomEntity);
                                this.log(DirectorLogLevel.SUCCESS, `Spawned new room: ${proposal.payload.name}`);

                                // Spawn a random NPC in the new room
                                const pos = roomEntity.getComponent(Position);
                                if (pos) {
                                    const npcType = 'street vendor'; // Only non-aggressive
                                    const npc = PrefabFactory.createNPC(npcType);
                                    if (npc) {
                                        npc.addComponent(new Position(pos.x, pos.y));
                                        this.engine.addEntity(npc);
                                        PrefabFactory.equipNPC(npc, this.engine);
                                        this.log(DirectorLogLevel.INFO, `Spawned ${npcType} in new room.`);
                                    }
                                }
                            }
                        }

                        // Broadcast global autocomplete update
                        this.io.emit('autocomplete-data', {
                            spawnables: [...PrefabFactory.getSpawnableItems(), ...PrefabFactory.getSpawnableNPCs()],
                            stats: ['STR', 'CON', 'AGI', 'CHA', 'HP', 'MAXHP', 'ATTACK', 'DEFENSE'],
                            skills: [
                                'Hacking',
                                'Stealth',
                                'Marksmanship (Light)',
                                'Marksmanship (Medium)',
                                'Marksmanship (Heavy)'
                            ]
                        });

                        this.proposals = this.proposals.filter(p => p.id !== id);
                        this.adminNamespace.emit('director:proposals_update', this.proposals);
                    } catch (err) {
                        this.log(DirectorLogLevel.ERROR, `Failed to publish proposal: ${err}`);
                    }
                }
            });

            socket.on('director:reject_proposal', (id: string) => {
                this.log(DirectorLogLevel.WARN, `Proposal REJECTED: ${id}`);
                this.proposals = this.proposals.filter(p => p.id !== id);
                this.adminNamespace.emit('director:proposals_update', this.proposals);
            });

            socket.on('director:manual_trigger', async (data: { type: string, payload?: any }) => {
                this.log(DirectorLogLevel.INFO, `Manual trigger received: ${data.type}`);

                let proposal;
                const config = this.guardrails.getConfig();

                switch (data.type) {
                    case 'NPC':
                        proposal = await this.npcGen.generate(config, this.llm, {
                            generatedBy: 'Manual',
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'MOB':
                        proposal = await this.npcGen.generate(config, this.llm, {
                            generatedBy: 'Manual',
                            subtype: 'MOB',
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'BOSS':
                        proposal = await this.generateBoss();
                        break;
                    case 'ITEM':
                        proposal = await this.itemGen.generate(config, this.llm, {
                            generatedBy: 'Manual',
                            ...data.payload,
                            existingNames: ItemRegistry.getInstance().getAllItems().map(i => i.name)
                        });
                        break;
                    case 'QUEST':
                        proposal = await this.questGen.generate(config, this.llm, { generatedBy: 'Manual' });
                        break;
                    case 'WORLD_EXPANSION':
                        const spot = this.findAdjacentEmptySpot();
                        proposal = await this.roomGen.generate(config, this.llm, {
                            generatedBy: 'Manual',
                            x: spot?.x,
                            y: spot?.y,
                            existingNames: RoomRegistry.getInstance().getAllRooms().map(r => r.name)
                        });
                        break;
                    case 'EVENT':
                        await this.triggerWorldEvent(data.payload?.eventType || 'MOB_INVASION');
                        return; // Events handle themselves
                    default:
                        this.log(DirectorLogLevel.WARN, `Generator for ${data.type} not yet implemented.`);
                        return;
                }

                if (proposal) {
                    await this.processProposalAssets(proposal);
                    this.proposals.push(proposal);
                    this.log(DirectorLogLevel.INFO, `Draft created: ${proposal.type} - ${proposal.id}`);
                    this.adminNamespace.emit('director:proposals_update', this.proposals);
                }
            });

            socket.on('director:get_chunks', () => {
                const chunks = this.chunkSystem.getGeneratedChunks();
                this.log(DirectorLogLevel.INFO, `Sending chunks update: ${chunks.length} chunks`, chunks);
                socket.emit('director:chunks_update', chunks);
            });

            socket.on('director:generate_chunk', async (data: { x: number, y: number }) => {
                this.log(DirectorLogLevel.INFO, `Manual Chunk Generation requested for (${data.x}, ${data.y})`);
                await this.generateChunk(data.x, data.y);
                socket.emit('director:chunks_update', this.chunkSystem.getGeneratedChunks());
            });

            socket.on('director:delete_chunk', (data: { x: number, y: number }) => {
                this.log(DirectorLogLevel.INFO, `Chunk deletion requested for (${data.x}, ${data.y})`);
                if (this.chunkSystem.deleteChunk(data.x, data.y)) {
                    this.log(DirectorLogLevel.SUCCESS, `Chunk (${data.x}, ${data.y}) deleted.`);
                    this.adminNamespace.emit('director:chunks_update', this.chunkSystem.getGeneratedChunks());

                    // Also reload room registry to remove deleted rooms from memory
                    RoomRegistry.getInstance().reloadGeneratedRooms();
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete chunk (${data.x}, ${data.y}) (not found or error).`);
                }
            });

            // Item & NPC Management
            socket.on('director:get_items', () => {
                const items = ItemRegistry.getInstance().getAllItems();
                Logger.info('Director', `Admin ${socket.id} requested items. Found ${items.length} in registry.`);
                // Filter duplicates (since registry stores by id, name, shortName)
                const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                Logger.info('Director', `Sending ${uniqueItems.length} unique items to admin ${socket.id}.`);
                if (uniqueItems.length > 0) {
                    Logger.info('Director', `First item: ID=${uniqueItems[0].id}, Name=${uniqueItems[0].name}, ShortName=${uniqueItems[0].shortName}`);
                }
                socket.emit('director:items_update', uniqueItems);
            });

            socket.on('director:delete_item', (id: string) => {
                if (ItemRegistry.getInstance().deleteItem(id)) {
                    this.log(DirectorLogLevel.SUCCESS, `Deleted item: ${id}`);
                    const items = ItemRegistry.getInstance().getAllItems();
                    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                    this.adminNamespace.emit('director:items_update', uniqueItems);
                    CompendiumService.updateCompendium();
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete item: ${id}`);
                }
            });

            socket.on('director:update_item', (data: { id: string, updates: any }) => {
                if (ItemRegistry.getInstance().updateItem(data.id, data.updates)) {
                    this.log(DirectorLogLevel.SUCCESS, `Updated item: ${data.id}`);
                    const items = ItemRegistry.getInstance().getAllItems();
                    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                    this.adminNamespace.emit('director:items_update', uniqueItems);
                    CompendiumService.updateCompendium();
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to update item: ${data.id}`);
                }
            });

            socket.on('director:get_npcs', () => {
                const npcs = NPCRegistry.getInstance().getAllNPCs();
                Logger.info('Director', `Admin ${socket.id} requested NPCs. Found ${npcs.length} total.`);
                const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                Logger.info('Director', `Sending ${uniqueNPCs.length} unique NPCs to admin ${socket.id}.`);
                socket.emit('director:npcs_update', uniqueNPCs);
            });

            socket.on('director:delete_npc', (id: string) => {
                if (NPCRegistry.getInstance().deleteNPC(id)) {
                    this.log(DirectorLogLevel.SUCCESS, `Deleted NPC: ${id}`);
                    const npcs = NPCRegistry.getInstance().getAllNPCs();
                    const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                    this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                    CompendiumService.updateCompendium();
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete NPC: ${id}`);
                }
            });

            socket.on('director:update_npc', (data: { id: string, updates: any }) => {
                if (NPCRegistry.getInstance().updateNPC(data.id, data.updates)) {
                    this.log(DirectorLogLevel.SUCCESS, `Updated NPC: ${data.id}`);
                    const npcs = NPCRegistry.getInstance().getAllNPCs();
                    const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                    this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                    CompendiumService.updateCompendium();
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to update NPC: ${data.id}`);
                }
            });

            socket.on('director:generate_portrait', async (id: string) => {
                const npc = NPCRegistry.getInstance().getNPC(id);
                if (!npc) {
                    this.log(DirectorLogLevel.ERROR, `Cannot generate portrait: NPC ${id} not found.`);
                    return;
                }

                this.log(DirectorLogLevel.INFO, `Generating portrait for ${npc.name}...`);

                const prompt = `A cyberpunk style portrait of ${npc.name}, ${npc.description}. Role: ${npc.role}, Faction: ${npc.faction}. High quality, detailed, digital art.`;

                try {
                    const imageRes = await this.llm.generateImage(prompt);
                    const imageUrl = imageRes.url;
                    if (imageUrl) {
                        const filename = `${id}.jpg`;
                        const localPath = await ImageDownloader.downloadImage(imageUrl, filename);

                        if (localPath) {
                            if (NPCRegistry.getInstance().updateNPC(id, { portrait: localPath })) {
                                this.log(DirectorLogLevel.SUCCESS, `Portrait generated and saved for ${npc.name}`);
                                const npcs = NPCRegistry.getInstance().getAllNPCs();
                                const uniqueNPCs = Array.from(new Map(npcs.map(n => [n.id, n])).values());
                                this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                                CompendiumService.updateCompendium();
                            } else {
                                this.log(DirectorLogLevel.ERROR, `Failed to update NPC record for ${npc.name}`);
                            }
                        } else {
                            this.log(DirectorLogLevel.ERROR, `Failed to download generated image for ${npc.name}`);
                        }
                    } else {
                        this.log(DirectorLogLevel.ERROR, `LLM failed to generate image URL for ${npc.name}`);
                    }
                } catch (err) {
                    this.log(DirectorLogLevel.ERROR, `Error generating portrait for ${npc.name}: ${err}`);
                }
            });

            socket.on('director:spawn_roaming_npc', (id: string) => {
                this.log(DirectorLogLevel.INFO, `Spawning roaming NPC: ${id} at 10,10`);
                const npc = PrefabFactory.createNPC(id);
                if (npc) {
                    // Force position to 10,10
                    let pos = npc.getComponent(Position);
                    if (!pos) {
                        pos = new Position(10, 10);
                        npc.addComponent(pos);
                    } else {
                        pos.x = 10;
                        pos.y = 10;
                    }

                    // Force roaming behavior
                    const npcComp = npc.getComponent(NPC);
                    if (npcComp) {
                        npcComp.canMove = true;
                    }

                    // Add to engine
                    this.engine.addEntity(npc);
                    PrefabFactory.equipNPC(npc, this.engine);

                    this.log(DirectorLogLevel.SUCCESS, `Spawned roaming NPC ${id} at 10,10`);
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to spawn roaming NPC: ${id} (not found in registry)`);
                }
            });

            // Snapshot Management
            socket.on('snapshot:list', async () => {
                const list = await this.snapshots.listSnapshots();
                socket.emit('snapshot:list_update', list);
            });

            socket.on('snapshot:create', async (name?: string) => {
                try {
                    this.log(DirectorLogLevel.INFO, `Creating snapshot: ${name || 'manual'}...`);
                    await this.snapshots.createSnapshot(name);
                    this.log(DirectorLogLevel.SUCCESS, `Snapshot created successfully.`);

                    const list = await this.snapshots.listSnapshots();
                    this.adminNamespace.emit('snapshot:list_update', list);
                } catch (err) {
                    this.log(DirectorLogLevel.ERROR, `Failed to create snapshot: ${err}`);
                }
            });

            socket.on('snapshot:restore', async (id: string) => {
                try {
                    this.log(DirectorLogLevel.WARN, `RESTORING SNAPSHOT: ${id}. System will be temporarily unavailable.`);
                    await this.snapshots.restoreSnapshot(id);
                    this.log(DirectorLogLevel.SUCCESS, `Snapshot ${id} restored successfully. Server is RESTARTING to apply changes.`);
                    this.log(DirectorLogLevel.INFO, `System state restored to ${id}. Admin connection will drop momentarily.`);
                } catch (err) {
                    this.log(DirectorLogLevel.ERROR, `Failed to restore snapshot: ${err}`);
                }
            });
            socket.on('snapshot:delete', async (id: string) => {
                try {
                    await this.snapshots.deleteSnapshot(id);
                    this.log(DirectorLogLevel.SUCCESS, `Snapshot ${id} deleted.`);

                    const list = await this.snapshots.listSnapshots();
                    this.adminNamespace.emit('snapshot:list_update', list);
                } catch (err) {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete snapshot: ${err}`);
                }
            });

            // User Management
            socket.on('director:get_users', async () => {
                const { AuthService } = await import('../services/AuthService');
                const users = AuthService.getInstance().getAllUsers();
                socket.emit('director:users_update', users);
            });

            socket.on('director:update_user_role', async (data: { userId: number, role: string }) => {
                const { AuthService } = await import('../services/AuthService');
                if (AuthService.getInstance().updateUserRole(data.userId, data.role)) {
                    this.log(DirectorLogLevel.SUCCESS, `Updated user ${data.userId} role to ${data.role}`);
                    const users = AuthService.getInstance().getAllUsers();
                    this.adminNamespace.emit('director:users_update', users);
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to update user ${data.userId} role.`);
                }
            });

            socket.on('director:update_user_password', async (data: { userId: number, password: string }) => {
                const { AuthService } = await import('../services/AuthService');
                if (await AuthService.getInstance().updateUserPassword(data.userId, data.password)) {
                    this.log(DirectorLogLevel.SUCCESS, `Updated password for user ${data.userId}`);
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to update password for user ${data.userId}.`);
                }
            });

            socket.on('director:delete_user', async (userId: number) => {
                const { AuthService } = await import('../services/AuthService');
                if (AuthService.getInstance().deleteUser(userId)) {
                    this.log(DirectorLogLevel.SUCCESS, `Deleted user ${userId}`);
                    const users = AuthService.getInstance().getAllUsers();
                    this.adminNamespace.emit('director:users_update', users);
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete user ${userId}.`);
                }
            });

            // Character Management
            socket.on('director:get_characters', async () => {
                const { CharacterService } = await import('../services/CharacterService');
                const charService = CharacterService.getInstance();
                const characters = charService.getAllCharacters();

                const enriched = characters.map(c => ({
                    ...c,
                    online: !!charService.getActiveEntityByCharId(c.id, this.engine)
                }));

                socket.emit('director:characters_update', enriched);
            });

            socket.on('director:update_character_stats', async (data: { charId: number, stats: any, skills?: any, reputation?: any }) => {
                const { CharacterService } = await import('../services/CharacterService');
                const { Stats } = await import('../components/Stats');
                const { Reputation } = await import('../components/Reputation');

                const charService = CharacterService.getInstance();
                const activeEntity = charService.getActiveEntityByCharId(data.charId, this.engine);

                if (activeEntity) {
                    const statsComp = activeEntity.getComponent(Stats);
                    if (statsComp) {
                        // Attributes
                        for (const [key, value] of Object.entries(data.stats)) {
                            if (statsComp.attributes.has(key)) {
                                statsComp.attributes.get(key)!.value = Number(value);
                            }
                        }
                        // Skills
                        if (data.skills) {
                            for (const [key, value] of Object.entries(data.skills)) {
                                if (statsComp.skills.has(key)) {
                                    const skill = statsComp.skills.get(key)!;
                                    skill.level = Number(value);
                                    skill.maxUses = skill.level * 10;
                                } else {
                                    statsComp.addSkill(key, Number(value));
                                }
                            }
                        }
                    }

                    if (data.reputation) {
                        let repComp = activeEntity.getComponent(Reputation);
                        if (!repComp) {
                            repComp = new Reputation();
                            activeEntity.addComponent(repComp);
                        }
                        for (const [faction, value] of Object.entries(data.reputation)) {
                            repComp.factions.set(faction, Number(value));
                        }
                    }

                    this.log(DirectorLogLevel.SUCCESS, `Updated active data for character ${data.charId}`);
                } else {
                    const char = charService.getCharacterById(data.charId);
                    if (char) {
                        const jsonData = JSON.parse(char.data);
                        // Ensure components structure exists
                        if (!jsonData.components) jsonData.components = {};

                        const tempStats = new Stats();
                        if (jsonData.components.Stats) {
                            tempStats.fromJSON(jsonData.components.Stats);
                        }

                        // Attributes
                        for (const [key, value] of Object.entries(data.stats)) {
                            if (tempStats.attributes.has(key)) {
                                tempStats.attributes.get(key)!.value = Number(value);
                            }
                        }

                        // Skills
                        if (data.skills) {
                            for (const [key, value] of Object.entries(data.skills)) {
                                if (tempStats.skills.has(key)) {
                                    const skill = tempStats.skills.get(key)!;
                                    skill.level = Number(value);
                                    skill.maxUses = skill.level * 10;
                                } else {
                                    tempStats.addSkill(key, Number(value));
                                }
                            }
                        }

                        jsonData.components.Stats = tempStats.toJSON();

                        if (data.reputation) {
                            const tempRep = new Reputation();
                            if (jsonData.components.Reputation) {
                                tempRep.fromJSON(jsonData.components.Reputation);
                            }
                            for (const [faction, value] of Object.entries(data.reputation)) {
                                tempRep.factions.set(faction, Number(value));
                            }
                            jsonData.components.Reputation = tempRep.toJSON();
                        }

                        charService.saveCharacter(data.charId, jsonData);
                        this.log(DirectorLogLevel.SUCCESS, `Updated offline data for character ${data.charId}`);
                    } else {
                        this.log(DirectorLogLevel.ERROR, `Character ${data.charId} not found.`);
                    }
                }

                // Refresh list
                const characters = charService.getAllCharacters();
                const enriched = characters.map(c => ({
                    ...c,
                    online: !!charService.getActiveEntityByCharId(c.id, this.engine)
                }));
                socket.emit('director:characters_update', enriched);
            });

            socket.on('director:update_character_inventory', async (data: { charId: number, inventory: any }) => {
                const { CharacterService } = await import('../services/CharacterService');
                const { Inventory } = await import('../components/Inventory');
                const { Container } = await import('../components/Container');
                const { Item } = await import('../components/Item');
                const { PersistenceManager } = await import('../persistence/PersistenceManager');

                const charService = CharacterService.getInstance();
                const activeEntity = charService.getActiveEntityByCharId(data.charId, this.engine);

                if (activeEntity) {
                    // --- ACTIVE CHARACTER LOGIC ---
                    const inv = activeEntity.getComponent(Inventory);
                    if (!inv) {
                        this.log(DirectorLogLevel.ERROR, `Character ${data.charId} has no inventory component.`);
                        return;
                    }

                    const updateSlot = (currentId: string | null, newItemId: string | null, setFn: (id: string | null) => void) => {
                        if (currentId) this.engine.removeEntity(currentId);
                        if (newItemId) {
                            const newItem = PrefabFactory.createItem(newItemId);
                            if (newItem) {
                                this.engine.addEntity(newItem);
                                setFn(newItem.id);
                            } else setFn(null);
                        } else setFn(null);
                    };

                    // Hands
                    if (data.inventory.rightHand !== undefined) updateSlot(inv.rightHand, data.inventory.rightHand, (id) => inv.rightHand = id);
                    if (data.inventory.leftHand !== undefined) updateSlot(inv.leftHand, data.inventory.leftHand, (id) => inv.leftHand = id);

                    // Equipment
                    if (data.inventory.equipment) {
                        for (const [slot, itemId] of Object.entries(data.inventory.equipment)) {
                            const currentId = inv.equipment.get(slot) || null;
                            updateSlot(currentId, itemId as string, (id) => {
                                if (id) inv.equipment.set(slot, id);
                                else inv.equipment.delete(slot);
                            });
                        }
                    }

                    // Backpack
                    if (data.inventory.backpack) {
                        let backpackId = inv.equipment.get('back');
                        let backpack = backpackId ? this.engine.getEntity(backpackId) : null;

                        if (!backpack && (data.inventory.backpack as string[]).length > 0) {
                            const newBackpack = PrefabFactory.createItem('backpack');
                            if (newBackpack) {
                                this.engine.addEntity(newBackpack);
                                inv.equipment.set('back', newBackpack.id);
                                backpack = newBackpack;
                            }
                        }

                        if (backpack) {
                            const container = backpack.getComponent(Container);
                            if (container) {
                                for (const itemId of container.items) this.engine.removeEntity(itemId);
                                container.items = [];
                                for (const itemTemplateId of (data.inventory.backpack as string[])) {
                                    const newItem = PrefabFactory.createItem(itemTemplateId);
                                    if (newItem) {
                                        this.engine.addEntity(newItem);
                                        container.items.push(newItem.id);
                                    }
                                }
                            }
                        }
                    }
                    this.log(DirectorLogLevel.SUCCESS, `Updated active inventory for character ${data.charId}`);

                } else {
                    // --- OFFLINE CHARACTER LOGIC ---
                    const char = charService.getCharacterById(data.charId);
                    if (!char) {
                        this.log(DirectorLogLevel.ERROR, `Character ${data.charId} not found.`);
                        return;
                    }

                    const persistence = new PersistenceManager();
                    const jsonData = JSON.parse(char.data);
                    if (!jsonData.components) jsonData.components = {};

                    // Reconstruct Inventory Component
                    const tempInv = new Inventory();
                    if (jsonData.components.Inventory) tempInv.fromJSON(jsonData.components.Inventory);

                    const updateOfflineSlot = async (currentId: string | null, newItemId: string | null, setFn: (id: string | null) => void) => {
                        // In a real system we might delete the old entity from DB, but for now we just orphan it
                        if (newItemId) {
                            const newItem = PrefabFactory.createItem(newItemId);
                            if (newItem) {
                                await persistence.saveEntity(newItem.id, newItem.toJSON());
                                setFn(newItem.id);
                            } else setFn(null);
                        } else setFn(null);
                    };

                    // Hands
                    if (data.inventory.rightHand !== undefined) await updateOfflineSlot(tempInv.rightHand, data.inventory.rightHand, (id) => tempInv.rightHand = id);
                    if (data.inventory.leftHand !== undefined) await updateOfflineSlot(tempInv.leftHand, data.inventory.leftHand, (id) => tempInv.leftHand = id);

                    // Equipment
                    if (data.inventory.equipment) {
                        for (const [slot, itemId] of Object.entries(data.inventory.equipment)) {
                            const currentId = tempInv.equipment.get(slot) || null;
                            await updateOfflineSlot(currentId, itemId as string, (id) => {
                                if (id) tempInv.equipment.set(slot, id);
                                else tempInv.equipment.delete(slot);
                            });
                        }
                    }

                    // Backpack
                    if (data.inventory.backpack) {
                        let backpackId = tempInv.equipment.get('back');
                        // We need to fetch the backpack entity to update its container
                        let backpackData = backpackId ? await persistence.getEntity(backpackId) : null;

                        if (!backpackData && (data.inventory.backpack as string[]).length > 0) {
                            const newBackpack = PrefabFactory.createItem('backpack');
                            if (newBackpack) {
                                await persistence.saveEntity(newBackpack.id, newBackpack.toJSON());
                                tempInv.equipment.set('back', newBackpack.id);
                                backpackData = newBackpack.toJSON();
                            }
                        }

                        if (backpackData && backpackData.components && backpackData.components.Container) {
                            const container = new Container(0); // Size doesn't matter for reconstruction
                            container.fromJSON(backpackData.components.Container);

                            // Clear and rebuild items
                            container.items = [];
                            for (const itemTemplateId of (data.inventory.backpack as string[])) {
                                const newItem = PrefabFactory.createItem(itemTemplateId);
                                if (newItem) {
                                    await persistence.saveEntity(newItem.id, newItem.toJSON());
                                    container.items.push(newItem.id);
                                }
                            }

                            // Save updated backpack
                            backpackData.components.Container = container.toJSON();
                            await persistence.saveEntity(backpackData.id, backpackData);
                        }
                    }

                    // Save Character
                    jsonData.components.Inventory = tempInv.toJSON();
                    charService.saveCharacter(data.charId, jsonData);
                    this.log(DirectorLogLevel.SUCCESS, `Updated offline inventory for character ${data.charId}`);
                }
            });

            socket.on('director:get_character_inventory', async (charId: number) => {
                const { CharacterService } = await import('../services/CharacterService');
                const { Inventory } = await import('../components/Inventory');
                const { Container } = await import('../components/Container');
                const { Item } = await import('../components/Item');
                const { PersistenceManager } = await import('../persistence/PersistenceManager');

                const charService = CharacterService.getInstance();
                const activeEntity = charService.getActiveEntityByCharId(charId, this.engine);

                const resolveItemName = async (id: string | null, persistence?: any): Promise<string | null> => {
                    if (!id) return null;

                    const registry = ItemRegistry.getInstance();

                    // Try engine first
                    const entity = this.engine.getEntity(id);
                    if (entity) {
                        const item = entity.getComponent(Item);
                        if (!item) return null;

                        const templateId = item.templateId || registry.getItem(item.name)?.id || registry.getItem(item.shortName)?.id;
                        const result = templateId || item.shortName || item.name;

                        this.log(DirectorLogLevel.INFO, `Resolving item ${id} (Online): Found Item? Yes, templateId: ${item.templateId}, registryMatch: ${!!templateId}, result: ${result}`);
                        return result ? result.toLowerCase() : null;
                    }

                    // Try DB if persistence provided
                    if (persistence) {
                        const data = await persistence.getEntity(id);
                        if (data && data.components && data.components.Item) {
                            const itemData = data.components.Item;
                            const templateId = itemData.templateId || registry.getItem(itemData.name)?.id || registry.getItem(itemData.shortName)?.id;
                            const result = templateId || itemData.shortName || itemData.name;

                            this.log(DirectorLogLevel.INFO, `Resolving item ${id} (Offline): Found Item Data? Yes, templateId: ${itemData.templateId}, registryMatch: ${!!templateId}, result: ${result}`);
                            return result ? result.toLowerCase() : null;
                        } else {
                            this.log(DirectorLogLevel.WARN, `Resolving item ${id} (Offline): Entity or Item component not found.`);
                        }
                    }
                    return null;
                };

                const result: any = {
                    rightHand: null,
                    leftHand: null,
                    equipment: {},
                    backpack: []
                };

                if (activeEntity) {
                    const inv = activeEntity.getComponent(Inventory);
                    if (inv) {
                        result.rightHand = await resolveItemName(inv.rightHand);
                        result.leftHand = await resolveItemName(inv.leftHand);
                        for (const [slot, id] of inv.equipment.entries()) {
                            if (slot === 'back') continue;
                            const name = await resolveItemName(id);
                            if (name) result.equipment[slot] = name;
                        }
                        const backpackId = inv.equipment.get('back');
                        if (backpackId) {
                            const backpack = this.engine.getEntity(backpackId);
                            const container = backpack?.getComponent(Container);
                            if (container) {
                                for (const id of container.items) {
                                    const name = await resolveItemName(id);
                                    if (name) result.backpack.push(name);
                                }
                            }
                        }
                    }
                } else {
                    // Offline
                    const char = charService.getCharacterById(charId);
                    if (!char) {
                        socket.emit('director:character_inventory', { error: 'Character not found' });
                        return;
                    }

                    const persistence = new PersistenceManager();
                    const jsonData = JSON.parse(char.data);
                    if (jsonData.components && jsonData.components.Inventory) {
                        const tempInv = new Inventory();
                        tempInv.fromJSON(jsonData.components.Inventory);

                        result.rightHand = await resolveItemName(tempInv.rightHand, persistence);
                        result.leftHand = await resolveItemName(tempInv.leftHand, persistence);

                        for (const [slot, id] of tempInv.equipment.entries()) {
                            if (slot === 'back') continue;
                            const name = await resolveItemName(id, persistence);
                            if (name) result.equipment[slot] = name;
                        }

                        const backpackId = tempInv.equipment.get('back');
                        if (backpackId) {
                            const backpackData = await persistence.getEntity(backpackId);
                            if (backpackData && backpackData.components && backpackData.components.Container) {
                                const container = new Container(0);
                                container.fromJSON(backpackData.components.Container);
                                for (const id of container.items) {
                                    const name = await resolveItemName(id, persistence);
                                    if (name) result.backpack.push(name);
                                }
                            }
                        }
                    }
                }

                socket.emit('director:character_inventory', { charId, inventory: result });
            });
        });
    }

    private async generateChunk(cx: number, cy: number) {
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

    private async createAndPublishRoom(x: number, y: number, type: string, namePrefix: string) {
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

    private async processProposalAssets(proposal: any) {
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
