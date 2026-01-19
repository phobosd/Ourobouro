import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { NPCRegistry, NPCDefinition } from './NPCRegistry';
import { ItemRegistry, ItemDefinition } from './ItemRegistry';

export class CompendiumService {
    private static COMPENDIUM_PATH = path.join(process.cwd(), '..', 'docs', 'COMPENDIUM.md');

    public static async updateCompendium() {
        try {
            Logger.info('CompendiumService', 'Updating COMPENDIUM.md...');

            const npcs = NPCRegistry.getInstance().getAllNPCs();
            const items = ItemRegistry.getInstance().getAllItems();
            // Deduplicate NPCs (they are stored by ID and Name in the registry)
            const uniqueNPCs = new Map<string, NPCDefinition>();
            npcs.forEach(npc => uniqueNPCs.set(npc.id, npc));
            const sortedNPCs = Array.from(uniqueNPCs.values())
                .filter(npc => {
                    // Filter out invasion mobs and temporary event bosses
                    // We check the 'generatedBy' field which is now available in NPCDefinition
                    if (npc.generatedBy === 'Event:Invasion') return false;
                    if (npc.generatedBy === 'Event:Boss') return false;

                    // Also check tags as a fallback for older entities
                    if (npc.tags?.includes('invasion_mob')) return false;

                    return true;
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            // Deduplicate Items (already handled by getAllItems in ItemRegistry)
            const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name));

            let content = `# Zenith-9 Compendium\n\n`;
            content += `This document serves as a comprehensive reference for all Non-Player Characters (NPCs) and Items within the Zenith-9 world. It is intended to be a living document, updated whenever new content is added or existing content is modified.\n\n`;

            // NPCs Section
            content += `## NPCs (Non-Player Characters)\n\n`;
            content += `| Name | HP | Attack | Defense | Behavior | Description |\n`;
            content += `| :--- | :-: | :-: | :-: | :--- | :--- |\n`;

            sortedNPCs.forEach(npc => {
                const behavior = npc.behavior || 'Passive';
                content += `| **${npc.name}** | ${npc.stats.health} | ${npc.stats.attack} | ${npc.stats.defense} | ${behavior} | ${npc.description.replace(/\n/g, ' ')} |\n`;
            });

            content += `\n## Items\n\n`;

            // Categorize Items
            const weapons = sortedItems.filter(i => i.type === 'weapon');
            const armor = sortedItems.filter(i => i.type === 'armor');
            const cyberware = sortedItems.filter(i => i.type === 'cyberware');
            const containers = sortedItems.filter(i => i.type === 'container');
            const general = sortedItems.filter(i => i.type === 'item');

            // Weapons Section
            content += `### Weapons\n\n`;
            content += `| Name | Type | Damage | Range | Cost | Notes |\n`;
            content += `| :--- | :--- | :-: | :-: | :-: | :--- |\n`;
            weapons.forEach(w => {
                const damage = w.extraData?.damage || 'N/A';
                const range = w.extraData?.range || 'N/A';
                const notes = w.extraData?.notes || w.description.replace(/\n/g, ' ');
                content += `| **${w.name}** | ${w.extraData?.subtype || 'Weapon'} | ${damage} | ${range} | ${w.cost} | ${notes} |\n`;
            });

            // Armor Section
            content += `\n### Armor\n\n`;
            content += `| Name | Slot | Defense | Penalty | Cost | Description |\n`;
            content += `| :--- | :--- | :-: | :-: | :-: | :--- |\n`;
            armor.forEach(a => {
                const defense = a.extraData?.defense || 'N/A';
                const penalty = a.extraData?.penalty || '0';
                content += `| **${a.name}** | ${a.slot || 'Body'} | ${defense} | ${penalty} | ${a.cost} | ${a.description.replace(/\n/g, ' ')} |\n`;
            });

            // Cyberware Section
            content += `\n### Cyberware\n\n`;
            content += `| Name | Slot | Cost | Effect |\n`;
            content += `| :--- | :--- | :-: | :--- |\n`;
            cyberware.forEach(c => {
                const effect = c.extraData?.effect || c.description.replace(/\n/g, ' ');
                content += `| **${c.name}** | ${c.slot || 'Neural'} | ${c.cost} | ${effect} |\n`;
            });

            // Containers Section
            content += `\n### Containers\n\n`;
            content += `| Name | Slot | Capacity | Cost | Description |\n`;
            content += `| :--- | :--- | :-: | :-: | :--- |\n`;
            containers.forEach(c => {
                const capacity = c.extraData?.capacity || 'N/A';
                content += `| **${c.name}** | ${c.slot || 'Back'} | ${capacity} | ${c.cost} | ${c.description.replace(/\n/g, ' ')} |\n`;
            });

            // General Items Section
            content += `\n### General Items & Consumables\n\n`;
            content += `| Name | Type | Cost | Effect/Description |\n`;
            content += `| :--- | :--- | :-: | :--- |\n`;
            general.forEach(i => {
                const effect = i.extraData?.effect || i.description.replace(/\n/g, ' ');
                content += `| **${i.name}** | ${i.extraData?.subtype || 'Item'} | ${i.cost} | ${effect} |\n`;
            });

            fs.writeFileSync(this.COMPENDIUM_PATH, content);
            Logger.info('CompendiumService', 'COMPENDIUM.md updated successfully.');
        } catch (err) {
            Logger.error('CompendiumService', 'Failed to update COMPENDIUM.md:', err);
        }
    }
}
