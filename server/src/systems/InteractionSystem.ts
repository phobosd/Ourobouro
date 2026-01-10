import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Item } from '../components/Item';
import { Inventory } from '../components/Inventory';
import { NPC } from '../components/NPC';
import { Shop } from '../components/Shop';
import { Container } from '../components/Container';
import { Stats } from '../components/Stats';
import { CombatStats } from '../components/CombatStats';
import { Server } from 'socket.io';

export class InteractionSystem extends System {
    private io: Server;

    constructor(io: Server) {
        super();
        this.io = io;
    }

    update(entities: Set<Entity>, deltaTime: number): void {
        // This system is mostly event-driven for now, but could handle timed interactions later
    }

    handleLook(entityId: string, entities: Set<Entity>, targetName?: string) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // If looking at a specific target
        if (targetName) {
            // Check for NPCs
            const npcsInRoom = this.findNPCsAt(entities, playerPos.x, playerPos.y);
            const targetNPC = npcsInRoom.find(npc => {
                const npcComp = npc.getComponent(NPC);
                return npcComp && npcComp.typeName.toLowerCase().includes(targetName.toLowerCase());
            });

            if (targetNPC) {
                const npcComp = targetNPC.getComponent(NPC);
                if (npcComp) {
                    const message = `
<title>[${npcComp.typeName}]</title>
<desc>${npcComp.description}</desc>
<portrait>${npcComp.asciiPortrait}</portrait>
                    `.trim();
                    this.io.to(entityId).emit('message', message);
                    return;
                }
            }

            this.io.to(entityId).emit('message', `You don't see ${targetName} here.`);
            return;
        }

        // Default Look (Room)
        // Find the room the player is in
        const room = this.findRoomAt(entities, playerPos.x, playerPos.y);
        if (!room) return;

        const roomDesc = room.getComponent(Description);
        if (!roomDesc) return;

        // Find items in the room
        const itemsInRoom = this.findItemsAt(entities, playerPos.x, playerPos.y);
        const itemDescriptions = itemsInRoom.map(item => {
            const itemComp = item.getComponent(Item);
            return itemComp ? `<item>There is a ${itemComp.name} here.</item>` : '';
        }).join('\n');

        // Find NPCs in the room
        const npcsInRoom = this.findNPCsAt(entities, playerPos.x, playerPos.y);
        const npcDescriptions = npcsInRoom.map(npc => {
            const npcComp = npc.getComponent(NPC);
            const combatStats = npc.getComponent(CombatStats);
            if (npcComp) {
                // Enemies (with CombatStats) are red
                if (combatStats) {
                    return `<enemy>${npcComp.typeName} is standing here.</enemy>`;
                } else {
                    return `<npc>${npcComp.typeName} is standing here.</npc>`;
                }
            }
            return '';
        }).join('\n');

        // Calculate Exits
        const exits = [];
        if (this.findRoomAt(entities, playerPos.x, playerPos.y - 1)) exits.push('N');
        if (this.findRoomAt(entities, playerPos.x, playerPos.y + 1)) exits.push('S');
        if (this.findRoomAt(entities, playerPos.x + 1, playerPos.y)) exits.push('E');
        if (this.findRoomAt(entities, playerPos.x - 1, playerPos.y)) exits.push('W');

        // Generate Mini-Map (5x5)
        let miniMap = "";
        const range = 2; // +/- 2 tiles
        for (let y = playerPos.y - range; y <= playerPos.y + range; y++) {
            let row = "";
            for (let x = playerPos.x - range; x <= playerPos.x + range; x++) {
                if (x === playerPos.x && y === playerPos.y) {
                    row += "<map-player>@</map-player>";
                } else {
                    const r = this.findRoomAt(entities, x, y);
                    if (r) {
                        const shop = r.getComponent(Shop);
                        const desc = r.getComponent(Description);

                        if (shop) {
                            if (shop.name.includes("Clinic")) {
                                row += "<map-clinic>+</map-clinic>";
                            } else {
                                row += "<map-shop>$</map-shop>";
                            }
                        } else if (desc?.title.includes("Club")) {
                            row += "<map-club>♫</map-club>";
                        } else if (desc?.title.includes("Park")) {
                            row += "<map-grass>T</map-grass>";
                        } else if (desc?.title.includes("Plaza")) {
                            row += "<map-street>#</map-street>";
                        } else if (desc?.title.includes("Street")) {
                            row += "<map-street>.</map-street>";
                        } else {
                            row += "<map-wall>#</map-wall>";
                        }
                    } else {
                        row += " "; // Empty space
                    }
                }
                row += " "; // Spacing
            }
            miniMap += row + "\n";
        }

        const fullDescription = `
<title>[${roomDesc.title}]</title>
<desc>${roomDesc.description}</desc>
<exits>Exits: ${exits.join(', ')}</exits>
${miniMap}
${itemDescriptions}
${npcDescriptions}
    `.trim();

        this.io.to(entityId).emit('message', fullDescription);
    }

    handleMap(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        let mapOutput = '<title>[Ouroboro City Map]</title>\n';

        // 20x20 grid
        const width = 20;
        const height = 20;

        for (let y = 0; y < height; y++) {
            let row = "";
            for (let x = 0; x < width; x++) {
                if (x === playerPos.x && y === playerPos.y) {
                    row += "<map-player>@</map-player>";
                } else {
                    const room = this.findRoomAt(entities, x, y);
                    if (room) {
                        const shop = room.getComponent(Shop);
                        const desc = room.getComponent(Description);

                        if (shop) {
                            if (shop.name.includes("Clinic")) {
                                row += "<map-clinic>+</map-clinic>";
                            } else {
                                row += "<map-shop>$</map-shop>";
                            }
                        } else if (desc?.title.includes("Club")) {
                            row += "<map-club>♫</map-club>";
                        } else if (desc?.title.includes("Park")) {
                            row += "<map-grass>T</map-grass>";
                        } else if (desc?.title.includes("Plaza")) {
                            row += "<map-street>#</map-street>";
                        } else if (desc?.title.includes("Street")) {
                            row += "<map-street>.</map-street>";
                        } else {
                            row += "<map-wall>#</map-wall>";
                        }
                    } else {
                        row += " "; // Empty space
                    }
                }
                row += " "; // Spacing
            }
            mapOutput += row + "\n";
        }

        // Legend
        mapOutput += '\n<legend>Key:</legend>\n';
        mapOutput += '<map-player>@</map-player> <legend>You</legend>  ';
        mapOutput += '<map-shop>$</map-shop> <legend>Shop</legend>  ';
        mapOutput += '<map-clinic>+</map-clinic> <legend>Clinic</legend>  ';
        mapOutput += '<map-club>♫</map-club> <legend>Club</legend>  ';
        mapOutput += '<map-grass>T</map-grass> <legend>Park</legend>  ';
        mapOutput += '<map-street>.</map-street> <legend>Street</legend>';

        this.io.to(entityId).emit('message', mapOutput);
    }

    handleGet(entityId: string, itemName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        const inventory = player.getComponent(Inventory);
        if (!playerPos || !inventory) return;

        // Clean up input (remove "from backpack" etc)
        let targetName = itemName.toLowerCase().replace('from backpack', '').trim();
        if (targetName === 'can') targetName = 'beer can'; // Specific alias for convenience

        // 1. Try to find item in current location (Room)
        const itemsInRoom = this.findItemsAt(entities, playerPos.x, playerPos.y);
        let targetItem = itemsInRoom.find(item => {
            const itemComp = item.getComponent(Item);
            return itemComp && itemComp.name.toLowerCase().includes(targetName);
        });

        let fromContainer = false;
        let containerEntity: Entity | undefined;

        // 2. If not in room, try to find in Backpack
        if (!targetItem) {
            const backpackId = inventory.equipment.get('back');
            if (backpackId) {
                const backpack = this.getEntityById(entities, backpackId);
                const container = backpack?.getComponent(Container);
                if (container) {
                    const itemId = container.items.find(id => {
                        const item = this.getEntityById(entities, id);
                        return item?.getComponent(Item)?.name.toLowerCase().includes(targetName);
                    });
                    if (itemId) {
                        targetItem = this.getEntityById(entities, itemId);
                        fromContainer = true;
                        containerEntity = backpack;
                    }
                }
            }
        }

        if (targetItem) {
            // Check hands
            if (!inventory.leftHand || !inventory.rightHand) {
                const itemComp = targetItem.getComponent(Item);

                // Logic to move item
                if (fromContainer && containerEntity) {
                    const container = containerEntity.getComponent(Container);
                    if (container) {
                        container.items = container.items.filter(id => id !== targetItem!.id);
                        container.currentWeight -= itemComp!.weight;
                    }
                } else {
                    targetItem.removeComponent(Position);
                }

                // Place in hand
                let sourceMsg = "";
                if (fromContainer) {
                    sourceMsg = " from your backpack";
                }

                if (!inventory.leftHand) {
                    inventory.leftHand = targetItem.id;
                    this.io.to(entityId).emit('message', `You picked up the ${itemComp!.name}${sourceMsg} with your left hand.`);
                } else {
                    inventory.rightHand = targetItem.id;
                    this.io.to(entityId).emit('message', `You picked up the ${itemComp!.name}${sourceMsg} with your right hand.`);
                }
            } else {
                this.io.to(entityId).emit('message', `Your hands are full!`);
            }
        } else {
            this.io.to(entityId).emit('message', `You don't see a ${itemName} here.`);
        }
    }

    handleInventory(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getHandContent = (handId: string | null) => {
            if (!handId) return "Empty";
            const item = this.getEntityById(entities, handId);
            return item?.getComponent(Item)?.name || "Unknown";
        };

        const leftHand = getHandContent(inventory.leftHand);
        const rightHand = getHandContent(inventory.rightHand);

        let output = `\n`;
        output += `+-----------------------+-----------------------+\n`;
        output += `| LEFT HAND             | RIGHT HAND            |\n`;
        output += `+-----------------------+-----------------------+\n`;
        output += `| ${leftHand.padEnd(21)} | ${rightHand.padEnd(21)} |\n`;
        output += `+-----------------------+-----------------------+\n`;

        // Equipment / Containers
        inventory.equipment.forEach((itemId, slot) => {
            const item = this.getEntityById(entities, itemId);
            const itemComp = item?.getComponent(Item);
            const containerComp = item?.getComponent(Container);

            if (itemComp) {
                output += `\n`;
                // Header for the container/equipment
                const slotName = slot.toUpperCase();
                let rightHeader = "";
                if (containerComp) {
                    rightHeader = `[ ${containerComp.currentWeight.toFixed(1)}/${containerComp.maxWeight} lbs ]`;
                }

                output += `+-----------------------+-----------------------+\n`;
                output += `| ${slotName.padEnd(21)} | ${rightHeader.padStart(21)} |\n`;
                output += `+-----------------------+-----------------------+\n`;

                if (containerComp) {
                    if (containerComp.items.length > 0) {
                        containerComp.items.forEach(contentId => {
                            const contentItem = this.getEntityById(entities, contentId);
                            const contentItemComp = contentItem?.getComponent(Item);
                            const name = contentItemComp?.name || "Unknown";
                            const quantity = contentItemComp?.quantity || 1;
                            const displayName = quantity > 1 ? `${name} (x${quantity})` : name;
                            const weight = contentItemComp?.weight.toFixed(1) + " lbs";

                            output += `| ${displayName.padEnd(21)} | ${weight.padStart(21)} |\n`;
                        });
                    } else {
                        output += `| (Empty)               |                       |\n`;
                    }
                } else {
                    output += `| ${itemComp.name.padEnd(21)} |                       |\n`;
                }
                output += `+-----------------------+-----------------------+\n`;
            }
        });

        this.io.to(entityId).emit('message', output);
    }

    handleStow(entityId: string, itemName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        // Clean up input
        let targetName = itemName.toLowerCase();

        // Handle "put X in Y" syntax
        // For now, we only support putting things in the backpack/back
        targetName = targetName.replace(/\s+(in|into)\s+(back|backpack|bag)$/, '').trim();

        if (targetName === 'can') targetName = 'beer can';

        // Find item in hands with fuzzy match
        let itemIdToStow: string | null = null;
        let fromHand: 'left' | 'right' | null = null;

        if (inventory.leftHand) {
            const item = this.getEntityById(entities, inventory.leftHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemIdToStow = inventory.leftHand;
                fromHand = 'left';
            }
        }

        if (!itemIdToStow && inventory.rightHand) {
            const item = this.getEntityById(entities, inventory.rightHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemIdToStow = inventory.rightHand;
                fromHand = 'right';
            }
        }

        if (!itemIdToStow) {
            this.io.to(entityId).emit('message', `You aren't holding a ${itemName}.`);
            return;
        }

        // Find a container (Backpack)
        // For now, assume 'back' slot has the backpack
        const backpackId = inventory.equipment.get('back');
        if (!backpackId) {
            this.io.to(entityId).emit('message', `You don't have a backpack.`);
            return;
        }

        const backpack = this.getEntityById(entities, backpackId);
        const container = backpack?.getComponent(Container);
        const itemToStow = this.getEntityById(entities, itemIdToStow);
        const itemComp = itemToStow?.getComponent(Item);

        if (container && itemComp) {
            if (container.currentWeight + itemComp.weight <= container.maxWeight) {
                // Success
                container.items.push(itemIdToStow);
                container.currentWeight += itemComp.weight;

                if (fromHand === 'left') inventory.leftHand = null;
                if (fromHand === 'right') inventory.rightHand = null;

                this.io.to(entityId).emit('message', `You put the ${itemComp.name} in your backpack.`);
            } else {
                this.io.to(entityId).emit('message', `Your backpack is too heavy!`);
            }
        }
    }

    handleSwap(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const leftItem = inventory.leftHand ? this.getEntityById(entities, inventory.leftHand) : null;
        const rightItem = inventory.rightHand ? this.getEntityById(entities, inventory.rightHand) : null;

        if (!leftItem && !rightItem) {
            this.io.to(entityId).emit('message', "You have nothing in your hands to swap.");
            return;
        }

        // Perform Swap
        const temp = inventory.leftHand;
        inventory.leftHand = inventory.rightHand;
        inventory.rightHand = temp;

        // Generate Message
        if (leftItem && rightItem) {
            const leftName = leftItem.getComponent(Item)?.name;
            const rightName = rightItem.getComponent(Item)?.name;
            this.io.to(entityId).emit('message', `You swapped the ${leftName} and ${rightName} between your hands.`);
        } else if (leftItem) {
            // Was in left, now in right
            const name = leftItem.getComponent(Item)?.name;
            this.io.to(entityId).emit('message', `You moved the ${name} to your right hand.`);
        } else if (rightItem) {
            // Was in right, now in left
            const name = rightItem.getComponent(Item)?.name;
            this.io.to(entityId).emit('message', `You moved the ${name} to your left hand.`);
        }
    }

    handleSheet(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const stats = player.getComponent(Stats);
        if (!stats) {
            this.io.to(entityId).emit('message', "You don't have a character sheet.");
            return;
        }

        let output = `<text-title>=== CHARACTER SHEET ===</text-title>\n\n`;

        // Attributes Table
        output += `+-----------------------+-----------------------+\n`;
        output += `| ATTRIBUTE             | VALUE                 |\n`;
        output += `+-----------------------+-----------------------+\n`;
        for (const [key, attr] of stats.attributes) {
            let fullName = attr.name;
            if (attr.name === 'STR') fullName = 'Strength';
            if (attr.name === 'CON') fullName = 'Constitution';
            if (attr.name === 'AGI') fullName = 'Agility';
            if (attr.name === 'CHA') fullName = 'Charisma';

            output += `| ${fullName.padEnd(21)} | ${attr.value.toString().padEnd(21)} |\n`;
        }
        output += `+-----------------------+-----------------------+\n\n`;



        this.io.to(entityId).emit('message', output);
    }

    handleScore(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const stats = player.getComponent(Stats);
        if (!stats) {
            this.io.to(entityId).emit('message', "You don't have a character sheet.");
            return;
        }

        let output = `\n`;
        // Skills Table
        output += `+-----------------------+-------+---------------+\n`;
        output += `| SKILL                 | LEVEL | PROGRESS      |\n`;
        output += `+-----------------------+-------+---------------+\n`;

        for (const [key, skill] of stats.skills) {
            const percent = Math.floor((skill.uses / skill.maxUses) * 100);
            const barLength = 5;
            const filledLength = Math.floor((percent / 100) * barLength);
            const bar = '#'.repeat(filledLength) + '-'.repeat(barLength - filledLength);

            // Format: [###--]72%
            const progressStr = `[${bar}]${percent}%`;

            output += `| ${skill.name.padEnd(21)} | ${skill.level.toString().padStart(2, '0').padEnd(5)} | ${progressStr.padEnd(13)} |\n`;
        }
        output += `+-----------------------+-------+---------------+\n`;

        this.io.to(entityId).emit('message', output);
    }

    private getEntityById(entities: Set<Entity>, id: string): Entity | undefined {
        return Array.from(entities).find(e => e.id === id);
    }

    private findRoomAt(entities: Set<Entity>, x: number, y: number): Entity | undefined {
        for (const entity of entities) {
            if (entity.hasComponent(IsRoom)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    return entity;
                }
            }
        }
        return undefined;
    }

    private findItemsAt(entities: Set<Entity>, x: number, y: number): Entity[] {
        const items: Entity[] = [];
        for (const entity of entities) {
            if (entity.hasComponent(Item)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    items.push(entity);
                }
            }
        }
        return items;
    }

    private findNPCsAt(entities: Set<Entity>, x: number, y: number): Entity[] {
        const npcs: Entity[] = [];
        for (const entity of entities) {
            if (entity.hasComponent(NPC)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    npcs.push(entity);
                }
            }
        }
        return npcs;
    }
}
