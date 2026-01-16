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
import { Engine } from '../ecs/Engine';
import { ChunkSystem } from '../world/ChunkSystem';
import * as fs from 'fs';
import * as path from 'path';
import { Position } from '../components/Position';
import { Loot } from '../components/Loot';
import { NPC } from '../components/NPC';
import { ImageDownloader } from '../utils/ImageDownloader';

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
    private personality = {
        chaos: { value: 0.2, enabled: true },
        aggression: { value: 0.3, enabled: true },
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

        // Initialize Generators
        this.npcGen = new NPCGenerator();
        this.itemGen = new ItemGenerator();
        this.questGen = new QuestGenerator();
        this.roomGen = new RoomGenerator();

        this.loadConfig();
        this.setupAdminSocket();

        // Listen for config changes (manual file edits)
        this.guardrails.onUpdate((config) => {
            this.llm.updateConfig(config.llmProfiles);
            this.log(DirectorLogLevel.INFO, 'LLM Profiles re-synced from disk.');
            this.adminNamespace.emit('director:status', this.getStatus());
        });

        this.log(DirectorLogLevel.INFO, 'World Director initialized and standby.');

        // Start the automation loop (it will respect isPaused)
        this.startAutomationLoop();
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

    public pause() {
        this.isPaused = true;
        this.log(DirectorLogLevel.WARN, 'Director PAUSED.');
        this.adminNamespace.emit('director:status', this.getStatus());
    }

    public resume() {
        this.isPaused = false;
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

    public async generateBoss() {
        this.log(DirectorLogLevel.INFO, 'Generating BOSS...');
        try {
            const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, { generatedBy: 'Manual', subtype: 'BOSS' });
            if (proposal && proposal.payload) {
                const payload = proposal.payload as NPCPayload;
                payload.tags = ['boss', 'aggressive'];
                payload.behavior = 'aggressive';
                // Boost stats for boss (World Boss scaling)
                payload.stats.health = (payload.stats.health || 100) * 5;
                payload.stats.attack = (payload.stats.attack || 10) * 2;
                payload.stats.defense = (payload.stats.defense || 5) * 2;

                // Generate Legendary Loot for Boss
                const itemProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, { subtype: 'LEGENDARY' });
                if (itemProposal && itemProposal.payload) {
                    // Auto-approve the item so it exists in the registry for the boss to "hold"
                    itemProposal.status = ProposalStatus.APPROVED;
                    await this.publisher.publish(itemProposal);
                    ItemRegistry.getInstance().reloadGeneratedItems();

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

    public async triggerWorldEvent(eventType: string) {
        this.log(DirectorLogLevel.INFO, `Triggering World Event: ${eventType}`);

        if (eventType === 'MOB_INVASION') {
            // Spawn 10-20 mobs in random locations
            const mobCount = 10 + Math.floor(Math.random() * 10);
            this.log(DirectorLogLevel.WARN, `⚠️ MOB INVASION DETECTED! Spawning ${mobCount} entities...`);

            this.io.emit('message', {
                type: 'system',
                content: `\n\n[WARNING] SYSTEM BREACH DETECTED. MASSIVE BIOLOGICAL SIGNATURES INBOUND.\n`
            });

            for (let i = 0; i < mobCount; i++) {
                try {
                    // Quick generation without proposals for events
                    const proposal = await this.npcGen.generate(this.guardrails.getConfig(), this.llm, { generatedBy: 'Event:Invasion', subtype: 'MOB' });
                    if (proposal && proposal.payload) {
                        const payload = proposal.payload as NPCPayload;
                        payload.tags = ['invasion_mob', 'aggressive'];
                        payload.behavior = 'aggressive';

                        // Auto-publish/spawn
                        proposal.status = ProposalStatus.APPROVED;
                        await this.publisher.publish(proposal);
                        NPCRegistry.getInstance().reloadGeneratedNPCs();

                        // Spawn in a random room (simplified logic: pick random coordinates)
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

                            // 20% chance for rare loot on invasion mobs
                            if (Math.random() < 0.2) {
                                const itemProposal = await this.itemGen.generate(this.guardrails.getConfig(), this.llm, { subtype: 'RARE' });
                                if (itemProposal && itemProposal.payload) {
                                    itemProposal.status = ProposalStatus.APPROVED;
                                    await this.publisher.publish(itemProposal);
                                    ItemRegistry.getInstance().reloadGeneratedItems();
                                    const itemEntity = PrefabFactory.createItem(itemProposal.payload.id);
                                    if (itemEntity) {
                                        this.engine.addEntity(itemEntity);
                                        npcEntity.addComponent(new Loot([itemEntity.id]));
                                        this.log(DirectorLogLevel.SUCCESS, `Added RARE loot to invasion mob.`);
                                    }
                                }
                            }

                            this.engine.addEntity(npcEntity);
                            this.log(DirectorLogLevel.SUCCESS, `Spawned invasion mob at ${x},${y}`);
                        }
                    }
                } catch (err) {
                    Logger.error('Director', `Failed to spawn invasion mob: ${err}`);
                }
            }
        }
    }

    public getStatus() {
        return {
            paused: this.isPaused,
            personality: this.personality,
            glitchConfig: this.glitchConfig, // Expose config
            guardrails: this.guardrails.getConfig(),
            proposals: this.proposals
        };
    }

    private loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                const config = JSON.parse(data);
                if (config.glitchConfig) {
                    this.glitchConfig = { ...this.glitchConfig, ...config.glitchConfig };
                    Logger.info('Director', 'Loaded configuration from disk.');
                }
            }
        } catch (err) {
            Logger.error('Director', `Failed to load config: ${err}`);
        }
    }

    private saveConfig() {
        try {
            const config = {
                glitchConfig: this.glitchConfig
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 4));
            Logger.info('Director', 'Saved configuration to disk.');
        } catch (err) {
            Logger.error('Director', `Failed to save config: ${err}`);
        }
    }

    private startAutomationLoop() {
        if (this.automationInterval) clearInterval(this.automationInterval);

        this.automationInterval = setInterval(async () => {
            if (this.isPaused) return;

            // Random Event Trigger (if Aggression is high)
            if (this.personality.aggression.enabled && Math.random() < (this.personality.aggression.value * 0.01)) { // 1% chance per tick scaled by aggression
                await this.triggerWorldEvent('MOB_INVASION');
            }

        }, 10000); // Check every 10 seconds
    }

    private setupAdminSocket() {
        this.adminNamespace.on('connection', (socket: Socket) => {
            Logger.info('Director', `Admin connected: ${socket.id}`);

            // Send current state
            socket.emit('director:status', this.getStatus());

            // Send recent logs
            this.logs.slice(-50).forEach(log => socket.emit('director:log', log));

            socket.on('director:pause', () => this.pause());
            socket.on('director:resume', () => this.resume());

            socket.on('director:update_personality', (update: any) => {
                if (update.chaos !== undefined) this.personality.chaos = { ...this.personality.chaos, ...update.chaos };
                if (update.aggression !== undefined) this.personality.aggression = { ...this.personality.aggression, ...update.aggression };
                if (update.expansion !== undefined) this.personality.expansion = { ...this.personality.expansion, ...update.expansion };

                this.log(DirectorLogLevel.INFO, `Personality updated: ${JSON.stringify(this.personality)}`);
                this.adminNamespace.emit('director:status', this.getStatus());
            });

            socket.on('director:update_glitch_config', (config: any) => {
                this.glitchConfig = { ...this.glitchConfig, ...config };
                this.saveConfig();
                this.log(DirectorLogLevel.INFO, 'Glitch Door configuration updated.');
                this.adminNamespace.emit('director:status', this.getStatus());
            });

            socket.on('director:update_guardrail', (update: any) => {
                const config = this.guardrails.getConfig();
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
                    this.llm.updateConfig(config.llmProfiles);
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
                            // Spawn the new room immediately
                            const roomEntity = PrefabFactory.createRoom(proposal.payload.id);
                            if (roomEntity) {
                                this.engine.addEntity(roomEntity);
                                this.log(DirectorLogLevel.SUCCESS, `Spawned new room: ${proposal.payload.name}`);

                                // Spawn a random NPC in the new room
                                const pos = roomEntity.getComponent(Position);
                                if (pos) {
                                    const npcType = Math.random() > 0.5 ? 'street samurai' : 'cyber thug';
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
                        proposal = await this.roomGen.generate(config, this.llm, {
                            generatedBy: 'Manual',
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
                // Filter duplicates (since registry stores by id, name, shortName)
                const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                socket.emit('director:items_update', uniqueItems);
            });

            socket.on('director:delete_item', (id: string) => {
                if (ItemRegistry.getInstance().deleteItem(id)) {
                    this.log(DirectorLogLevel.SUCCESS, `Deleted item: ${id}`);
                    const items = ItemRegistry.getInstance().getAllItems();
                    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                    this.adminNamespace.emit('director:items_update', uniqueItems);
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
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to update item: ${data.id}`);
                }
            });

            socket.on('director:get_npcs', () => {
                const npcs = NPCRegistry.getInstance().getAllNPCs();
                this.log(DirectorLogLevel.INFO, `Client requested NPCs. Found ${npcs.length} total.`);
                const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                this.log(DirectorLogLevel.INFO, `Sending ${uniqueNPCs.length} unique NPCs.`);
                socket.emit('director:npcs_update', uniqueNPCs);
            });

            socket.on('director:delete_npc', (id: string) => {
                if (NPCRegistry.getInstance().deleteNPC(id)) {
                    this.log(DirectorLogLevel.SUCCESS, `Deleted NPC: ${id}`);
                    const npcs = NPCRegistry.getInstance().getAllNPCs();
                    const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                    this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                } else {
                    this.log(DirectorLogLevel.ERROR, `Failed to delete NPC: ${id}`);
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
                    const imageUrl = await this.llm.generateImage(prompt);
                    if (imageUrl) {
                        const filename = `${id}.jpg`;
                        const localPath = await ImageDownloader.downloadImage(imageUrl, filename);

                        if (localPath) {
                            if (NPCRegistry.getInstance().updateNPC(id, { portrait: localPath })) {
                                this.log(DirectorLogLevel.SUCCESS, `Portrait generated and saved for ${npc.name}`);
                                const npcs = NPCRegistry.getInstance().getAllNPCs();
                                const uniqueNPCs = Array.from(new Map(npcs.map(n => [n.id, n])).values());
                                this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
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
                    this.log(DirectorLogLevel.SUCCESS, `Snapshot ${id} restored successfully. RESTARTING REGISTRIES.`);

                    // Reload all registries after restore
                    ItemRegistry.getInstance().reloadGeneratedItems();
                    NPCRegistry.getInstance().reloadGeneratedNPCs();
                    RoomRegistry.getInstance().reloadGeneratedRooms();

                    this.log(DirectorLogLevel.INFO, `System state restored to ${id}.`);
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
                forceX: x,
                forceY: y
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
}
