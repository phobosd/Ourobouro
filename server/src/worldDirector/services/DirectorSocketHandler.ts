import { Server, Socket } from 'socket.io';
import { Logger } from '../../utils/Logger';
import { WorldDirector } from '../Director';
import { DirectorLogLevel } from '../DirectorTypes';
import { ItemRegistry } from '../../services/ItemRegistry';
import { NPCRegistry } from '../../services/NPCRegistry';
import { RoomRegistry } from '../../services/RoomRegistry';
import { PrefabFactory } from '../../factories/PrefabFactory';
import { CompendiumService } from '../../services/CompendiumService';
import { Position } from '../../components/Position';
import { NPC } from '../../components/NPC';
import { Terminal } from '../../components/Terminal';
import { ImageDownloader } from '../../utils/ImageDownloader';
import { ProposalStatus, ProposalType } from '../../generation/proposals/schemas';

export class DirectorSocketHandler {
    private director: WorldDirector;
    private adminNamespace: any;

    constructor(director: WorldDirector, adminNamespace: any) {
        this.director = director;
        this.adminNamespace = adminNamespace;
    }

    public setup() {
        this.setupMiddleware();
        this.setupConnectionHandler();
    }

    private setupMiddleware() {
        this.adminNamespace.use(async (socket: Socket, next: (err?: any) => void) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                Logger.warn('Director', `Admin connection rejected: No token from ${socket.id}`);
                return next(new Error('Authentication error: No token provided'));
            }

            try {
                const { AuthService } = await import('../../services/AuthService');
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
    }

    private setupConnectionHandler() {
        this.adminNamespace.on('connection', (socket: Socket) => {
            Logger.info('Director', `Admin connected: ${socket.id}`);

            // Send current state
            try {
                Logger.info('Director', `Admin ${socket.id} - fetching status...`);
                const status = this.director.getStatus();
                Logger.info('Director', `Admin ${socket.id} - status fetched. Sending...`);
                socket.emit('director:status', status);
                Logger.info('Director', `Admin ${socket.id} - status sent.`);
            } catch (err) {
                Logger.error('Director', `Failed to get or send status to admin ${socket.id}:`, err);
            }

            // Send recent logs
            // Accessing private logs via public getter if needed, or we need to expose them.
            // For now, I'll assume I need to add a getter to Director or access it if I change visibility.
            // Since I'm refactoring, I should probably add a getLogs() to Director.
            // For this step, I'll assume getLogs() exists or I'll add it.
            if ((this.director as any).logs) {
                (this.director as any).logs.slice(-50).forEach((log: any) => socket.emit('director:log', log));
            }

            socket.on('director:pause', () => this.director.management.pause());
            socket.on('director:resume', () => this.director.management.resume());

            socket.on('director:update_personality', (update: any) => {
                this.director.management.updatePersonality(update);
            });

            socket.on('director:update_glitch_config', (config: any) => {
                this.director.management.updateGlitchConfig(config);
            });

            socket.on('director:update_ai_config', (config: any) => {
                this.director.management.updateAIConfig(config);
            });

            socket.on('director:update_guardrail', (update: any) => {
                const dir = this.director as any;
                const config = JSON.parse(JSON.stringify(dir.guardrails.getConfig()));

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
                }
                dir.guardrails.saveConfig(config);
                dir.log(DirectorLogLevel.INFO, `Guardrails updated: ${JSON.stringify(update)}`);
                this.adminNamespace.emit('director:status', this.director.getStatus());
            });

            socket.on('director:approve_proposal', async (id: string) => {
                // Logic extraction
                const dir = this.director as any;
                const proposal = dir.proposals.find((p: any) => p.id === id);
                if (proposal) {
                    try {
                        proposal.status = ProposalStatus.APPROVED;
                        // publisher is private
                        const filePath = await dir.publisher.publish(proposal);
                        dir.log(DirectorLogLevel.SUCCESS, `Proposal PUBLISHED: ${proposal.type} -> ${filePath}`);

                        if (proposal.type === ProposalType.NPC) {
                            NPCRegistry.getInstance().reloadGeneratedNPCs();
                            this.adminNamespace.emit('director:npcs_update', this.director.management.getNPCs());
                            dir.log(DirectorLogLevel.SUCCESS, `NPC registry reloaded. NPC ${proposal.payload.name} is now available.`);
                        }

                        if (proposal.type === ProposalType.ITEM) {
                            ItemRegistry.getInstance().reloadGeneratedItems();
                            this.adminNamespace.emit('director:items_update', this.director.management.getItems());
                            dir.log(DirectorLogLevel.SUCCESS, `Item registry reloaded. Item ${proposal.payload.name} is now available.`);
                        }

                        if (proposal.type === ProposalType.WORLD_EXPANSION) {
                            const roomEntity = PrefabFactory.createRoom(proposal.payload.id);
                            if (roomEntity) {
                                // engine is private
                                dir.engine.addEntity(roomEntity);
                                dir.log(DirectorLogLevel.SUCCESS, `Spawned new room: ${proposal.payload.name}`);

                                const pos = roomEntity.getComponent(Position);
                                if (pos) {
                                    const npcType = 'street vendor';
                                    const npc = PrefabFactory.createNPC(npcType);
                                    if (npc) {
                                        npc.addComponent(new Position(pos.x, pos.y));
                                        dir.engine.addEntity(npc);
                                        PrefabFactory.equipNPC(npc, dir.engine);
                                        dir.log(DirectorLogLevel.INFO, `Spawned ${npcType} in new room.`);
                                    }
                                }
                            }
                        }

                        // io is private
                        dir.io.emit('autocomplete-data', {
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

                        dir.proposals = dir.proposals.filter((p: any) => p.id !== id);
                        this.adminNamespace.emit('director:proposals_update', dir.proposals);
                    } catch (err) {
                        dir.log(DirectorLogLevel.ERROR, `Failed to publish proposal: ${err}`);
                    }
                }
            });

            socket.on('director:reject_proposal', (id: string) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.WARN, `Proposal REJECTED: ${id}`);
                dir.proposals = dir.proposals.filter((p: any) => p.id !== id);
                this.adminNamespace.emit('director:proposals_update', dir.proposals);
            });

            socket.on('director:stop_event', (eventId: string) => {
                if (this.director.content.stopEvent(eventId)) {
                    this.adminNamespace.emit('director:status', this.director.getStatus());
                }
            });

            socket.on('director:manual_trigger', async (data: { type: string, payload?: any, enableLLM?: boolean }) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.INFO, `Manual trigger received: ${data.type} (LLM: ${data.enableLLM})`);

                let proposal;
                const config = dir.guardrails.getConfig();

                switch (data.type) {
                    case 'NPC':
                        proposal = await dir.npcGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            enableLLM: data.enableLLM,
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'MOB':
                        proposal = await dir.npcGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            subtype: 'MOB',
                            enableLLM: data.enableLLM,
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'FRIENDLY':
                        proposal = await dir.npcGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            subtype: 'FRIENDLY',
                            enableLLM: data.enableLLM,
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'BOSS':
                        proposal = await this.director.content.generateBoss(data.enableLLM);
                        break;
                    case 'ITEM':
                        proposal = await dir.itemGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            ...data.payload,
                            existingNames: ItemRegistry.getInstance().getAllItems().map(i => i.name)
                        });
                        break;
                    case 'QUEST':
                        proposal = await dir.questGen.generate(config, dir.llm, { generatedBy: 'Manual' });
                        break;
                    case 'WORLD_EXPANSION':
                        const spot = this.director.automation.findAdjacentEmptySpot();
                        proposal = await dir.roomGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            x: spot?.x,
                            y: spot?.y,
                            existingNames: RoomRegistry.getInstance().getAllRooms().map(r => r.name)
                        });
                        break;
                    case 'EVENT':
                        await this.director.content.triggerWorldEvent(data.payload?.eventType || 'MOB_INVASION');
                        return;
                    case 'TRAVELING_MERCHANT':
                        await this.director.content.triggerWorldEvent('TRAVELING_MERCHANT', true);
                        return;
                    case 'DATA_COURIER':
                        await this.director.content.triggerWorldEvent('DATA_COURIER', true);
                        return;
                    case 'SCAVENGER_HUNT':
                        await this.director.content.triggerWorldEvent('SCAVENGER_HUNT', true);
                        return;
                    default:
                        dir.log(DirectorLogLevel.WARN, `Generator for ${data.type} not yet implemented.`);
                        return;
                }

                if (proposal) {
                    await this.director.content.processProposalAssets(proposal);
                    dir.proposals.push(proposal);
                    dir.log(DirectorLogLevel.INFO, `Draft created: ${proposal.type} - ${proposal.id}`);
                    this.adminNamespace.emit('director:proposals_update', dir.proposals);
                }
            });

            socket.on('director:get_chunks', () => {
                const dir = this.director as any;
                const chunks = dir.chunkSystem.getGeneratedChunks();
                dir.log(DirectorLogLevel.INFO, `Sending chunks update: ${chunks.length} chunks`, chunks);
                socket.emit('director:chunks_update', chunks);
            });

            socket.on('director:generate_chunk', async (data: { x: number, y: number }) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.INFO, `Manual Chunk Generation requested for (${data.x}, ${data.y})`);
                await this.director.content.generateChunk(data.x, data.y);
                socket.emit('director:chunks_update', dir.chunkSystem.getGeneratedChunks());
            });

            socket.on('director:delete_chunk', (data: { x: number, y: number }) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.INFO, `Chunk deletion requested for (${data.x}, ${data.y})`);
                if (dir.chunkSystem.deleteChunk(data.x, data.y)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Chunk (${data.x}, ${data.y}) deleted.`);
                    this.adminNamespace.emit('director:chunks_update', dir.chunkSystem.getGeneratedChunks());
                    RoomRegistry.getInstance().reloadGeneratedRooms();
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to delete chunk (${data.x}, ${data.y}) (not found or error).`);
                }
            });

            // Item & NPC Management
            socket.on('director:get_items', () => {
                socket.emit('director:items_update', this.director.management.getItems());
            });

            socket.on('director:delete_item', (id: string) => {
                this.director.management.deleteItem(id);
            });

            socket.on('director:update_item', (data: { id: string, updates: any }) => {
                this.director.management.updateItem(data.id, data.updates);
            });

            socket.on('director:get_npcs', () => {
                socket.emit('director:npcs_update', this.director.management.getNPCs());
            });

            socket.on('director:delete_npc', (id: string) => {
                this.director.management.deleteNPC(id);
            });

            socket.on('director:update_npc', (data: { id: string, updates: any }) => {
                this.director.management.updateNPC(data.id, data.updates);
            });

            socket.on('director:get_npc_status', () => {
                socket.emit('director:npc_status_update', this.director.management.getNPCStatus());
            });

            socket.on('director:generate_portrait', async (id: string) => {
                await this.director.management.generatePortrait(id);
            });

            socket.on('director:spawn_roaming_npc', (id: string) => {
                this.director.management.spawnRoamingNPC(id);
            });

            // Snapshot Management
            socket.on('snapshot:list', async () => {
                const list = await this.director.snapshotManager.listSnapshots();
                socket.emit('snapshot:list_update', list);
            });

            socket.on('snapshot:create', async (name?: string) => {
                await this.director.snapshotManager.createSnapshot(name);
            });

            socket.on('snapshot:restore', async (id: string) => {
                await this.director.snapshotManager.restoreSnapshot(id);
            });

            socket.on('snapshot:delete', async (id: string) => {
                await this.director.snapshotManager.deleteSnapshot(id);
            });

            // User Management
            socket.on('director:get_users', async () => {
                socket.emit('director:users_update', this.director.management.getUsers());
            });

            socket.on('director:update_user_role', async (data: { userId: number, role: string }) => {
                this.director.management.updateUserRole(data.userId, data.role);
            });

            socket.on('director:update_user_password', async (data: { userId: number, password: string }) => {
                await this.director.management.updateUserPassword(data.userId, data.password);
            });

            socket.on('director:delete_user', async (userId: number) => {
                this.director.management.deleteUser(userId);
            });

            // Character Management
            socket.on('director:get_characters', async () => {
                socket.emit('director:characters_update', this.director.management.getCharacters());
            });

            socket.on('director:update_character_stats', async (data: { charId: number, stats: any, skills?: any, reputation?: any }) => {
                this.director.management.updateCharacterStats(data.charId, data.stats, data.skills, data.reputation);
            });

            socket.on('director:get_character_inventory', (charId: number) => {
                const inventory = this.director.management.getCharacterInventory(charId);
                socket.emit('director:character_inventory', { charId, inventory });
            });

            socket.on('director:update_character_inventory', async (data: { charId: number, inventory: any }) => {
                this.director.management.updateCharacterInventory(data.charId, data.inventory);
            });

            socket.on('director:delete_npc_memory', (data: { npcId: string, index: number, type: 'short' | 'long' }) => {
                this.director.management.deleteNPCMemory(data.npcId, data.index, data.type);
            });
        });
    }
}
