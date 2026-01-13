import { System } from '../ecs/System';
import { IEngine } from '../ecs/IEngine';
import { WorldQuery } from '../utils/WorldQuery';
import { Position } from '../components/Position';
import { Inventory } from '../components/Inventory';
import { Item } from '../components/Item';
import { Container } from '../components/Container';
import { Entity } from '../ecs/Entity';
import { AutocompleteAggregator } from '../services/AutocompleteAggregator';
import { DescriptionService } from '../services/DescriptionService';
import { Credits } from '../components/Credits';
import { Momentum } from '../components/Momentum';
import { Weapon } from '../components/Weapon';
import { MessageService } from '../services/MessageService';
import { Server } from 'socket.io';
import { ParserUtils } from '../utils/ParserUtils';
import { CombatStats } from '../components/CombatStats';
import { MessageFormatter } from '../utils/MessageFormatter';

export class InventorySystem extends System {
    private io: Server;
    private messageService: MessageService;

    constructor(io: Server) {
        super();
        this.io = io;
        this.messageService = new MessageService(io);
    }

    update(engine: IEngine, deltaTime: number): void {
        // Inventory logic doesn't need per-tick updates for now
    }

    handleGet(entityId: string, itemName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        const inventory = player.getComponent(Inventory);
        if (!playerPos || !inventory) return;

        const fromMatch = itemName.toLowerCase().match(/^(.+?)\s+from\s+(.+)$/);
        let targetNameRaw = itemName.toLowerCase();
        let specifiedContainerNameRaw: string | null = null;

        if (fromMatch) {
            targetNameRaw = fromMatch[1].trim();
            specifiedContainerNameRaw = fromMatch[2].trim();
        }

        const { index: itemIndex, name: targetName } = ParserUtils.parseOrdinal(targetNameRaw);
        const { index: containerIndex, name: specifiedContainerName } = specifiedContainerNameRaw ? ParserUtils.parseOrdinal(specifiedContainerNameRaw) : { index: 0, name: null };

        if (targetName === 'can') {
            // Special case for can, but we should keep targetName as 'can' for matching if needed
        }

        const itemMatches: Entity[] = [];

        if (!specifiedContainerName) {
            const itemsInRoom = WorldQuery.findItemsAt(engine, playerPos.x, playerPos.y);
            itemsInRoom.forEach(item => {
                const itemComp = item.getComponent(Item);
                if (itemComp && itemComp.name.toLowerCase().includes(targetName)) {
                    itemMatches.push(item);
                }
            });
        }

        let fromContainer = false;
        let containerEntity: Entity | undefined;
        let containerDisplayName = "";

        if (itemMatches.length <= itemIndex) {
            // Check hands and equipment for containers
            const containerMatches: { entity: Entity, name: string }[] = [];

            const checkContainer = (id: string | null) => {
                if (!id) return;
                const entity = WorldQuery.getEntityById(engine, id);
                const itemComp = entity?.getComponent(Item);
                const containerComp = entity?.getComponent(Container);
                if (itemComp && containerComp) {
                    if (!specifiedContainerName || itemComp.name.toLowerCase().includes(specifiedContainerName)) {
                        containerMatches.push({ entity: entity!, name: itemComp.name });
                    }
                }
            };

            checkContainer(inventory.leftHand);
            checkContainer(inventory.rightHand);
            for (const id of inventory.equipment.values()) {
                checkContainer(id);
            }

            const targetContainerEntity = containerMatches[containerIndex];
            if (targetContainerEntity) {
                const container = targetContainerEntity.entity.getComponent(Container);
                if (container) {
                    container.items.forEach(id => {
                        const item = WorldQuery.getEntityById(engine, id);
                        const i = item?.getComponent(Item);
                        if (i && i.name.toLowerCase().includes(targetName)) {
                            itemMatches.push(item!);
                        }
                    });

                    if (itemMatches.length > itemIndex) {
                        fromContainer = true;
                        containerEntity = targetContainerEntity.entity;
                        containerDisplayName = targetContainerEntity.name;
                    }
                }
            }
        }

        const targetItem = itemMatches[itemIndex];

        if (targetItem) {
            if (!inventory.leftHand || !inventory.rightHand) {
                const itemComp = targetItem.getComponent(Item);
                if (fromContainer && containerEntity) {
                    const container = containerEntity.getComponent(Container);
                    if (container) {
                        container.items = container.items.filter(id => id !== targetItem!.id);
                        container.currentWeight -= itemComp!.weight;
                    }
                } else {
                    targetItem.removeComponent(Position);
                }

                let sourceMsg = fromContainer ? ` from your ${containerDisplayName}` : "";
                if (!inventory.leftHand) {
                    inventory.leftHand = targetItem.id;
                    this.messageService.info(entityId, `You picked up the ${itemComp!.name}${sourceMsg} with your left hand.`);
                } else {
                    inventory.rightHand = targetItem.id;
                    this.messageService.info(entityId, `You picked up the ${itemComp!.name}${sourceMsg} with your right hand.`);
                }
                this.refreshAutocomplete(entityId, engine);
            } else {
                this.messageService.info(entityId, `Your hands are full!`);
            }
        } else {
            this.messageService.info(entityId, specifiedContainerName ? `You don't see a ${targetName} in your ${specifiedContainerName}.` : `You don't see a ${itemName} here.`);
        }
    }

    handleDrop(entityId: string, itemName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        const position = player.getComponent(Position);
        if (!inventory || !position) return;

        const { index, name: targetName } = ParserUtils.parseOrdinal(itemName.toLowerCase());
        const itemMatches: { id: string, source: 'left' | 'right' | Entity }[] = [];

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

        const backpackId = inventory.equipment.get('back');
        if (backpackId) {
            const backpack = WorldQuery.getEntityById(engine, backpackId);
            const container = backpack?.getComponent(Container);
            if (container) {
                container.items.forEach(id => {
                    const item = WorldQuery.getEntityById(engine, id);
                    if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                        itemMatches.push({ id, source: backpack! });
                    }
                });
            }
        }

        const match = itemMatches[index];
        let itemIdToDrop: string | null = match ? match.id : null;
        let fromHand: 'left' | 'right' | null = (match && typeof match.source === 'string') ? match.source as any : null;
        let fromContainer: Entity | null = (match && typeof match.source !== 'string') ? match.source as Entity : null;

        if (itemIdToDrop) {
            const itemEntity = WorldQuery.getEntityById(engine, itemIdToDrop);
            const itemComp = itemEntity?.getComponent(Item);

            if (itemEntity && itemComp) {
                if (fromHand === 'left') inventory.leftHand = null;
                else if (fromHand === 'right') inventory.rightHand = null;
                else if (fromContainer) {
                    const container = fromContainer.getComponent(Container);
                    if (container) {
                        container.items = container.items.filter(id => id !== itemIdToDrop);
                        container.currentWeight -= itemComp.weight;
                    }
                }

                itemEntity.addComponent(new Position(position.x, position.y));
                this.messageService.info(entityId, `You dropped the ${itemComp.name}.`);
                this.refreshAutocomplete(entityId, engine);
            }
        } else {
            this.messageService.info(entityId, `You don't have a ${itemName} to drop.`);
        }
    }

    handleStow(entityId: string, itemName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        let targetItemName = itemName.toLowerCase();
        let targetContainerName = 'backpack';

        const inMatch = targetItemName.match(/^(.+?)\s+in\s+(.+)$/);
        if (inMatch) {
            targetItemName = inMatch[1].trim();
            targetContainerName = inMatch[2].trim();
        }

        if (targetItemName === 'can') targetItemName = 'beer can';

        const { index: itemIndex, name: targetItemNameParsed } = ParserUtils.parseOrdinal(targetItemName);
        const { index: containerIndex, name: targetContainerNameParsed } = ParserUtils.parseOrdinal(targetContainerName);

        const itemMatches: { id: string, source: 'left' | 'right' }[] = [];
        if (inventory.leftHand) {
            const item = WorldQuery.getEntityById(engine, inventory.leftHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetItemNameParsed)) {
                itemMatches.push({ id: inventory.leftHand, source: 'left' });
            }
        }
        if (inventory.rightHand) {
            const item = WorldQuery.getEntityById(engine, inventory.rightHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetItemNameParsed)) {
                itemMatches.push({ id: inventory.rightHand, source: 'right' });
            }
        }

        const itemMatch = itemMatches[itemIndex];
        let itemIdToStow: string | null = itemMatch ? itemMatch.id : null;
        let fromHand: 'left' | 'right' | null = itemMatch ? itemMatch.source : null;

        if (!itemIdToStow) {
            this.messageService.info(entityId, `You aren't holding a ${targetItemNameParsed}.`);
            return;
        }

        let targetContainer: Entity | undefined = undefined;
        let containerName = '';

        const containerMatches: { entity: Entity, name: string }[] = [];
        const checkContainer = (id: string | null, skipId?: string) => {
            if (!id || id === skipId) return;
            const item = WorldQuery.getEntityById(engine, id);
            const itemComp = item?.getComponent(Item);
            const container = item?.getComponent(Container);
            if (container && itemComp && itemComp.name.toLowerCase().includes(targetContainerNameParsed)) {
                containerMatches.push({ entity: item!, name: itemComp.name });
            }
        };

        checkContainer(inventory.leftHand, itemIdToStow);
        checkContainer(inventory.rightHand, itemIdToStow);
        for (const equipId of inventory.equipment.values()) {
            checkContainer(equipId, itemIdToStow);
        }

        const containerMatch = containerMatches[containerIndex];
        if (containerMatch) {
            targetContainer = containerMatch.entity;
            containerName = containerMatch.name;
        }

        if (!targetContainer) {
            this.messageService.info(entityId, `You don't have a ${targetContainerName}.`);
            return;
        }

        const container = targetContainer.getComponent(Container);
        const itemToStow = WorldQuery.getEntityById(engine, itemIdToStow);
        const itemComp = itemToStow?.getComponent(Item);

        if (container && itemComp) {
            if (container.currentWeight + itemComp.weight <= container.maxWeight) {
                container.items.push(itemIdToStow!);
                container.currentWeight += itemComp.weight;
                if (fromHand === 'left') inventory.leftHand = null;
                if (fromHand === 'right') inventory.rightHand = null;
                this.messageService.info(entityId, `You put the ${itemComp.name} in your ${containerName}.`);
                this.refreshAutocomplete(entityId, engine);
            } else {
                this.messageService.info(entityId, `Your ${containerName} is too heavy!`);
            }
        }
    }

    handleSwap(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const leftItem = inventory.leftHand ? WorldQuery.getEntityById(engine, inventory.leftHand) : null;
        const rightItem = inventory.rightHand ? WorldQuery.getEntityById(engine, inventory.rightHand) : null;

        if (!leftItem && !rightItem) {
            this.messageService.info(entityId, "You have nothing in your hands to swap.");
            return;
        }

        const temp = inventory.leftHand;
        inventory.leftHand = inventory.rightHand;
        inventory.rightHand = temp;

        if (leftItem && rightItem) {
            const leftName = leftItem.getComponent(Item)?.name;
            const rightName = rightItem.getComponent(Item)?.name;
            this.messageService.info(entityId, `You swapped the ${leftName} and ${rightName} between your hands.`);
        } else if (leftItem) {
            const name = leftItem.getComponent(Item)?.name;
            this.messageService.info(entityId, `You moved the ${name} to your right hand.`);
        } else if (rightItem) {
            const name = rightItem.getComponent(Item)?.name;
            this.messageService.info(entityId, `You moved the ${name} to your left hand.`);
        }
        this.refreshAutocomplete(entityId, engine);
    }

    handleInventory(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getItemName = (id: string | null) => {
            if (!id) return "Empty";
            const item = WorldQuery.getEntityById(engine, id);
            const itemComp = item?.getComponent(Item);
            return itemComp ? MessageFormatter.item(itemComp.name, id) : "Unknown";
        };

        this.io.to(entityId).emit('inventory-data', {
            leftHand: getItemName(inventory.leftHand),
            rightHand: getItemName(inventory.rightHand),
            backpack: getItemName(inventory.equipment.get('back') || null),
            head: getItemName(inventory.equipment.get('head') || null),
            torso: getItemName(inventory.equipment.get('torso') || null),
            legs: getItemName(inventory.equipment.get('legs') || null),
            feet: getItemName(inventory.equipment.get('feet') || null),
            waist: getItemName(inventory.equipment.get('waist') || null),
            backpackContents: DescriptionService.getBackpackContents(inventory, engine),
            currency: {
                newYen: player.getComponent(Credits)?.newYen || 0,
                credits: player.getComponent(Credits)?.credits || 0
            }
        });
        this.refreshAutocomplete(entityId, engine);
    }

    handleWear(entityId: string, itemName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const { index, name: targetName } = ParserUtils.parseOrdinal(itemName.toLowerCase());
        const itemMatches: { entity: Entity, source: 'left' | 'right' | 'ground' }[] = [];

        if (inventory.leftHand) {
            const item = WorldQuery.getEntityById(engine, inventory.leftHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemMatches.push({ entity: item!, source: 'left' });
            }
        }

        if (inventory.rightHand) {
            const item = WorldQuery.getEntityById(engine, inventory.rightHand);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemMatches.push({ entity: item!, source: 'right' });
            }
        }

        const playerPos = player.getComponent(Position);
        if (playerPos) {
            const itemsInRoom = WorldQuery.findItemsAt(engine, playerPos.x, playerPos.y);
            itemsInRoom.forEach(item => {
                if (item.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                    itemMatches.push({ entity: item, source: 'ground' });
                }
            });
        }

        const match = itemMatches[index];
        if (!match) {
            const ordinalStr = index > 0 ? `${ParserUtils.ORDINAL_NAMES[index] || (index + 1) + 'th'} ` : '';
            this.messageService.info(entityId, `You don't have a ${ordinalStr}${targetName} to wear.`);
            return;
        }

        const itemToWear = match.entity;
        const fromHand = match.source === 'ground' ? null : match.source;
        const fromGround = match.source === 'ground';

        const itemComp = itemToWear.getComponent(Item);
        if (!itemComp) return;

        let slot = itemComp.slot;
        if (!slot) {
            const n = itemComp.name.toLowerCase();
            if (n.includes('backpack')) slot = 'back';
            else if (n.includes('shirt') || n.includes('jacket')) slot = 'torso';
            else if (n.includes('pants')) slot = 'legs';
            else if (n.includes('belt')) slot = 'waist';
            else if (n.includes('helmet')) slot = 'head';
            else if (n.includes('boots')) slot = 'feet';
            else {
                this.messageService.info(entityId, `You can't wear the ${itemComp.name}.`);
                return;
            }
            itemComp.slot = slot;
        }

        if (Array.from(inventory.equipment.values()).includes(itemToWear.id)) {
            this.messageService.info(entityId, `You're already wearing the ${itemComp.name}.`);
            return;
        }

        if (inventory.equipment.get(slot)) {
            this.messageService.info(entityId, `You're already wearing something on your ${slot}.`);
            return;
        }

        if (fromHand === 'left') inventory.leftHand = null;
        else if (fromHand === 'right') inventory.rightHand = null;
        else if (fromGround) itemToWear.removeComponent(Position);

        inventory.equipment.set(slot, itemToWear.id);
        this.messageService.success(entityId, `You wear the ${itemComp.name} on your ${slot}.`);
        this.refreshAutocomplete(entityId, engine);
    }

    handleRemove(entityId: string, itemName: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const { index, name: targetName } = ParserUtils.parseOrdinal(itemName.toLowerCase());
        const itemMatches: { entity: Entity, slot: string }[] = [];

        for (const [s, id] of inventory.equipment) {
            const item = WorldQuery.getEntityById(engine, id);
            if (item?.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemMatches.push({ entity: item!, slot: s });
            }
        }

        const match = itemMatches[index];
        if (!match) {
            const ordinalStr = index > 0 ? `${ParserUtils.ORDINAL_NAMES[index] || (index + 1) + 'th'} ` : '';
            this.messageService.info(entityId, `You aren't wearing a ${ordinalStr}${targetName}.`);
            return;
        }

        const itemToRemove = match.entity;
        const slot = match.slot;

        const itemComp = itemToRemove.getComponent(Item);
        inventory.equipment.delete(slot);

        if (!inventory.leftHand) {
            inventory.leftHand = itemToRemove.id;
            this.messageService.success(entityId, `You remove the ${itemComp!.name} and hold it in your left hand.`);
        } else if (!inventory.rightHand) {
            inventory.rightHand = itemToRemove.id;
            this.messageService.success(entityId, `You remove the ${itemComp!.name} and hold it in your right hand.`);
        } else {
            const pos = player.getComponent(Position);
            if (pos) itemToRemove.addComponent(new Position(pos.x, pos.y));
            this.messageService.success(entityId, `You remove the ${itemComp!.name} and drop it on the ground.`);
        }
        this.refreshAutocomplete(entityId, engine);
    }

    handleUse(entityId: string, itemName: string, engine: IEngine) {
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
            this.messageService.info(entityId, `You don't have a ${itemName} to use.`);
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
            this.messageService.success(entityId, `You use the medkit and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('stimpack')) {
            combatStats.fatigue = 0;
            combatStats.balance = 1.0;
            this.messageService.success(entityId, `You use the stimpack. You feel a surge of energy! Your fatigue is gone and your balance is restored.`);
            used = true;
        } else if (name.includes('bandage')) {
            const healAmount = 15;
            const oldHp = combatStats.hp;
            combatStats.hp = Math.min(combatStats.maxHp, combatStats.hp + healAmount);
            const actualHeal = combatStats.hp - oldHp;
            this.messageService.success(entityId, `You use the bandage and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('painkillers')) {
            const healAmount = 25;
            const oldHp = combatStats.hp;
            combatStats.hp = Math.min(combatStats.maxHp, combatStats.hp + healAmount);
            const actualHeal = combatStats.hp - oldHp;
            this.messageService.success(entityId, `You take the painkillers and heal for ${actualHeal} HP.`);
            used = true;
        } else if (name.includes('water bottle')) {
            combatStats.fatigue = Math.max(0, combatStats.fatigue - 20);
            this.messageService.success(entityId, `You drink the water. It's refreshing! Your fatigue decreases.`);
            used = true;
        }

        if (used) {
            this.consumeItem(player, match.id, match.source, engine);
            this.refreshAutocomplete(entityId, engine);
        } else {
            this.messageService.info(entityId, `You can't use the ${itemComp.name} yet.`);
        }
    }

    private consumeItem(player: Entity, itemId: string, source: string, engine: IEngine) {
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

    private refreshAutocomplete(entityId: string, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (player) {
            const data = AutocompleteAggregator.getInventoryAutocomplete(player, engine);
            this.io.to(entityId).emit('autocomplete-update', data);

            // Samurai Momentum Reset Check
            this.checkMomentumReset(player, engine);
        }
    }

    private checkMomentumReset(player: Entity, engine: IEngine) {
        const momentum = player.getComponent(Momentum);
        if (!momentum || momentum.current === 0) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const rightHandItem = inventory.rightHand ? WorldQuery.getEntityById(engine, inventory.rightHand) : null;
        const weapon = rightHandItem?.getComponent(Weapon);
        const weaponName = weapon?.name.toLowerCase() || '';

        // If holding something that isn't a katana (or nothing), reset momentum
        if (!weapon || !(weaponName.includes('katana') || weaponName.includes('kitana') || weaponName.includes('samurai sword'))) {
            momentum.reset();
            this.messageService.info(player.id, "<error>[MOMENTUM] Your flow is broken as you switch weapons.</error>");
        }
    }
}
