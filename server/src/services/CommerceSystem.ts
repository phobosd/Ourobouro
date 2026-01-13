import { Server } from 'socket.io';
import { IEngine } from '../ecs/IEngine';
import { WorldQuery } from '../utils/WorldQuery';
import { Credits } from '../components/Credits';
import { PrefabFactory } from '../factories/PrefabFactory';
import { Item } from '../components/Item';
import { Inventory } from '../components/Inventory';
import { Container } from '../components/Container';
import { Position } from '../components/Position';
import { Entity } from '../ecs/Entity';
import { Terminal } from '../components/Terminal';

import { MessageService } from '../services/MessageService';
import { Logger } from '../utils/Logger';
import { ItemRegistry } from './ItemRegistry';

export class CommerceSystem {
    constructor(private io: Server, private messageService: MessageService) { }

    handleTerminalBuy(entityId: string, engine: IEngine, itemName: string, cost: number) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const credits = player.getComponent(Credits);
        if (!credits || credits.amount < cost) {
            this.messageService.error(entityId, `You don't have enough credits. (Cost: ${cost}, You have: ${credits?.amount || 0})`);
            return;
        }

        // Create the item
        const itemEntity = PrefabFactory.createItem(itemName);
        if (!itemEntity) {
            this.messageService.system(entityId, `Error: Item '${itemName}' out of stock (not found in registry).`);
            return;
        }

        const itemComp = itemEntity.getComponent(Item);
        const inventory = player.getComponent(Inventory);

        if (inventory && itemComp) {
            // Try to add to backpack
            const backpackId = inventory.equipment.get('back');
            let added = false;

            if (backpackId) {
                const backpack = WorldQuery.getEntityById(engine, backpackId);
                const container = backpack?.getComponent(Container);
                if (container) {
                    if (container.currentWeight + itemComp.weight <= container.maxWeight) {
                        container.items.push(itemEntity.id);
                        container.currentWeight += itemComp.weight;
                        credits.amount -= cost;
                        this.messageService.system(entityId, `Purchased ${itemComp.name} for ${cost} credits. Added to backpack. (Remaining: ${credits.amount})`);
                        added = true;
                        engine.addEntity(itemEntity);
                    }
                }
            }

            if (!added) {
                // Drop on ground
                const pos = player.getComponent(Position);
                if (pos) {
                    itemEntity.addComponent(new Position(pos.x, pos.y));
                    credits.amount -= cost;
                    engine.addEntity(itemEntity);
                    this.messageService.system(entityId, `Purchased ${itemComp.name} for ${cost} credits. Inventory full, dropped on ground. (Remaining: ${credits.amount})`);
                }
            }

            return itemEntity;
        }
        return null;
    }

    handleTerminalRead(entityId: string, engine: IEngine, terminalEntity: Entity) {
        const terminal = terminalEntity.getComponent(Terminal);
        if (!terminal) return;

        const itemNames = terminal.data.items as string[];
        Logger.info('CommerceSystem', `Reading terminal. Items requested: ${JSON.stringify(itemNames)}`);

        const itemsData = itemNames.map(name => {
            const tempEntity = PrefabFactory.createItem(name);
            if (tempEntity) {
                const item = tempEntity.getComponent(Item);
                if (item) {
                    const itemDef = ItemRegistry.getInstance().getItem(name);
                    return {
                        name: item.name,
                        weight: item.weight,
                        size: item.size,
                        legality: item.legality,
                        attributes: item.attributes,
                        description: item.description,
                        cost: itemDef?.cost || 100,
                        type: itemDef?.type || 'item'
                    };
                }
            } else {
                Logger.warn('CommerceSystem', `Failed to create item for shop: ${name}. Check ItemRegistry/PrefabFactory.`);
            }
            return null;
        }).filter(i => i !== null);

        Logger.info('CommerceSystem', `Generated itemsData: ${itemsData.length} items successfully resolved.`);

        this.io.to(entityId).emit('terminal-data', {
            title: terminal.data.title || "TERMINAL CATALOG",
            items: itemsData
        });
        this.messageService.system(entityId, "You access the terminal...");
    }
}
