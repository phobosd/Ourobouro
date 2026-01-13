import * as fs from 'fs';
import * as path from 'path';
// import { parse } from 'csv-parse/sync';
const { parse } = require('csv-parse/sync');
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
    extraData: any;
}

export class ItemRegistry {
    private static instance: ItemRegistry;
    private items: Map<string, ItemDefinition> = new Map();

    private constructor() {
        this.loadItems();
    }

    public static getInstance(): ItemRegistry {
        if (!ItemRegistry.instance) {
            ItemRegistry.instance = new ItemRegistry();
        }
        return ItemRegistry.instance;
    }

    private loadItems() {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            const jsonPath = path.join(dataDir, 'items.json');
            const csvPath = path.join(dataDir, 'items.csv');

            if (fs.existsSync(jsonPath)) {
                Logger.info('ItemRegistry', `Loading items from JSON: ${jsonPath}`);
                const content = fs.readFileSync(jsonPath, 'utf-8');
                const items = JSON.parse(content);
                for (const item of items) {
                    this.items.set(item.id.toString().trim(), item);
                    this.items.set(item.name.toLowerCase().trim(), item);
                    if (item.shortName) {
                        this.items.set(item.shortName.toLowerCase().trim(), item);
                    }
                }
                Logger.info('ItemRegistry', `Loaded ${items.length} items from JSON.`);
                return;
            }

            if (fs.existsSync(csvPath)) {
                Logger.info('ItemRegistry', `Loading items from CSV: ${csvPath}`);
                const fileContent = fs.readFileSync(csvPath, 'utf-8');
                const records = parse(fileContent, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true
                });

                for (const record of records) {
                    try {
                        const def: ItemDefinition = {
                            id: record.id,
                            name: record.name,
                            shortName: record.shortName,
                            description: record.description,
                            weight: parseFloat(record.weight) || 0,
                            size: record.size,
                            legality: record.legality,
                            attributes: record.attributes,
                            cost: parseInt(record.cost) || 0,
                            type: record.type as any,
                            extraData: record.extraData ? JSON.parse(record.extraData) : {}
                        };
                        this.items.set(def.id.toString().trim(), def);
                        this.items.set(def.name.toLowerCase().trim(), def);
                        if (def.shortName) {
                            this.items.set(def.shortName.toLowerCase().trim(), def);
                        }
                    } catch (err) {
                        Logger.error('ItemRegistry', `Failed to parse CSV record: ${record.id}`, err);
                    }
                }
                Logger.info('ItemRegistry', `Loaded ${this.items.size / 2} items from CSV.`);
                return;
            }

            Logger.error('ItemRegistry', "No items.json or items.csv found!");
        } catch (error) {
            Logger.error('ItemRegistry', "Failed to load items:", error);
        }
    }

    public getItem(id: string): ItemDefinition | undefined {
        if (!id) return undefined;
        return this.items.get(id.toLowerCase().trim());
    }

    public getAllItems(): ItemDefinition[] {
        return Array.from(this.items.values());
    }

    public getUniqueItemNames(): string[] {
        const names = new Set<string>();
        for (const item of this.items.values()) {
            names.add(item.name);
        }
        return Array.from(names);
    }
}
