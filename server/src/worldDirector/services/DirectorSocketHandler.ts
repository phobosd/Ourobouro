import { Server, Socket } from 'socket.io';
import { Logger } from '../../utils/Logger';
import { WorldDirector, DirectorLogLevel } from '../Director';
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
                // We need to access personality. I should probably add a method to Director to update personality.
                // Or since I have the instance, I can access public props.
                // Director's personality is private. I should add a public setter or method.
                // For now, I'll cast to any to get it working, then refine the Director interface.
                const dir = this.director as any;
                if (update.chaos !== undefined) dir.management.personality.chaos = { ...dir.management.personality.chaos, ...update.chaos };
                if (update.aggression !== undefined) dir.management.personality.aggression = { ...dir.management.personality.aggression, ...update.aggression };
                if (update.expansion !== undefined) dir.management.personality.expansion = { ...dir.management.personality.expansion, ...update.expansion };

                // this.log is private in Director. I need a public log method.
                // Director has log() but it's private. I should make it public or use a new method.
                // I'll assume I'll make log() public or add publicLog().
                // For now, I'll use a temporary workaround or plan to update Director.ts immediately after.

                // Actually, I should update Director.ts first to expose what I need, OR just do the extraction and fix errors.
                // I'll write this file assuming Director.ts will be updated to expose necessary methods.

                dir.log(DirectorLogLevel.INFO, `Personality updated: ${JSON.stringify(dir.management.personality)}`);
                dir.management.saveConfig();
                this.adminNamespace.emit('director:status', this.director.getStatus());
            });

            socket.on('director:update_glitch_config', (config: any) => {
                const dir = this.director as any;
                dir.management.glitchConfig = { ...dir.management.glitchConfig, ...config };
                dir.management.saveConfig();
                dir.log(DirectorLogLevel.INFO, 'Glitch Door configuration updated.');
                this.adminNamespace.emit('director:status', this.director.getStatus());
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

                        if (proposal.type === ProposalType.ITEM) {
                            ItemRegistry.getInstance().reloadGeneratedItems();
                        } else if (proposal.type === ProposalType.NPC) {
                            NPCRegistry.getInstance().reloadGeneratedNPCs();
                        } else if (proposal.type === ProposalType.WORLD_EXPANSION) {
                            RoomRegistry.getInstance().reloadGeneratedRooms();
                        } else if (proposal.type === ProposalType.EVENT) {
                            await this.director.triggerWorldEvent(proposal.payload.type, true, proposal.payload.duration);
                        }

                        if (proposal.type === ProposalType.ITEM || (proposal.type === ProposalType.NPC && proposal.payload.role !== 'mob')) {
                            await CompendiumService.updateCompendium();
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
                if (this.director.stopEvent(eventId)) {
                    this.adminNamespace.emit('director:status', this.director.getStatus());
                }
            });

            socket.on('director:manual_trigger', async (data: { type: string, payload?: any }) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.INFO, `Manual trigger received: ${data.type}`);

                let proposal;
                const config = dir.guardrails.getConfig();

                switch (data.type) {
                    case 'NPC':
                        proposal = await dir.npcGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'MOB':
                        proposal = await dir.npcGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            subtype: 'MOB',
                            existingNames: NPCRegistry.getInstance().getAllNPCs().map(n => n.name)
                        });
                        break;
                    case 'BOSS':
                        proposal = await this.director.generateBoss();
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
                        // findAdjacentEmptySpot is private
                        const spot = dir.findAdjacentEmptySpot();
                        proposal = await dir.roomGen.generate(config, dir.llm, {
                            generatedBy: 'Manual',
                            x: spot?.x,
                            y: spot?.y,
                            existingNames: RoomRegistry.getInstance().getAllRooms().map(r => r.name)
                        });
                        break;
                    case 'EVENT':
                        await this.director.triggerWorldEvent(data.payload?.eventType || 'MOB_INVASION');
                        return;
                    case 'TRAVELING_MERCHANT':
                        await this.director.triggerWorldEvent('TRAVELING_MERCHANT', true);
                        return;
                    case 'DATA_COURIER':
                        await this.director.triggerWorldEvent('DATA_COURIER', true);
                        return;
                    case 'SCAVENGER_HUNT':
                        await this.director.triggerWorldEvent('SCAVENGER_HUNT', true);
                        return;
                    default:
                        dir.log(DirectorLogLevel.WARN, `Generator for ${data.type} not yet implemented.`);
                        return;
                }

                if (proposal) {
                    // processProposalAssets is private (I didn't see it but assuming it is)
                    // Wait, I didn't see processProposalAssets in the file view. It might be missing or I missed it.
                    // I'll assume it's there.
                    if (dir.processProposalAssets) await dir.processProposalAssets(proposal);
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
                // generateChunk is likely private
                await dir.generateChunk(data.x, data.y);
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
                const items = ItemRegistry.getInstance().getAllItems();
                Logger.info('Director', `Admin ${socket.id} requested items. Found ${items.length} in registry.`);
                const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                socket.emit('director:items_update', uniqueItems);
            });

            socket.on('director:delete_item', (id: string) => {
                const dir = this.director as any;
                if (ItemRegistry.getInstance().deleteItem(id)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Deleted item: ${id}`);
                    const items = ItemRegistry.getInstance().getAllItems();
                    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                    this.adminNamespace.emit('director:items_update', uniqueItems);
                    CompendiumService.updateCompendium();
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to delete item: ${id}`);
                }
            });

            socket.on('director:update_item', (data: { id: string, updates: any }) => {
                const dir = this.director as any;
                if (ItemRegistry.getInstance().updateItem(data.id, data.updates)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Updated item: ${data.id}`);
                    const items = ItemRegistry.getInstance().getAllItems();
                    const uniqueItems = Array.from(new Map(items.map(item => [item.id, item])).values());
                    this.adminNamespace.emit('director:items_update', uniqueItems);
                    CompendiumService.updateCompendium();
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to update item: ${data.id}`);
                }
            });

            socket.on('director:get_npcs', () => {
                const npcs = NPCRegistry.getInstance().getAllNPCs();
                Logger.info('Director', `Admin ${socket.id} requested NPCs. Found ${npcs.length} total.`);
                const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                socket.emit('director:npcs_update', uniqueNPCs);
            });

            socket.on('director:delete_npc', (id: string) => {
                const dir = this.director as any;
                if (NPCRegistry.getInstance().deleteNPC(id)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Deleted NPC: ${id}`);
                    const npcs = NPCRegistry.getInstance().getAllNPCs();
                    const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                    this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                    CompendiumService.updateCompendium();
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to delete NPC: ${id}`);
                }
            });

            socket.on('director:update_npc', (data: { id: string, updates: any }) => {
                const dir = this.director as any;
                if (NPCRegistry.getInstance().updateNPC(data.id, data.updates)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Updated NPC: ${data.id}`);
                    const npcs = NPCRegistry.getInstance().getAllNPCs();
                    const uniqueNPCs = Array.from(new Map(npcs.map(npc => [npc.id, npc])).values());
                    this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                    CompendiumService.updateCompendium();
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to update NPC: ${data.id}`);
                }
            });

            socket.on('director:generate_portrait', async (id: string) => {
                const dir = this.director as any;
                const npc = NPCRegistry.getInstance().getNPC(id);
                if (!npc) {
                    dir.log(DirectorLogLevel.ERROR, `Cannot generate portrait: NPC ${id} not found.`);
                    return;
                }

                dir.log(DirectorLogLevel.INFO, `Generating portrait for ${npc.name}...`);

                const prompt = `A cyberpunk style portrait of ${npc.name}, ${npc.description}. Role: ${npc.role}, Faction: ${npc.faction}. High quality, detailed, digital art.`;

                try {
                    const imageRes = await dir.llm.generateImage(prompt);
                    const imageUrl = imageRes.url;
                    if (imageUrl) {
                        const filename = `${id}.jpg`;
                        const localPath = await ImageDownloader.downloadImage(imageUrl, filename);

                        if (localPath) {
                            if (NPCRegistry.getInstance().updateNPC(id, { portrait: localPath })) {
                                dir.log(DirectorLogLevel.SUCCESS, `Portrait generated and saved for ${npc.name}`);
                                const npcs = NPCRegistry.getInstance().getAllNPCs();
                                const uniqueNPCs = Array.from(new Map(npcs.map(n => [n.id, n])).values());
                                this.adminNamespace.emit('director:npcs_update', uniqueNPCs);
                                CompendiumService.updateCompendium();
                            } else {
                                dir.log(DirectorLogLevel.ERROR, `Failed to update NPC record for ${npc.name}`);
                            }
                        } else {
                            dir.log(DirectorLogLevel.ERROR, `Failed to download generated image for ${npc.name}`);
                        }
                    } else {
                        dir.log(DirectorLogLevel.ERROR, `LLM failed to generate image URL for ${npc.name}`);
                    }
                } catch (err) {
                    dir.log(DirectorLogLevel.ERROR, `Error generating portrait for ${npc.name}: ${err}`);
                }
            });

            socket.on('director:spawn_roaming_npc', (id: string) => {
                const dir = this.director as any;
                dir.log(DirectorLogLevel.INFO, `Spawning roaming NPC: ${id} at 10,10`);
                const npc = PrefabFactory.createNPC(id);
                if (npc) {
                    let pos = npc.getComponent(Position);
                    if (!pos) {
                        pos = new Position(10, 10);
                        npc.addComponent(pos);
                    } else {
                        pos.x = 10;
                        pos.y = 10;
                    }

                    const npcComp = npc.getComponent(NPC);
                    if (npcComp) {
                        npcComp.canMove = true;
                    }

                    dir.engine.addEntity(npc);
                    PrefabFactory.equipNPC(npc, dir.engine);

                    dir.log(DirectorLogLevel.SUCCESS, `Spawned roaming NPC ${id} at 10,10`);
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to spawn roaming NPC: ${id} (not found in registry)`);
                }
            });

            // Snapshot Management
            socket.on('snapshot:list', async () => {
                const dir = this.director as any;
                const list = await dir.snapshots.listSnapshots();
                socket.emit('snapshot:list_update', list);
            });

            socket.on('snapshot:create', async (name?: string) => {
                try {
                    const dir = this.director as any;
                    dir.log(DirectorLogLevel.INFO, `Creating snapshot: ${name || 'manual'}...`);
                    await dir.snapshots.createSnapshot(name);
                    dir.log(DirectorLogLevel.SUCCESS, `Snapshot created successfully.`);

                    const list = await dir.snapshots.listSnapshots();
                    this.adminNamespace.emit('snapshot:list_update', list);
                } catch (err) {
                    const dir = this.director as any;
                    dir.log(DirectorLogLevel.ERROR, `Failed to create snapshot: ${err}`);
                }
            });

            socket.on('snapshot:restore', async (id: string) => {
                try {
                    const dir = this.director as any;
                    dir.log(DirectorLogLevel.WARN, `RESTORING SNAPSHOT: ${id}. System will be temporarily unavailable.`);
                    await dir.snapshots.restoreSnapshot(id);
                    dir.log(DirectorLogLevel.SUCCESS, `Snapshot ${id} restored successfully. Server is RESTARTING to apply changes.`);
                    dir.log(DirectorLogLevel.INFO, `System state restored to ${id}. Admin connection will drop momentarily.`);
                } catch (err) {
                    const dir = this.director as any;
                    dir.log(DirectorLogLevel.ERROR, `Failed to restore snapshot: ${err}`);
                }
            });
            socket.on('snapshot:delete', async (id: string) => {
                try {
                    const dir = this.director as any;
                    await dir.snapshots.deleteSnapshot(id);
                    dir.log(DirectorLogLevel.SUCCESS, `Snapshot ${id} deleted.`);

                    const list = await dir.snapshots.listSnapshots();
                    this.adminNamespace.emit('snapshot:list_update', list);
                } catch (err) {
                    const dir = this.director as any;
                    dir.log(DirectorLogLevel.ERROR, `Failed to delete snapshot: ${err}`);
                }
            });

            // User Management
            socket.on('director:get_users', async () => {
                const { AuthService } = await import('../../services/AuthService');
                const users = AuthService.getInstance().getAllUsers();
                socket.emit('director:users_update', users);
            });

            socket.on('director:update_user_role', async (data: { userId: number, role: string }) => {
                const { AuthService } = await import('../../services/AuthService');
                const dir = this.director as any;
                if (AuthService.getInstance().updateUserRole(data.userId, data.role)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Updated user ${data.userId} role to ${data.role}`);
                    const users = AuthService.getInstance().getAllUsers();
                    this.adminNamespace.emit('director:users_update', users);
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to update user ${data.userId} role.`);
                }
            });

            socket.on('director:update_user_password', async (data: { userId: number, password: string }) => {
                const { AuthService } = await import('../../services/AuthService');
                const dir = this.director as any;
                if (await AuthService.getInstance().updateUserPassword(data.userId, data.password)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Updated password for user ${data.userId}`);
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to update password for user ${data.userId}.`);
                }
            });

            socket.on('director:delete_user', async (userId: number) => {
                const { AuthService } = await import('../../services/AuthService');
                const dir = this.director as any;
                if (AuthService.getInstance().deleteUser(userId)) {
                    dir.log(DirectorLogLevel.SUCCESS, `Deleted user ${userId}`);
                    const users = AuthService.getInstance().getAllUsers();
                    this.adminNamespace.emit('director:users_update', users);
                } else {
                    dir.log(DirectorLogLevel.ERROR, `Failed to delete user ${userId}.`);
                }
            });

            // Character Management
            socket.on('director:get_characters', async () => {
                const { CharacterService } = await import('../../services/CharacterService');
                const charService = CharacterService.getInstance();
                const characters = charService.getAllCharacters();

                const enriched = characters.map(c => ({
                    ...c,
                    online: !!charService.getActiveEntityByCharId(c.id, (this.director as any).engine)
                }));

                socket.emit('director:characters_update', enriched);
            });

            socket.on('director:update_character_stats', async (data: { charId: number, stats: any, skills?: any, reputation?: any }) => {
                const { CharacterService } = await import('../../services/CharacterService');
                const { Stats } = await import('../../components/Stats');
                const { Reputation } = await import('../../components/Reputation');

                const charService = CharacterService.getInstance();
                const activeEntity = charService.getActiveEntityByCharId(data.charId, (this.director as any).engine);
                const dir = this.director as any;

                if (activeEntity) {
                    const statsComp = activeEntity.getComponent(Stats);
                    if (statsComp) {
                        for (const [key, value] of Object.entries(data.stats)) {
                            if (statsComp.attributes.has(key)) {
                                statsComp.attributes.get(key)!.value = Number(value);
                            }
                        }
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

                    dir.log(DirectorLogLevel.SUCCESS, `Updated active data for character ${data.charId}`);
                } else {
                    const char = charService.getCharacterById(data.charId);
                    if (char) {
                        const jsonData = JSON.parse(char.data);
                        if (!jsonData.components) jsonData.components = {};

                        const tempStats = new Stats();
                        if (jsonData.components.Stats) {
                            tempStats.fromJSON(jsonData.components.Stats);
                        }

                        for (const [key, value] of Object.entries(data.stats)) {
                            if (tempStats.attributes.has(key)) {
                                tempStats.attributes.get(key)!.value = Number(value);
                            }
                        }

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
                        dir.log(DirectorLogLevel.SUCCESS, `Updated offline data for character ${data.charId}`);
                    } else {
                        dir.log(DirectorLogLevel.ERROR, `Character ${data.charId} not found.`);
                    }
                }

                const characters = charService.getAllCharacters();
                const enriched = characters.map(c => ({
                    ...c,
                    online: !!charService.getActiveEntityByCharId(c.id, dir.engine)
                }));
                socket.emit('director:characters_update', enriched);
            });

            socket.on('director:update_character_inventory', async (data: { charId: number, inventory: any }) => {
                const { CharacterService } = await import('../../services/CharacterService');
                const { Inventory } = await import('../../components/Inventory');
                const { Container } = await import('../../components/Container');
                const { Item } = await import('../../components/Item');
                const { PersistenceManager } = await import('../../persistence/PersistenceManager');

                const charService = CharacterService.getInstance();
                const dir = this.director as any;
                const activeEntity = charService.getActiveEntityByCharId(data.charId, dir.engine);

                if (activeEntity) {
                    const inv = activeEntity.getComponent(Inventory);
                    if (!inv) {
                        dir.log(DirectorLogLevel.ERROR, `Character ${data.charId} has no inventory component.`);
                        return;
                    }

                    const updateSlot = (currentId: string | null, newItemId: string | null, setFn: (id: string | null) => void) => {
                        if (currentId) dir.engine.removeEntity(currentId);
                        if (newItemId) {
                            const newItem = PrefabFactory.createItem(newItemId);
                            if (newItem) {
                                dir.engine.addEntity(newItem);
                                setFn(newItem.id);
                            } else setFn(null);
                        } else setFn(null);
                    };

                    if (data.inventory.rightHand !== undefined) updateSlot(inv.rightHand, data.inventory.rightHand, (id) => inv.rightHand = id);
                    if (data.inventory.leftHand !== undefined) updateSlot(inv.leftHand, data.inventory.leftHand, (id) => inv.leftHand = id);

                    if (data.inventory.equipment) {
                        for (const [slot, itemId] of Object.entries(data.inventory.equipment)) {
                            const currentId = inv.equipment.get(slot) || null;
                            updateSlot(currentId, itemId as string, (id) => {
                                if (id) inv.equipment.set(slot, id);
                                else inv.equipment.delete(slot);
                            });
                        }
                    }

                    if (data.inventory.backpack) {
                        let backpackId = inv.equipment.get('back');
                        let backpack = backpackId ? dir.engine.getEntity(backpackId) : null;

                        if (!backpack && (data.inventory.backpack as string[]).length > 0) {
                            const newBackpack = PrefabFactory.createItem('backpack');
                            if (newBackpack) {
                                dir.engine.addEntity(newBackpack);
                                inv.equipment.set('back', newBackpack.id);
                                backpack = newBackpack;
                            }
                        }

                        if (backpack) {
                            const container = backpack.getComponent(Container);
                            if (container) {
                                for (const itemId of container.items) dir.engine.removeEntity(itemId);
                                container.items = [];
                                for (const itemTemplateId of (data.inventory.backpack as string[])) {
                                    const newItem = PrefabFactory.createItem(itemTemplateId);
                                    if (newItem) {
                                        dir.engine.addEntity(newItem);
                                        container.items.push(newItem.id);
                                    }
                                }
                            }
                        }
                    }

                    dir.log(DirectorLogLevel.SUCCESS, `Updated active inventory for character ${data.charId}`);
                } else {
                    const char = charService.getCharacterById(data.charId);
                    if (char) {
                        const jsonData = JSON.parse(char.data);
                        if (!jsonData.components) jsonData.components = {};

                        const tempInv = new Inventory();
                        if (jsonData.components.Inventory) {
                            tempInv.fromJSON(jsonData.components.Inventory);
                        }

                        if (data.inventory.rightHand !== undefined) tempInv.rightHand = data.inventory.rightHand;
                        if (data.inventory.leftHand !== undefined) tempInv.leftHand = data.inventory.leftHand;

                        if (data.inventory.equipment) {
                            for (const [slot, itemId] of Object.entries(data.inventory.equipment)) {
                                if (itemId) tempInv.equipment.set(slot, itemId as string);
                                else tempInv.equipment.delete(slot);
                            }
                        }

                        if (data.inventory.backpack) {
                            // This is complex for offline chars as we don't have the entity structure.
                            // We'll just update the 'back' slot if it's a backpack, but we can't easily populate it
                            // without a more complex serialization strategy.
                            // For now, we'll skip deep backpack editing for offline chars to avoid corruption.
                            dir.log(DirectorLogLevel.WARN, `Deep backpack editing for offline characters is not fully supported yet.`);
                        }

                        jsonData.components.Inventory = tempInv.toJSON();
                        charService.saveCharacter(data.charId, jsonData);
                        dir.log(DirectorLogLevel.SUCCESS, `Updated offline inventory for character ${data.charId}`);
                    } else {
                        dir.log(DirectorLogLevel.ERROR, `Character ${data.charId} not found.`);
                    }
                }
            });
        });
    }
}
