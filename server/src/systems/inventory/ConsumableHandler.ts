import { IEngine } from '../../ecs/IEngine';
import { WorldQuery } from '../../utils/WorldQuery';
import { Inventory } from '../../components/Inventory';
import { Item } from '../../components/Item';
import { Container } from '../../components/Container';
import { CombatStats } from '../../components/CombatStats';
import { Stats } from '../../components/Stats';
import { Entity } from '../../ecs/Entity';
import { MessageService } from '../../services/MessageService';
import { ParserUtils } from '../../utils/ParserUtils';
import { InventoryUtils } from './InventoryUtils';
import { Server } from 'socket.io';

export class ConsumableHandler {
    static handleUse(entityId: string, itemName: string, engine: IEngine, messageService: MessageService, io: Server) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        const combatStats = player.getComponent(CombatStats);
        if (!inventory || !combatStats) return;

        const { index, name: targetName } = ParserUtils.parseOrdinal(itemName.toLowerCase());
        const itemMatches: { id: string, source: 'left' | 'right' | string }[] = [];

        // Check hands
        if (inventory.leftHand) {
            const item = WorldQuery.getEntityById(engine, inventory.leftHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemMatches.push({ id: inventory.leftHand, source: 'left' });
            }
        }
        if (inventory.rightHand) {
            const item = WorldQuery.getEntityById(engine, inventory.rightHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemMatches.push({ id: inventory.rightHand, source: 'right' });
            }
        }

        // Check equipment (specifically containers like backpacks)
        for (const [slot, id] of inventory.equipment) {
            const item = WorldQuery.getEntityById(engine, id);
            const container = item?.getComponent(Container);
            if (container) {
                container.items.forEach(cid => {
                    const citem = WorldQuery.getEntityById(engine, cid);
                    if (citem?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                        itemMatches.push({ id: cid, source: slot });
                    }
                });
            }
        }

        const match = itemMatches[index];
        if (!match) {
            messageService.info(entityId, `You don't have a ${itemName} to use.`);
            return;
        }

        const itemEntity = WorldQuery.getEntityById(engine, match.id);
        const itemComp = itemEntity?.getComponent(Item);
        if (!itemEntity || !itemComp) return;

        const name = itemComp.name.toLowerCase();

        // Consumable logic
        let used = false;

        if (name.includes('medkit')) {
            const healAmount = 50;
            const oldHp = combatStats.hp;
            combatStats.hp = Math.min(combatStats.maxHp, combatStats.hp + healAmount);
            const actualHeal = combatStats.hp - oldHp;
            messageService.success(entityId, `You use the medkit and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('stimpack')) {
            const playerStats = player.getComponent(Stats);
            const con = playerStats?.attributes.get('CON')?.value || 10;
            const maxFatigue = con * 10;

            combatStats.fatigue = maxFatigue; // Restore to max
            combatStats.balance = 1.0;
            messageService.success(entityId, `You use the stimpack. You feel a surge of energy! Your stamina is fully restored.`);
            used = true;
        } else if (name.includes('bandage')) {
            const healAmount = 15;
            const oldHp = combatStats.hp;
            combatStats.hp = Math.min(combatStats.maxHp, combatStats.hp + healAmount);
            const actualHeal = combatStats.hp - oldHp;
            messageService.success(entityId, `You use the bandage and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('painkillers')) {
            const healAmount = 25;
            const oldHp = combatStats.hp;
            combatStats.hp = Math.min(combatStats.maxHp, combatStats.hp + healAmount);
            const actualHeal = combatStats.hp - oldHp;
            messageService.success(entityId, `You take the painkillers and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('water bottle')) {
            const playerStats = player.getComponent(Stats);
            const con = playerStats?.attributes.get('CON')?.value || 10;
            const maxFatigue = con * 10;

            combatStats.fatigue = Math.min(maxFatigue, combatStats.fatigue + 20); // Restore 20 fatigue
            messageService.success(entityId, `You drink the water. It's refreshing! You regain some stamina.`);
            used = true;
        }

        if (used) {
            this.consumeItem(player, match.id, match.source, engine);
            InventoryUtils.refreshAutocomplete(entityId, engine, io, messageService);
        } else {
            messageService.info(entityId, `You can't use the ${itemComp.name} yet.`);
        }
    }

    private static consumeItem(player: Entity, itemId: string, source: string, engine: IEngine) {
        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        if (source === 'left') {
            inventory.leftHand = null;
        } else if (source === 'right') {
            inventory.rightHand = null;
        } else {
            // It's in a container
            const containerEntity = WorldQuery.getEntityById(engine, inventory.equipment.get(source) || '');
            const container = containerEntity?.getComponent(Container);
            const item = WorldQuery.getEntityById(engine, itemId);
            const itemComp = item?.getComponent(Item);
            if (container && itemComp) {
                container.items = container.items.filter(id => id !== itemId);
                container.currentWeight -= itemComp.weight;
            }
        }

        // Destroy the item entity
        engine.removeEntity(itemId);
    }
}
