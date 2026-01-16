import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export interface NPCDefinition {
    id: string;
    name: string;
    description: string;
    stats: {
        health: number;
        attack: number;
        defense: number;
    };
    behavior?: string;
    dialogue?: string[];
    faction?: string;
    role?: string;
    tags?: string[];
    canMove?: boolean;
    portrait?: string;
}

export class NPCRegistry {
    private static instance: NPCRegistry;
    private npcs: Map<string, NPCDefinition> = new Map();

    private constructor() {
        this.loadNPCs();
    }

    public static getInstance(): NPCRegistry {
        if (!NPCRegistry.instance) {
            NPCRegistry.instance = new NPCRegistry();
        }
        return NPCRegistry.instance;
    }

    private loadNPCs() {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            const jsonPath = path.join(dataDir, 'npcs.json');

            if (fs.existsSync(jsonPath)) {
                Logger.info('NPCRegistry', `Loading NPCs from JSON: ${jsonPath}`);
                const content = fs.readFileSync(jsonPath, 'utf-8');
                const npcs = JSON.parse(content);
                for (const npc of npcs) {
                    this.npcs.set(npc.id.toString().trim(), npc);
                    this.npcs.set(npc.name.toLowerCase().trim(), npc);
                }
                Logger.info('NPCRegistry', `Loaded ${npcs.length} NPCs from JSON.`);
            }
        } catch (error) {
            Logger.error('NPCRegistry', "Failed to load NPCs:", error);
        } finally {
            this.loadGeneratedNPCs();
        }
    }

    public reloadGeneratedNPCs() {
        this.npcs.clear();
        this.loadNPCs();
    }

    private loadGeneratedNPCs() {
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'npcs');
            if (!fs.existsSync(generatedDir)) return;

            const files = fs.readdirSync(generatedDir).filter(f => f.endsWith('.json'));
            Logger.info('NPCRegistry', `Loading ${files.length} generated NPCs...`);

            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(generatedDir, file), 'utf-8');
                    const npc = JSON.parse(content);

                    const def: NPCDefinition = {
                        id: npc.id,
                        name: npc.name,
                        description: npc.description,
                        stats: npc.stats,
                        behavior: npc.behavior,
                        dialogue: npc.dialogue,
                        faction: npc.faction,
                        role: npc.role,
                        tags: npc.tags,
                        canMove: npc.canMove ?? true,
                        portrait: npc.portrait
                    };

                    this.npcs.set(def.id.toString().trim(), def);
                    this.npcs.set(def.name.toLowerCase().trim(), def);
                } catch (err) {
                    Logger.error('NPCRegistry', `Failed to load generated NPC ${file}:`, err);
                }
            }
        } catch (err) {
            Logger.error('NPCRegistry', "Failed to load generated NPCs:", err);
        }
    }

    public getNPC(id: string): NPCDefinition | undefined {
        if (!id) return undefined;
        return this.npcs.get(id.toLowerCase().trim());
    }

    public getAllNPCs(): NPCDefinition[] {
        return Array.from(this.npcs.values());
    }

    public deleteNPC(id: string): boolean {
        const npc = this.npcs.get(id);
        if (!npc) return false;

        // Remove from map
        this.npcs.delete(id);
        this.npcs.delete(npc.name.toLowerCase().trim());

        // Try to delete file if it's generated
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'npcs');
            const files = fs.readdirSync(generatedDir);
            for (const file of files) {
                const content = fs.readFileSync(path.join(generatedDir, file), 'utf-8');
                const json = JSON.parse(content);
                if (json.id === id) {
                    fs.unlinkSync(path.join(generatedDir, file));
                    Logger.info('NPCRegistry', `Deleted generated NPC file: ${file}`);
                    return true;
                }
            }
        } catch (err) {
            Logger.warn('NPCRegistry', `Could not delete file for NPC ${id} (might be hardcoded or error): ${err}`);
        }

        return true;
    }

    public updateNPC(id: string, updates: Partial<NPCDefinition>): boolean {
        const npc = this.npcs.get(id);
        if (!npc) return false;

        // Update in memory
        Object.assign(npc, updates);
        this.npcs.set(id, npc);

        // Try to update file if it's generated
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'npcs');
            if (!fs.existsSync(generatedDir)) return false;

            const files = fs.readdirSync(generatedDir);
            for (const file of files) {
                const filePath = path.join(generatedDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const json = JSON.parse(content);

                if (json.id === id) {
                    if (updates.name) json.name = updates.name;
                    if (updates.description) json.description = updates.description;
                    if (updates.faction) json.faction = updates.faction;
                    if (updates.role) json.role = updates.role;
                    if (updates.stats) json.stats = updates.stats;

                    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
                    Logger.info('NPCRegistry', `Updated generated NPC file: ${file}`);
                    return true;
                }
            }
        } catch (err) {
            Logger.warn('NPCRegistry', `Could not update file for NPC ${id}: ${err}`);
        }

        return true;
    }
}
