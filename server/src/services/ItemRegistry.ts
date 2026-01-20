import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger';

export interface ItemDefinition {
    id: string;
    name: string;
    shortName: string;
    description: string;
    weight: number;
    size: string;
    legality: string;
    attributes: string;
    cost: number;
    type: 'item' | 'weapon' | 'container' | 'cyberware' | 'armor';
    slot?: string | null;
    rarity?: string;
    extraData: any;
    generatedBy?: string;
}

export class ItemRegistry {
    private static instance: ItemRegistry;
    private items: Map<string, ItemDefinition> = new Map();
    private db: Database.Database;

    private constructor() {
        const dbPath = path.join(process.cwd(), 'game.db');
        this.db = new Database(dbPath);
        this.loadItems();
        this.loadGeneratedItems();
    }

    public static getInstance(): ItemRegistry {
        if (!ItemRegistry.instance) {
            ItemRegistry.instance = new ItemRegistry();
        }
        return ItemRegistry.instance;
    }

    private loadItems() {
        try {
            Logger.info('ItemRegistry', 'Loading items from SQLite database...');

            const stmt = this.db.prepare('SELECT * FROM items');
            const rows = stmt.all();

            for (const row of rows as any[]) {
                const item: ItemDefinition = {
                    id: row.id,
                    name: row.short_name || row.name, // Swap: short_name is the pretty name
                    shortName: row.name,              // Swap: name is the slug
                    description: row.description,
                    weight: row.weight,
                    size: row.size,
                    legality: row.legality,
                    attributes: row.attributes,
                    cost: row.cost,
                    type: row.type as any,
                    slot: row.slot,
                    rarity: row.rarity,
                    extraData: JSON.parse(row.extra_data || '{}')
                };

                this.items.set(item.id.toString().trim(), item);
                this.items.set(item.name.toLowerCase().trim(), item);
                if (item.shortName) {
                    this.items.set(item.shortName.toLowerCase().trim(), item);
                }
            }

            Logger.info('ItemRegistry', `Loaded ${rows.length} items from database.`);

        } catch (err) {
            Logger.error('ItemRegistry', 'Failed to load items from database', err);
        }
    }

    public reloadGeneratedItems() {
        this.items.clear();
        this.loadItems();
        this.loadGeneratedItems();
    }

    private loadGeneratedItems() {
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'items');
            if (!fs.existsSync(generatedDir)) return;

            const files = fs.readdirSync(generatedDir).filter(f => f.endsWith('.json'));
            Logger.info('ItemRegistry', `Loading ${files.length} generated items...`);

            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(generatedDir, file), 'utf-8');
                    const item = JSON.parse(content);

                    // Map generated payload to ItemDefinition
                    const def: ItemDefinition = {
                        id: item.id,
                        name: item.name,
                        shortName: item.shortName,
                        description: item.description,
                        weight: item.weight || 1,
                        size: "Medium",
                        legality: "Legal",
                        attributes: "",
                        cost: item.cost || 0,
                        type: item.type === 'junk' ? 'item' : item.type,
                        rarity: item.rarity || 'Common',
                        extraData: item.attributes || {},
                        generatedBy: item.generatedBy
                    };

                    this.items.set(def.id.toString().trim(), def);
                    this.items.set(def.name.toLowerCase().trim(), def);
                    if (def.shortName) {
                        this.items.set(def.shortName.toLowerCase().trim(), def);
                    }
                } catch (err) {
                    Logger.error('ItemRegistry', `Failed to load generated item ${file}:`, err);
                }
            }
        } catch (err) {
            Logger.error('ItemRegistry', "Failed to load generated items:", err);
        }
    }

    public getItem(id: string): ItemDefinition | undefined {
        if (!id) return undefined;
        return this.items.get(id.toLowerCase().trim());
    }

    public getAllItems(): ItemDefinition[] {
        // Deduplicate by ID since items are stored multiple times (by id, name, shortName)
        const allValues = Array.from(this.items.values());
        const uniqueItems = new Map<string, ItemDefinition>();
        for (const item of allValues) {
            uniqueItems.set(item.id, item);
        }
        // Logger.info('ItemRegistry', `getAllItems: ${allValues.length} total values, ${uniqueItems.size} unique items`);
        return Array.from(uniqueItems.values());
    }

    public getUniqueItemNames(): string[] {
        const names = new Set<string>();
        for (const item of this.items.values()) {
            names.add(item.name);
        }
        return Array.from(names);
    }

    public deleteItem(id: string): boolean {
        const item = this.items.get(id);
        if (!item) return false;

        // Remove from map
        this.items.delete(id);
        this.items.delete(item.name.toLowerCase().trim());
        if (item.shortName) {
            this.items.delete(item.shortName.toLowerCase().trim());
        }

        // Try to delete from SQLite
        try {
            const stmt = this.db.prepare('DELETE FROM items WHERE id = ?');
            const result = stmt.run(id);
            if (result.changes > 0) {
                Logger.info('ItemRegistry', `Deleted item from DB: ${id}`);
                return true;
            }
        } catch (err) {
            Logger.warn('ItemRegistry', `Failed to delete item from DB ${id}: ${err}`);
        }

        // Try to delete file if it's generated (fallback/legacy support)
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'items');
            if (fs.existsSync(generatedDir)) {
                const files = fs.readdirSync(generatedDir);
                for (const file of files) {
                    const content = fs.readFileSync(path.join(generatedDir, file), 'utf-8');
                    const json = JSON.parse(content);
                    if (json.id === id) {
                        fs.unlinkSync(path.join(generatedDir, file));
                        Logger.info('ItemRegistry', `Deleted generated item file: ${file}`);
                        return true;
                    }
                }
            }
        } catch (err) {
            Logger.warn('ItemRegistry', `Could not delete file for item ${id}: ${err}`);
        }

        return true;
    }

    public updateItem(id: string, updates: Partial<ItemDefinition>): boolean {
        const item = this.items.get(id);
        if (!item) return false;

        // Update in memory
        Object.assign(item, updates);
        this.items.set(id, item); // Re-set to ensure map is up to date

        // Try to update SQLite
        try {
            // Build dynamic update query
            const fields: string[] = [];
            const values: any[] = [];

            if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
            if (updates.shortName !== undefined) { fields.push('short_name = ?'); values.push(updates.shortName); }
            if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
            if (updates.weight !== undefined) { fields.push('weight = ?'); values.push(updates.weight); }
            if (updates.size !== undefined) { fields.push('size = ?'); values.push(updates.size); }
            if (updates.legality !== undefined) { fields.push('legality = ?'); values.push(updates.legality); }
            if (updates.attributes !== undefined) { fields.push('attributes = ?'); values.push(updates.attributes); }
            if (updates.cost !== undefined) { fields.push('cost = ?'); values.push(updates.cost); }
            if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type); }
            if (updates.slot !== undefined) { fields.push('slot = ?'); values.push(updates.slot); }
            if (updates.rarity !== undefined) { fields.push('rarity = ?'); values.push(updates.rarity); }
            if (updates.extraData !== undefined) { fields.push('extra_data = ?'); values.push(JSON.stringify(updates.extraData)); }

            if (fields.length > 0) {
                values.push(id); // For WHERE clause
                const stmt = this.db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`);
                const result = stmt.run(...values);
                if (result.changes > 0) {
                    Logger.info('ItemRegistry', `Updated item in DB: ${id}`);
                    return true;
                }
            }
        } catch (err) {
            Logger.warn('ItemRegistry', `Failed to update item in DB ${id}: ${err}`);
        }

        // Try to update file if it's generated
        try {
            const generatedDir = path.join(process.cwd(), 'data', 'generated', 'items');
            if (fs.existsSync(generatedDir)) {
                const files = fs.readdirSync(generatedDir);
                for (const file of files) {
                    const filePath = path.join(generatedDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const json = JSON.parse(content);

                    if (json.id === id) {
                        // Merge updates into the JSON structure
                        if (updates.name) json.name = updates.name;
                        if (updates.description) json.description = updates.description;
                        if (updates.cost !== undefined) json.cost = updates.cost;
                        if (updates.weight !== undefined) json.weight = updates.weight;
                        if (updates.rarity) json.rarity = updates.rarity;

                        // Handle extraData / attributes
                        if (updates.extraData) {
                            json.attributes = { ...json.attributes, ...updates.extraData };
                        }

                        fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
                        Logger.info('ItemRegistry', `Updated generated item file: ${file}`);
                        return true;
                    }
                }
            }
        } catch (err) {
            Logger.warn('ItemRegistry', `Could not update file for item ${id}: ${err}`);
        }

        return true;
    }
}
