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
import { Stance, StanceType } from '../components/Stance';
import { Terminal } from '../components/Terminal';
import { PrefabFactory } from '../factories/PrefabFactory';
import { PuzzleObject } from '../components/PuzzleObject';
import { Engine } from '../ecs/Engine';
import { Server } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

export class InteractionSystem extends System {
    private io: Server;

    constructor(io: Server) {
        super();
        this.io = io;
    }

    private getEntityById(entities: Set<Entity>, id: string): Entity | undefined {
        for (const entity of entities) {
            if (entity.id === id) return entity;
        }
        return undefined;
    }

    private findRoomAt(entities: Set<Entity>, x: number, y: number): Entity | undefined {
        return Array.from(entities).find(e => {
            const pos = e.getComponent(Position);
            return e.hasComponent(IsRoom) && pos && pos.x === x && pos.y === y;
        });
    }

    private findNPCsAt(entities: Set<Entity>, x: number, y: number): Entity[] {
        return Array.from(entities).filter(e => {
            const pos = e.getComponent(Position);
            return e.hasComponent(NPC) && pos && pos.x === x && pos.y === y;
        });
    }

    private findItemsAt(entities: Set<Entity>, x: number, y: number): Entity[] {
        return Array.from(entities).filter(e => {
            const pos = e.getComponent(Position);
            return e.hasComponent(Item) && pos && pos.x === x && pos.y === y;
        });
    }

    update(entities: Set<Entity>, deltaTime: number): void {
        // This system is mostly event-driven for now, but could handle timed interactions later
    }

    handleStanceChange(entityId: string, newStance: StanceType, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        if (!stance) return;

        if (stance.current === newStance) {
            this.io.to(entityId).emit('message', `You are already ${newStance}.`);
            return;
        }

        stance.current = newStance;
        let msg = "";
        switch (newStance) {
            case StanceType.Standing: msg = "<system>You stand up.</system>"; break;
            case StanceType.Sitting: msg = "<system>You sit down.</system>"; break;
            case StanceType.Lying: msg = "<system>You lie down.</system>"; break;
        }

        this.io.to(entityId).emit('message', msg);
    }

    handleLook(entityId: string, entities: Set<Entity>, targetName?: string) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // If looking at a specific target
        if (targetName) {
            // Check if this is "look in <container>"
            if (targetName.startsWith('in ')) {
                const containerName = targetName.substring(3).trim();
                return this.handleLookInContainer(entityId, containerName, entities);
            }

            // Check for plural "busts" or "pedestals"
            if (targetName.toLowerCase() === 'busts' || targetName.toLowerCase() === 'pedestals') {
                const puzzleObjects = Array.from(entities).filter(e => {
                    const pos = e.getComponent(Position);
                    const p = e.getComponent(PuzzleObject);
                    return pos && p && pos.x === playerPos.x && pos.y === playerPos.y;
                });

                if (puzzleObjects.length > 0) {
                    let message = "<title>[Puzzle Objects]</title>\n";
                    puzzleObjects.forEach(obj => {
                        const desc = obj.getComponent(Description);
                        if (desc) {
                            message += `<item>- ${desc.title}</item>\n`;
                        }
                    });
                    this.io.to(entityId).emit('message', message);
                    return;
                } else {
                    this.io.to(entityId).emit('message', "You don't see any busts or pedestals here.");
                    return;
                }
            }

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
                    `.trim();
                    this.io.to(entityId).emit('message', message);
                    return;
                }
            }

            // Check for other entities (Terminals, Objects, PuzzleObjects)
            const targetEntity = Array.from(entities).find(e => {
                const pos = e.getComponent(Position);
                const desc = e.getComponent(Description);
                // Check if name matches directly or if it's a "bust" and the name contains the specific type
                return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y && (
                    desc.title.toLowerCase().includes(targetName.toLowerCase()) ||
                    (targetName.toLowerCase() === 'bust' && desc.title.toLowerCase().includes('bust')) ||
                    (targetName.toLowerCase() === 'table' && desc.title.toLowerCase().includes('table'))
                );
            });

            if (targetEntity) {
                const desc = targetEntity.getComponent(Description);
                if (desc) {
                    this.io.to(entityId).emit('message', desc.description);
                    return;
                }
            }

            // Check inventory
            const inventory = player.getComponent(Inventory);
            if (inventory) {
                const checkItem = (itemId: string): boolean => {
                    const itemEntity = this.getEntityById(entities, itemId);
                    if (!itemEntity) return false;
                    const item = itemEntity.getComponent(Item);
                    if (item && item.name.toLowerCase().includes(targetName.toLowerCase())) {
                        const message = `
<title>[${item.name}]</title>
<desc>${item.description}</desc>
<item-stats>Weight: ${item.weight}kg | Size: ${item.size}</item-stats>
                        `.trim();
                        this.io.to(entityId).emit('message', message);
                        return true;
                    }

                    // Check inside container
                    const container = itemEntity.getComponent(Container);
                    if (container) {
                        for (const subItemId of container.items) {
                            if (checkItem(subItemId)) return true;
                        }
                    }
                    return false;
                };

                if (inventory.leftHand && checkItem(inventory.leftHand)) return;
                if (inventory.rightHand && checkItem(inventory.rightHand)) return;

                for (const [slot, itemId] of inventory.equipment) {
                    if (checkItem(itemId)) return;
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

        // Find Terminals in the room
        const terminalsInRoom = Array.from(entities).filter(e => {
            const pos = e.getComponent(Position);
            return e.hasComponent(Terminal) && pos && pos.x === playerPos.x && pos.y === playerPos.y;
        });
        const terminalDescriptions = terminalsInRoom.map(term => {
            return `<terminal>A Shop Terminal is here.</terminal>`;
        }).join('\n');

        // Construct Message
        let message = `<title>${roomDesc.title}</title>`;
        message += `<room-desc>${roomDesc.description}</room-desc>\n`;

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

        // Append terminal description to room description if present
        let terminalText = "";
        if (terminalsInRoom.length > 0) {
            terminalText = "\n<terminal>A Shop Terminal is here.</terminal>";
        }

        const fullDescription = `<title>[${roomDesc.title}]</title><desc>${roomDesc.description}</desc>${terminalText}
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

    handleLookInContainer(entityId: string, containerName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        // Search for the container in equipped items
        let targetContainer: Entity | undefined = undefined;
        for (const itemId of inventory.equipment.values()) {
            const item = this.getEntityById(entities, itemId);
            const itemComp = item?.getComponent(Item);
            if (itemComp && itemComp.name.toLowerCase().includes(containerName.toLowerCase())) {
                targetContainer = item;
                break;
            }
        }

        if (!targetContainer) {
            this.io.to(entityId).emit('message', `You don't have a ${containerName}.`);
            return;
        }

        const container = targetContainer.getComponent(Container);
        if (!container) {
            this.io.to(entityId).emit('message', `The ${containerName} is not a container.`);
            return;
        }

        const itemComp = targetContainer.getComponent(Item);
        const containerDisplayName = itemComp?.name || containerName;

        if (container.items.length === 0) {
            this.io.to(entityId).emit('message', `The ${containerDisplayName} is empty.`);
            return;
        }

        // List contents
        let output = `\n<title>Contents of ${containerDisplayName}:</title>\n`;
        container.items.forEach(id => {
            const item = this.getEntityById(entities, id);
            const i = item?.getComponent(Item);
            if (i) {
                const displayName = i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name;
                output += `<item>  - ${displayName}</item>\n`;
            }
        });

        this.io.to(entityId).emit('message', output);
    }

    handleGet(entityId: string, itemName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        const inventory = player.getComponent(Inventory);
        if (!playerPos || !inventory) return;

        // Clean up input
        let targetName = itemName.toLowerCase();
        let specifiedContainerName: string | null = null;

        // Handle "get X from Y" syntax
        const fromMatch = targetName.match(/^(.+?)\s+from\s+(.+)$/);
        if (fromMatch) {
            targetName = fromMatch[1].trim();
            specifiedContainerName = fromMatch[2].trim();
        }

        if (targetName === 'can') targetName = 'beer can'; // Specific alias for convenience

        // 1. Try to find item in current location (Room)
        // Only if no container was specified
        let targetItem: Entity | undefined = undefined;
        if (!specifiedContainerName) {
            const itemsInRoom = this.findItemsAt(entities, playerPos.x, playerPos.y);
            targetItem = itemsInRoom.find(item => {
                const itemComp = item.getComponent(Item);
                return itemComp && itemComp.name.toLowerCase().includes(targetName);
            });
        }

        let fromContainer = false;
        let containerEntity: Entity | undefined;
        let containerDisplayName = "";

        // 2. Search in equipped containers
        if (!targetItem) {
            for (const itemId of inventory.equipment.values()) {
                const equipEntity = this.getEntityById(entities, itemId);
                const container = equipEntity?.getComponent(Container);
                const equipItem = equipEntity?.getComponent(Item);

                if (container && equipItem) {
                    // If a container was specified, check if this is it
                    if (specifiedContainerName && !equipItem.name.toLowerCase().includes(specifiedContainerName)) {
                        continue;
                    }

                    const itemIdInContainer = container.items.find(id => {
                        const item = this.getEntityById(entities, id);
                        const i = item?.getComponent(Item);
                        return i && i.name.toLowerCase().includes(targetName);
                    });

                    if (itemIdInContainer) {
                        targetItem = this.getEntityById(entities, itemIdInContainer);
                        fromContainer = true;
                        containerEntity = equipEntity;
                        containerDisplayName = equipItem.name;
                        break;
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
                    sourceMsg = ` from your ${containerDisplayName}`;
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
            if (specifiedContainerName) {
                this.io.to(entityId).emit('message', `You don't see a ${targetName} in your ${specifiedContainerName}.`);
            } else {
                this.io.to(entityId).emit('message', `You don't see a ${itemName} here.`);
            }
        }
    }

    handleDrop(entityId: string, itemName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        const position = player.getComponent(Position);
        if (!inventory || !position) return;

        let targetName = itemName.toLowerCase();

        // Check hands first
        let itemIdToDrop: string | null = null;
        let fromHand: 'left' | 'right' | null = null;

        if (inventory.leftHand) {
            const item = this.getEntityById(entities, inventory.leftHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemIdToDrop = inventory.leftHand;
                fromHand = 'left';
            }
        }

        if (!itemIdToDrop && inventory.rightHand) {
            const item = this.getEntityById(entities, inventory.rightHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetName)) {
                itemIdToDrop = inventory.rightHand;
                fromHand = 'right';
            }
        }

        // If not in hands, check backpack
        let fromContainer: Entity | null = null;
        if (!itemIdToDrop) {
            const backpackId = inventory.equipment.get('back');
            if (backpackId) {
                const backpack = this.getEntityById(entities, backpackId);
                const container = backpack?.getComponent(Container);
                if (container) {
                    const foundId = container.items.find(id => {
                        const item = this.getEntityById(entities, id);
                        return item?.getComponent(Item)?.name.toLowerCase().includes(targetName);
                    });
                    if (foundId) {
                        itemIdToDrop = foundId;
                        fromContainer = backpack!;
                    }
                }
            }
        }

        if (itemIdToDrop) {
            const itemEntity = this.getEntityById(entities, itemIdToDrop);
            const itemComp = itemEntity?.getComponent(Item);

            if (itemEntity && itemComp) {
                // Remove from source
                if (fromHand === 'left') inventory.leftHand = null;
                else if (fromHand === 'right') inventory.rightHand = null;
                else if (fromContainer) {
                    const container = fromContainer.getComponent(Container);
                    if (container) {
                        container.items = container.items.filter(id => id !== itemIdToDrop);
                        container.currentWeight -= itemComp.weight;
                    }
                }

                // Add position component to drop it on the ground
                itemEntity.addComponent(new Position(position.x, position.y));

                this.io.to(entityId).emit('message', `You dropped the ${itemComp.name}.`);
                this.sendInventoryUpdate(entityId, entities);
            }
        } else {
            this.io.to(entityId).emit('message', `You don't have a ${itemName} to drop.`);
        }
    }

    handleInventory(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getItemName = (id: string | null) => {
            if (!id) return "Empty";
            const item = this.getEntityById(entities, id);
            return item?.getComponent(Item)?.name || "Unknown";
        };

        // Get backpack contents
        const backpackContents = this.getBackpackContents(inventory, entities);

        // Send structured data to client for React component
        this.io.to(entityId).emit('inventory-data', {
            leftHand: getItemName(inventory.leftHand),
            rightHand: getItemName(inventory.rightHand),
            backpack: getItemName(inventory.equipment.get('back') || null),
            torso: getItemName(inventory.equipment.get('torso') || null),
            legs: getItemName(inventory.equipment.get('legs') || null),
            waist: getItemName(inventory.equipment.get('waist') || null),
            backpackContents
        });

        this.sendInventoryUpdate(entityId, entities);
    }

    private getBackpackContents(inventory: Inventory, entities: Set<Entity>): string[] {
        const backpackId = inventory.equipment.get('back');
        if (!backpackId) return [];

        const backpack = this.getEntityById(entities, backpackId);
        const container = backpack?.getComponent(Container);
        if (!container) return [];

        return container.items.map(id => {
            const item = this.getEntityById(entities, id);
            const i = item?.getComponent(Item);
            if (!i) {
                // Try to find it in the full entity list if not in the passed set?
                // The passed 'entities' set should contain everything.
                // If it's returning Unknown, it means getEntityById returned undefined or Item component is missing.
                // Debug log:
                // console.log(`Item ID ${id} not found in entities list of size ${entities.size}`);
                return "Unknown";
            }
            return i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name;
        });
    }

    private sendInventoryUpdate(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getHandContent = (handId: string | null) => {
            if (!handId) return "Empty";
            const item = this.getEntityById(entities, handId);
            return item?.getComponent(Item)?.name || "Unknown";
        };

        const shortenName = (name: string): string => {
            // Shorten common item names for autocomplete
            if (name.toLowerCase().includes('pistol magazine')) return 'mag';
            return name;
        };

        // Send Autocomplete Update for Inventory
        const invItems: string[] = [];
        const containers: string[] = [];

        if (inventory.leftHand) {
            const name = shortenName(getHandContent(inventory.leftHand));
            invItems.push(name.toLowerCase());
        }
        if (inventory.rightHand) {
            const name = shortenName(getHandContent(inventory.rightHand));
            invItems.push(name.toLowerCase());
        }

        inventory.equipment.forEach((itemId) => {
            const item = this.getEntityById(entities, itemId);
            const itemComp = item?.getComponent(Item);
            const container = item?.getComponent(Container);

            // Add equipped containers to the containers list
            if (container && itemComp) {
                containers.push(itemComp.name.toLowerCase());
            }

            if (container) {
                container.items.forEach(cid => {
                    const cItem = this.getEntityById(entities, cid);
                    const name = cItem?.getComponent(Item)?.name;
                    if (name) {
                        const shortName = shortenName(name);
                        invItems.push(shortName.toLowerCase());
                    }
                });
            }
        });

        this.io.to(entityId).emit('autocomplete-update', {
            type: 'inventory',
            items: invItems.filter(n => n !== 'empty' && n !== 'unknown'),
            containers: containers
        });
    }

    handleGlance(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        const getHandContent = (handId: string | null) => {
            if (!handId) return "nothing";
            const item = this.getEntityById(entities, handId);
            return item?.getComponent(Item)?.name || "something unknown";
        };

        const leftHand = getHandContent(inventory.leftHand);
        const rightHand = getHandContent(inventory.rightHand);

        let message = "";
        if (leftHand === "nothing" && rightHand === "nothing") {
            message = "You glance down at your empty hands.";
        } else {
            message = `You glance down and see you are holding ${leftHand === "nothing" ? "nothing" : `a ${leftHand}`} in your left hand and ${rightHand === "nothing" ? "nothing" : `a ${rightHand}`} in your right hand.`;
        }

        this.io.to(entityId).emit('message', message);
    }

    handleStow(entityId: string, itemName: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const inventory = player.getComponent(Inventory);
        if (!inventory) return;

        // Parse "put X in Y" syntax
        let targetItemName = itemName.toLowerCase();
        let targetContainerName = 'backpack'; // default

        const inMatch = targetItemName.match(/^(.+?)\s+in\s+(.+)$/);
        if (inMatch) {
            targetItemName = inMatch[1].trim();
            targetContainerName = inMatch[2].trim();
        }

        if (targetItemName === 'can') targetItemName = 'beer can';

        // Find item in hands with fuzzy match
        let itemIdToStow: string | null = null;
        let fromHand: 'left' | 'right' | null = null;

        if (inventory.leftHand) {
            const item = this.getEntityById(entities, inventory.leftHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetItemName)) {
                itemIdToStow = inventory.leftHand;
                fromHand = 'left';
            }
        }

        if (!itemIdToStow && inventory.rightHand) {
            const item = this.getEntityById(entities, inventory.rightHand);
            if (item && item.getComponent(Item)?.name.toLowerCase().includes(targetItemName)) {
                itemIdToStow = inventory.rightHand;
                fromHand = 'right';
            }
        }

        if (!itemIdToStow) {
            this.io.to(entityId).emit('message', `You aren't holding a ${targetItemName}.`);
            return;
        }

        // Find the target container
        let targetContainer: Entity | undefined = undefined;
        let containerName = '';

        for (const equipId of inventory.equipment.values()) {
            const equip = this.getEntityById(entities, equipId);
            const equipItem = equip?.getComponent(Item);
            const equipContainer = equip?.getComponent(Container);

            if (equipContainer && equipItem) {
                if (equipItem.name.toLowerCase().includes(targetContainerName)) {
                    targetContainer = equip;
                    containerName = equipItem.name;
                    break;
                }
            }
        }

        if (!targetContainer) {
            this.io.to(entityId).emit('message', `You don't have a ${targetContainerName}.`);
            return;
        }

        const container = targetContainer.getComponent(Container);
        const itemToStow = this.getEntityById(entities, itemIdToStow);
        const itemComp = itemToStow?.getComponent(Item);

        if (container && itemComp) {
            if (container.currentWeight + itemComp.weight <= container.maxWeight) {
                // Success
                container.items.push(itemIdToStow);
                container.currentWeight += itemComp.weight;

                if (fromHand === 'left') inventory.leftHand = null;
                if (fromHand === 'right') inventory.rightHand = null;

                this.io.to(entityId).emit('message', `You put the ${itemComp.name} in your ${containerName}.`);
                this.sendInventoryUpdate(entityId, entities);
            } else {
                this.io.to(entityId).emit('message', `Your ${containerName} is too heavy! (${container.currentWeight.toFixed(1)}/${container.maxWeight} lbs)`);
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
        const combatStats = player.getComponent(CombatStats);
        if (!stats || !combatStats) {
            this.io.to(entityId).emit('message', "You don't have a character sheet.");
            return;
        }

        const attributes = [];
        for (const [key, attr] of stats.attributes) {
            let fullName = attr.name;
            if (attr.name === 'STR') fullName = 'Strength';
            if (attr.name === 'CON') fullName = 'Constitution';
            if (attr.name === 'AGI') fullName = 'Agility';
            if (attr.name === 'CHA') fullName = 'Charisma';
            attributes.push({ name: fullName, value: attr.value });
        }

        const sheetData = {
            attributes: attributes,
            combat: {
                hp: combatStats.hp,
                maxHp: combatStats.maxHp,
                defense: combatStats.defense,
                damage: combatStats.attack
            }
        };

        this.io.to(entityId).emit('sheet-data', sheetData);
    }

    handleScore(entityId: string, entities: Set<Entity>) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const stats = player.getComponent(Stats);
        if (!stats) {
            this.io.to(entityId).emit('message', "You don't have a character sheet.");
            return;
        }

        const skills = [];
        for (const [key, skill] of stats.skills) {
            const percent = Math.floor((skill.uses / skill.maxUses) * 100);
            skills.push({
                name: skill.name,
                level: skill.level,
                progress: percent
            });
        }

        this.io.to(entityId).emit('score-data', { skills });
    }



    handleRead(entityId: string, entities: Set<Entity>, targetName: string) {
        if (targetName.toLowerCase() === 'guide') {
            try {
                const guidePath = path.join(process.cwd(), '../docs/USERS_GUIDE.md');
                const guideContent = fs.readFileSync(guidePath, 'utf-8');
                this.io.to(entityId).emit('open-guide', { content: guideContent });
                this.io.to(entityId).emit('message', "<system>Opening User's Guide...</system>");
            } catch (err) {
                console.error("Error reading guide:", err);
                this.io.to(entityId).emit('message', "<error>Failed to load User's Guide.</error>");
            }
            return;
        }

        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // Find items/objects at player position
        // Let's iterate manually for now to find the terminal
        let targetEntity: Entity | undefined;
        for (const entity of entities) {
            const pos = entity.getComponent(Position);
            const desc = entity.getComponent(Description);
            if (pos && desc && pos.x === playerPos.x && pos.y === playerPos.y) {
                if (desc.title.toLowerCase().includes(targetName.toLowerCase())) {
                    targetEntity = entity;
                    break;
                }
            }
        }

        if (!targetEntity) {
            this.io.to(entityId).emit('message', `You don't see '${targetName}' here.`);
            return;
        }

        const terminal = targetEntity.getComponent(Terminal);
        if (terminal) {
            // It's a terminal!
            const itemNames = terminal.data.items as string[];
            const itemsData = itemNames.map(name => {
                const tempEntity = PrefabFactory.createItem(name);
                if (tempEntity) {
                    const item = tempEntity.getComponent(Item);
                    if (item) {
                        return {
                            name: item.name,
                            weight: item.weight,
                            size: item.size,
                            legality: item.legality,
                            attributes: item.attributes,
                            description: item.description
                        };
                    }
                }
                return null;
            }).filter(i => i !== null);

            this.io.to(entityId).emit('terminal-data', {
                title: "CYBERNETICS CATALOG",
                items: itemsData
            });
            this.io.to(entityId).emit('message', "<system>You access the terminal...</system>");
        } else {
            // If it's not a terminal, just show the description (e.g. for the table)
            const desc = targetEntity.getComponent(Description);
            if (desc) {
                this.io.to(entityId).emit('message', desc.description);
            } else {
                this.io.to(entityId).emit('message', "There's nothing to read on that.");
            }
        }
    }

    handleTerminalBuy(entityId: string, entities: Set<Entity>, itemName: string, cost: number) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        // Check if player has enough credits (assuming credits are stored in Stats or Inventory)
        // For now, let's assume infinite credits or just check if they can carry it
        // TODO: Implement Credits system properly.

        // Create the item
        const itemEntity = PrefabFactory.createItem(itemName);
        if (!itemEntity) {
            this.io.to(entityId).emit('message', "<system>Error: Item out of stock.</system>");
            return;
        }

        const itemComp = itemEntity.getComponent(Item);
        const inventory = player.getComponent(Inventory);

        if (inventory && itemComp) {
            // Check weight/capacity?
            // For now, just add to backpack if possible, or drop on ground

            // Try to add to backpack
            const backpackId = inventory.equipment.get('back');
            let added = false;

            if (backpackId) {
                const backpack = this.getEntityById(entities, backpackId);
                const container = backpack?.getComponent(Container);
                if (container) {
                    if (container.currentWeight + itemComp.weight <= container.maxWeight) {
                        container.items.push(itemEntity.id);
                        container.currentWeight += itemComp.weight;
                        this.io.to(entityId).emit('message', `<system>Purchased ${itemComp.name} for ${cost} credits. Added to backpack.</system>`);
                        added = true;
                        // Add entity to engine? It's already created but needs to be in the entities set?
                        // PrefabFactory creates it but doesn't add to engine.
                        // We need to add it to the engine.
                        // Wait, InteractionSystem doesn't have access to engine directly to add entities?
                        // It receives `entities` set but that's a reference. 
                        // The `entities` set in `update` is from the engine.
                        // But we need to add it to the engine's main list so it persists and updates.
                        // The `entities` passed here is a Set<Entity>. Adding to it might work if it's the live set.
                        entities.add(itemEntity);
                    }
                }
            }

            if (!added) {
                // Drop on ground
                const pos = player.getComponent(Position);
                if (pos) {
                    itemEntity.addComponent(new Position(pos.x, pos.y));
                    this.io.to(entityId).emit('message', `<system>Purchased ${itemComp.name}. Inventory full, dropped on ground.</system>`);
                }
            }

            return itemEntity;
        }
        return null;
    }

    handleTurn(entityId: string, entities: Set<Entity>, targetName: string, direction: string, engine: Engine) {
        const player = this.getEntityById(entities, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // Find the target object in the room
        const targetEntity = Array.from(entities).find(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y &&
                desc.title.toLowerCase().includes(targetName.toLowerCase());
        });

        if (!targetEntity) {
            this.io.to(entityId).emit('message', `You don't see ${targetName} here.`);
            return;
        }

        const puzzleObj = targetEntity.getComponent(PuzzleObject);
        if (!puzzleObj) {
            this.io.to(entityId).emit('message', `You can't turn that.`);
            return;
        }

        // Normalize direction
        const validDirs = ['north', 'south', 'east', 'west'];
        const dir = direction.toLowerCase();
        if (!validDirs.includes(dir)) {
            this.io.to(entityId).emit('message', `Invalid direction. Try north, south, east, or west.`);
            return;
        }

        // Update Direction
        puzzleObj.currentDirection = dir;

        // Update Description
        const desc = targetEntity.getComponent(Description);
        if (desc) {
            // Remove old direction text if present (assuming it ends with "It is currently facing...")
            const baseDesc = desc.description.split(" It is currently facing")[0];
            desc.description = `${baseDesc} It is currently facing ${dir.charAt(0).toUpperCase() + dir.slice(1)}.`;
        }

        this.io.to(entityId).emit('message', `<action>You turn the ${targetName} to face ${dir}.</action>`);

        // Check Puzzle Completion
        this.checkPuzzleCompletion(puzzleObj.puzzleId, entities, playerPos, engine, entityId);
    }

    private checkPuzzleCompletion(puzzleId: string, entities: Set<Entity>, pos: Position, engine: Engine, playerId: string) {
        // Find all objects with this puzzleId
        const puzzleObjects = Array.from(entities).filter(e => {
            const p = e.getComponent(PuzzleObject);
            return p && p.puzzleId === puzzleId;
        });

        // Check if all are correct
        let allCorrect = true;
        for (const obj of puzzleObjects) {
            const p = obj.getComponent(PuzzleObject);
            if (p && p.targetDirection && p.currentDirection !== p.targetDirection) {
                allCorrect = false;
                break;
            }
        }

        if (allCorrect) {
            // Check if already solved (to prevent infinite rewards)
            const rewardInRoom = Array.from(entities).some(e => {
                const item = e.getComponent(Item);
                const p = e.getComponent(Position);
                return item && item.name === "Platinum Hard Disk" && p && p.x === pos.x && p.y === pos.y;
            });

            // Check if player has the reward
            const player = this.getEntityById(entities, playerId);
            let playerHasReward = false;
            if (player) {
                const inventory = player.getComponent(Inventory);
                if (inventory) {
                    // Check hands
                    if (inventory.leftHand) {
                        const lItem = this.getEntityById(entities, inventory.leftHand);
                        if (lItem?.getComponent(Item)?.name === "Platinum Hard Disk") playerHasReward = true;
                    }
                    if (inventory.rightHand) {
                        const rItem = this.getEntityById(entities, inventory.rightHand);
                        if (rItem?.getComponent(Item)?.name === "Platinum Hard Disk") playerHasReward = true;
                    }
                    // Check backpack/equipment
                    if (!playerHasReward) {
                        for (const [slot, itemId] of inventory.equipment) {
                            const item = this.getEntityById(entities, itemId);
                            if (item?.getComponent(Item)?.name === "Platinum Hard Disk") {
                                playerHasReward = true;
                                break;
                            }
                            // Check inside container (backpack)
                            const container = item?.getComponent(Container);
                            if (container) {
                                for (const subId of container.items) {
                                    const subItem = this.getEntityById(entities, subId);
                                    if (subItem?.getComponent(Item)?.name === "Platinum Hard Disk") {
                                        playerHasReward = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (!rewardInRoom && !playerHasReward) {
                this.io.to(playerId).emit('message', `<success>CLICK! You hear a mechanical latch unlock inside the stone table. A compartment slides open!</success>`);

                // Update Table Description
                const table = Array.from(entities).find(e => {
                    const p = e.getComponent(Position);
                    const d = e.getComponent(Description);
                    return p && d && p.x === pos.x && p.y === pos.y && d.title === "Stone Table";
                });

                if (table) {
                    const d = table.getComponent(Description);
                    if (d) {
                        d.description = "A heavy stone table with an open compartment revealing a shiny object. The inscription reads: 'The sun sets in the west, the rain falls to the mud, and the wind blows toward the dawn.'";
                    }
                }

                // Spawn Reward
                const reward = PrefabFactory.createItem("platinum_disk");
                if (reward) {
                    reward.addComponent(new Position(pos.x, pos.y));
                    engine.addEntity(reward);
                    entities.add(reward);
                } else {
                    console.error("Failed to create platinum_disk reward. Check items.csv and ItemRegistry.");
                    this.io.to(playerId).emit('message', "<system>Error: Reward item not found in database.</system>");
                }
            } else {
                this.io.to(playerId).emit('message', `<system>The mechanism clicks, but nothing happens. It seems the compartment is already open.</system>`);
            }

            // Reset Puzzle (Scramble Busts)
            puzzleObjects.forEach(obj => {
                const p = obj.getComponent(PuzzleObject);
                const d = obj.getComponent(Description);
                if (p && d) {
                    p.currentDirection = 'north'; // Reset to default
                    const baseDesc = d.description.split(" It is currently facing")[0];
                    d.description = `${baseDesc} It is currently facing North.`;
                }
            });
            this.io.to(playerId).emit('message', `<action>The busts mechanically whir and reset to their original positions.</action>`);
        }
    }
}


