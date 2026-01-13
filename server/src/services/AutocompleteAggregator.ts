import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Item } from '../components/Item';
import { NPC } from '../components/NPC';
import { Terminal } from '../components/Terminal';
import { Description } from '../components/Description';
import { Container } from '../components/Container';
import { Inventory } from '../components/Inventory';
import { IsRoom } from '../components/IsRoom';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';

export interface AutocompleteData {
    type: 'room' | 'inventory';
    objects?: string[];
    items?: string[];
    containers?: string[];
    npcs?: string[];
    equipped?: string[];
}

export class AutocompleteAggregator {
    /**
     * Aggregates autocomplete data for the room the player is in.
     */
    static getRoomAutocomplete(playerPos: Position, engine: IEngine): AutocompleteData {
        const objects: string[] = [];  // NPCs, terminals, puzzle objects (non-item entities)
        const groundItems: string[] = []; // Items on the ground
        const groundContainers: string[] = []; // Containers on the ground

        // Find NPCs
        const npcs = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
        const typeCounts = new Map<string, number>();
        const typeTotals = new Map<string, number>();
        const ordinalNames = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

        npcs.forEach(npc => {
            const npcComp = npc.getComponent(NPC);
            if (npcComp) {
                const name = npcComp.typeName.toLowerCase();
                typeTotals.set(name, (typeTotals.get(name) || 0) + 1);
            }
        });

        const npcs_list: string[] = [];
        npcs.forEach(npc => {
            const npcComp = npc.getComponent(NPC);
            if (npcComp) {
                const name = npcComp.typeName.toLowerCase();
                const total = typeTotals.get(name) || 0;

                let finalName = name;
                if (total > 1) {
                    const count = (typeCounts.get(name) || 0) + 1;
                    typeCounts.set(name, count);
                    const ordinal = ordinalNames[count - 1] || count.toString();
                    finalName = `${ordinal} ${name}`;
                }
                objects.push(finalName);
                npcs_list.push(finalName);
            }
        });

        // Find Terminals
        const terminals = WorldQuery.findTerminalsAt(engine, playerPos.x, playerPos.y);
        terminals.forEach(terminal => {
            const desc = terminal.getComponent(Description);
            if (desc) {
                const title = desc.title.toLowerCase();
                objects.push(title);
            }
        });

        // Find Puzzle Objects
        const descEntities = engine.getEntitiesWithComponent(Description).filter(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            const hasItem = e.hasComponent(Item);
            const isRoom = e.hasComponent(IsRoom);
            return pos && desc && !hasItem && !isRoom && pos.x === playerPos.x && pos.y === playerPos.y;
        });

        descEntities.forEach(entity => {
            const desc = entity.getComponent(Description);
            if (desc) {
                const title = desc.title.toLowerCase();
                if (!objects.includes(title)) {
                    objects.push(title);
                }
            }
        });

        // Find Ground Items & Containers
        const items = WorldQuery.findItemsAt(engine, playerPos.x, playerPos.y);
        const itemTypeCounts = new Map<string, number>();
        const itemTypeTotals = new Map<string, number>();

        items.forEach(item => {
            const itemComp = item.getComponent(Item);
            if (itemComp) {
                const name = itemComp.name.toLowerCase();
                itemTypeTotals.set(name, (itemTypeTotals.get(name) || 0) + 1);
            }
        });

        items.forEach(item => {
            const itemComp = item.getComponent(Item);
            const containerComp = item.getComponent(Container);

            if (itemComp) {
                const name = itemComp.name.toLowerCase();
                const total = itemTypeTotals.get(name) || 0;
                let finalName = name;

                if (total > 1) {
                    const count = (itemTypeCounts.get(name) || 0) + 1;
                    itemTypeCounts.set(name, count);
                    const ordinal = ordinalNames[count - 1] || count.toString();
                    finalName = `${ordinal} ${name}`;
                    if (!groundItems.includes(name)) groundItems.push(name);
                }

                if (!groundItems.includes(finalName)) groundItems.push(finalName);
                if (containerComp && !groundContainers.includes(finalName)) {
                    groundContainers.push(finalName);
                    if (total > 1 && !groundContainers.includes(name)) groundContainers.push(name);
                }
            }
        });

        return {
            type: 'room',
            objects: objects,
            items: groundItems,
            containers: groundContainers,
            npcs: npcs_list
        };
    }

    /**
     * Aggregates autocomplete data for the player's inventory.
     */
    static getInventoryAutocomplete(player: Entity, engine: IEngine): AutocompleteData {
        const inventory = player.getComponent(Inventory);
        if (!inventory) return { type: 'inventory', items: [], containers: [] };

        const invItems: string[] = [];
        const containers: string[] = [];
        const equipped: string[] = [];

        const typeCounts = new Map<string, number>();
        const typeTotals = new Map<string, number>();
        const ordinalNames = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

        const allItems: { id: string, isEquipped: boolean }[] = [];

        const collectAll = (itemId: string | null, isEquipped: boolean = false) => {
            if (!itemId) return;
            allItems.push({ id: itemId, isEquipped });
            const item = WorldQuery.getEntityById(engine, itemId);
            const containerComp = item?.getComponent(Container);
            if (containerComp) {
                containerComp.items.forEach(cid => collectAll(cid, false));
            }
        };

        collectAll(inventory.leftHand, false);
        collectAll(inventory.rightHand, false);
        inventory.equipment.forEach(id => collectAll(id, true));

        // Count totals
        allItems.forEach(entry => {
            const item = WorldQuery.getEntityById(engine, entry.id);
            const itemComp = item?.getComponent(Item);
            if (itemComp) {
                const name = itemComp.name.toLowerCase();
                typeTotals.set(name, (typeTotals.get(name) || 0) + 1);
            }
        });

        // Add with ordinals
        allItems.forEach(entry => {
            const item = WorldQuery.getEntityById(engine, entry.id);
            const itemComp = item?.getComponent(Item);
            const containerComp = item?.getComponent(Container);
            if (itemComp) {
                const name = itemComp.name.toLowerCase();
                const total = typeTotals.get(name) || 0;

                let finalName = name;
                if (total > 1) {
                    const count = (typeCounts.get(name) || 0) + 1;
                    typeCounts.set(name, count);
                    const ordinal = ordinalNames[count - 1] || count.toString();
                    finalName = `${ordinal} ${name}`;
                    if (!invItems.includes(name)) invItems.push(name);
                }

                if (!invItems.includes(finalName)) invItems.push(finalName);
                if (containerComp && !containers.includes(finalName)) {
                    containers.push(finalName);
                    if (total > 1 && !containers.includes(name)) containers.push(name);
                }
                if (entry.isEquipped && !equipped.includes(finalName)) {
                    equipped.push(finalName);
                    if (total > 1 && !equipped.includes(name)) equipped.push(name);
                }

                // Specific aliases
                if (name.includes('pistol magazine') && !invItems.includes('mag')) {
                    invItems.push('mag');
                }
            }
        });

        return {
            type: 'inventory',
            items: invItems.filter(n => n !== 'empty' && n !== 'unknown'),
            containers: Array.from(new Set(containers)),
            equipped: equipped
        };
    }
}
