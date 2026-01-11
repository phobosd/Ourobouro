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
    type: 'item' | 'weapon' | 'container' | 'cyberware';
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
            // Use process.cwd() to ensure we are relative to the project root
            const csvPath = path.join(process.cwd(), 'data', 'items.csv');
            Logger.info('ItemRegistry', `Loading items from: ${csvPath}`);

            if (!fs.existsSync(csvPath)) {
                Logger.error('ItemRegistry', `Error: items.csv not found at ${csvPath}`);
                return;
            }

            const fileContent = fs.readFileSync(csvPath, 'utf-8');
            Logger.debug('ItemRegistry', `File content length: ${fileContent.length}`);

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
                        weight: parseFloat(record.weight),
                        size: record.size,
                        legality: record.legality,
                        attributes: record.attributes,
                        cost: parseInt(record.cost),
                        type: record.type as any,
                        extraData: record.extraData ? JSON.parse(record.extraData) : {}
                    };
                    this.items.set(def.id, def);
                    // Also map by name for fuzzy lookups if needed, but ID is primary
                    this.items.set(def.name.toLowerCase(), def);
                } catch (err) {
                    Logger.error('ItemRegistry', `Failed to parse item record: ${record.id}`, err);
                }
            }
            Logger.info('ItemRegistry', `Loaded ${this.items.size} item definitions from CSV.`);
        } catch (error) {
            Logger.error('ItemRegistry', "Failed to load items.csv:", error);
        }
    }

    public getItem(id: string): ItemDefinition | undefined {
        return this.items.get(id.toLowerCase());
    }

    public getAllItems(): ItemDefinition[] {
        return Array.from(this.items.values());
    }
}
