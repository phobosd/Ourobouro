import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { Item } from '../components/Item';
import { NPC } from '../components/NPC';
import { CombatStats } from '../components/CombatStats';
import { Terminal } from '../components/Terminal';
import { Shop } from '../components/Shop';
import { Container } from '../components/Container';
import { Inventory } from '../components/Inventory';
import { WorldQuery } from '../utils/WorldQuery';
import { MessageFormatter } from '../utils/MessageFormatter';
import { IEngine } from '../commands/CommandRegistry';
import { Atmosphere } from '../components/Atmosphere';

export class DescriptionService {
    /**
     * Generates a full room description including title, description, exits, mini-map, items, and NPCs.
     */
    static describeRoom(playerPos: Position, engine: IEngine): string {
        const room = WorldQuery.findRoomAt(engine, playerPos.x, playerPos.y);
        if (!room) return "You are in a void.";

        const roomDesc = room.getComponent(Description);
        if (!roomDesc) return "This room has no description.";

        // Find items in the room
        const itemsInRoom = WorldQuery.findItemsAt(engine, playerPos.x, playerPos.y);
        const itemDescriptions = itemsInRoom.map(item => {
            const itemComp = item.getComponent(Item);
            return itemComp ? MessageFormatter.item(`There is a ${itemComp.name} here.`) : '';
        }).filter(s => s !== '').join('\n');

        // Find NPCs in the room
        const npcsInRoom = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
        const npcDescriptions = npcsInRoom.map(npc => {
            const npcComp = npc.getComponent(NPC);
            const combatStats = npc.getComponent(CombatStats);
            if (npcComp) {
                // Enemies (with CombatStats and isHostile) are red
                if (combatStats && combatStats.isHostile) {
                    return `<enemy>${npcComp.typeName} is standing here.</enemy>`;
                } else {
                    return MessageFormatter.npc(`${npcComp.typeName} is standing here.`);
                }
            }
            return '';
        }).filter(s => s !== '').join('\n');

        // Find Terminals in the room
        const terminalsInRoom = WorldQuery.findTerminalsAt(engine, playerPos.x, playerPos.y);
        let terminalText = "";
        if (terminalsInRoom.length > 0) {
            terminalText = "\n" + MessageFormatter.wrap('terminal', "A Shop Terminal is here.");
        }

        // Calculate Exits
        const exits = [];
        if (WorldQuery.findRoomAt(engine, playerPos.x, playerPos.y - 1)) exits.push('N');
        if (WorldQuery.findRoomAt(engine, playerPos.x, playerPos.y + 1)) exits.push('S');
        if (WorldQuery.findRoomAt(engine, playerPos.x + 1, playerPos.y)) exits.push('E');
        if (WorldQuery.findRoomAt(engine, playerPos.x - 1, playerPos.y)) exits.push('W');

        // Atmosphere
        const atmosphere = room.getComponent(Atmosphere);
        let atmosphereText = "";
        if (atmosphere) {
            atmosphereText = `<atmosphere>Sky: ${atmosphere.skyState} | Lighting: ${atmosphere.lighting} | Contrast: ${atmosphere.contrast}</atmosphere>\n`;
        }

        const miniMap = this.generateMiniMap(playerPos, engine);

        return `${MessageFormatter.title(`[${roomDesc.title}]`)}
${atmosphereText}<desc>${roomDesc.description}</desc>${terminalText}
<exits>Exits: ${exits.join(', ')}</exits>
${miniMap}
${itemDescriptions}
${npcDescriptions}`.trim();
    }

    /**
     * Generates a 5x5 mini-map centered on the player.
     */
    static generateMiniMap(playerPos: Position, engine: IEngine): string {
        let miniMap = "";
        const range = 2; // +/- 2 tiles
        for (let y = playerPos.y - range; y <= playerPos.y + range; y++) {
            let row = "";
            for (let x = playerPos.x - range; x <= playerPos.x + range; x++) {
                if (x === playerPos.x && y === playerPos.y) {
                    row += MessageFormatter.mapPlayer("@");
                } else {
                    const r = WorldQuery.findRoomAt(engine, x, y);
                    if (r) {
                        const shop = r.getComponent(Shop);
                        const desc = r.getComponent(Description);

                        if (shop) {
                            if (shop.name.includes("Clinic")) {
                                row += "<map-clinic>+</map-clinic>";
                            } else {
                                row += MessageFormatter.mapShop("$");
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
                            row += MessageFormatter.mapRoom("#");
                        }
                    } else {
                        row += " "; // Empty space
                    }
                }
                row += " "; // Spacing
            }
            miniMap += row + "\n";
        }
        return miniMap;
    }

    /**
     * Generates structured map data for React rendering.
     */
    static generateMapData(playerPos: Position, engine: IEngine) {
        const width = 20;
        const height = 20;
        const grid: any[][] = [];

        for (let y = 0; y < height; y++) {
            const row: any[] = [];
            for (let x = 0; x < width; x++) {
                const room = WorldQuery.findRoomAt(engine, x, y);
                if (room) {
                    const shop = room.getComponent(Shop);
                    const desc = room.getComponent(Description);
                    const isPlayer = x === playerPos.x && y === playerPos.y;

                    let type = 'street';
                    if (desc?.title.includes("Clinic")) type = 'clinic';
                    else if (shop) type = 'shop';
                    else if (desc?.title.includes("Club")) type = 'club';
                    else if (desc?.title.includes("Park")) type = 'park';
                    else if (desc?.title.includes("Plaza")) type = 'plaza';

                    row.push({
                        x, y,
                        type,
                        title: desc?.title || "Unknown",
                        isPlayer
                    });
                } else {
                    row.push(null);
                }
            }
            grid.push(row);
        }

        return {
            grid,
            playerPos: { x: playerPos.x, y: playerPos.y }
        };
    }

    /**
     * Generates a full 20x20 city map.
     */
    static generateFullMap(playerPos: Position, engine: IEngine): string {
        let mapOutput = MessageFormatter.title('[Ouroboro City Map]') + '\n';

        const width = 20;
        const height = 20;

        for (let y = 0; y < height; y++) {
            let row = "";
            for (let x = 0; x < width; x++) {
                if (x === playerPos.x && y === playerPos.y) {
                    row += MessageFormatter.mapPlayer("@");
                } else {
                    const room = WorldQuery.findRoomAt(engine, x, y);
                    if (room) {
                        const shop = room.getComponent(Shop);
                        const desc = room.getComponent(Description);

                        if (shop) {
                            if (shop.name.includes("Clinic")) {
                                row += "<map-clinic>+</map-clinic>";
                            } else {
                                row += MessageFormatter.mapShop("$");
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
                            row += MessageFormatter.mapRoom("#");
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
        mapOutput += MessageFormatter.mapPlayer("@") + ' <legend>You</legend>  ';
        mapOutput += MessageFormatter.mapShop("$") + ' <legend>Shop</legend>  ';
        mapOutput += '<map-clinic>+</map-clinic> <legend>Clinic</legend>  ';
        mapOutput += '<map-club>♫</map-club> <legend>Club</legend>  ';
        mapOutput += '<map-grass>T</map-grass> <legend>Park</legend>  ';
        mapOutput += '<map-street>.</map-street> <legend>Street</legend>';

        return mapOutput;
    }

    /**
     * Generates a description for an NPC.
     */
    static describeNPC(npc: Entity): string {
        const npcComp = npc.getComponent(NPC);
        if (!npcComp) return "You see nothing special.";

        return `
${MessageFormatter.title(`[${npcComp.typeName}]`)}
<desc>${npcComp.description}</desc>
        `.trim();
    }

    /**
     * Generates a description for an item.
     */
    static describeItem(item: Entity): string {
        const itemComp = item.getComponent(Item);
        if (!itemComp) return "You see nothing special.";

        return `
${MessageFormatter.title(`[${itemComp.name}]`)}
<desc>${itemComp.description}</desc>
<item-stats>Weight: ${itemComp.weight}kg | Size: ${itemComp.size}</item-stats>
        `.trim();
    }

    /**
     * Gets the names of items in the backpack for the inventory UI.
     */
    static getBackpackContents(inventory: Inventory, engine: IEngine): string[] {
        const backpackId = inventory.equipment.get('back');
        if (!backpackId) return [];

        const backpack = WorldQuery.getEntityById(engine, backpackId);
        const container = backpack?.getComponent(Container);
        if (!container) return [];

        return container.items.map(id => {
            const item = WorldQuery.getEntityById(engine, id);
            const i = item?.getComponent(Item);
            if (!i) return "Unknown";
            return i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name;
        });
    }

    /**
     * Generates a description for a container's contents.
     */
    static describeContainer(containerName: string, container: Container, engine: IEngine): string {
        if (container.items.length === 0) {
            return `The ${containerName} is empty.`;
        }

        let output = `\n${MessageFormatter.title(`Contents of ${containerName}:`)}\n`;
        container.items.forEach(id => {
            const item = WorldQuery.getEntityById(engine, id);
            const i = item?.getComponent(Item);
            if (i) {
                const displayName = i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name;
                output += MessageFormatter.item(`  - ${displayName}`) + '\n';
            }
        });

        return output;
    }

    /**
     * Generates a description for a specific target at a location.
     */
    static describeTargetAt(player: Entity, engine: IEngine, playerPos: Position, targetName: string): string | null {
        const name = targetName.toLowerCase();

        // 1. Check for "pedestals" or "pedestal" (special case for Alchemist's Study)
        if (name === 'pedestal' || name === 'pedestals') {
            const pedestals = engine.getEntitiesWithComponent(Description).filter(e => {
                const pos = e.getComponent(Position);
                const desc = e.getComponent(Description);
                return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y && desc.title.toLowerCase().includes('bust');
            });

            if (pedestals.length > 0) {
                let message = MessageFormatter.title('[Pedestals]') + '\nThere are four pedestals here, each holding a bust:\n';
                pedestals.forEach(p => {
                    const desc = p.getComponent(Description);
                    if (desc) {
                        message += MessageFormatter.item(`- ${desc.title}`) + '\n';
                    }
                });
                return message;
            }
        }

        // 2. Check for NPCs
        const npcsInRoom = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
        const targetNPC = npcsInRoom.find(npc => {
            const npcComp = npc.getComponent(NPC);
            return npcComp && npcComp.typeName.toLowerCase().includes(name);
        });

        if (targetNPC) {
            return this.describeNPC(targetNPC);
        }

        // 3. Check for other entities (Terminals, Objects, PuzzleObjects)
        const targetEntity = engine.getEntitiesWithComponent(Description).find(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y && (
                desc.title.toLowerCase().includes(name) ||
                (name === 'bust' && desc.title.toLowerCase().includes('bust')) ||
                (name === 'table' && desc.title.toLowerCase().includes('table'))
            );
        });

        if (targetEntity) {
            const desc = targetEntity.getComponent(Description);
            return desc ? desc.description : null;
        }

        // 4. Check inventory
        const inventory = player.getComponent(Inventory);
        if (inventory) {
            const findInInventory = (itemId: string): string | null => {
                const itemEntity = WorldQuery.getEntityById(engine, itemId);
                if (!itemEntity) return null;
                const item = itemEntity.getComponent(Item);
                if (item && item.name.toLowerCase().includes(name)) {
                    return this.describeItem(itemEntity);
                }

                // Check inside container
                const container = itemEntity.getComponent(Container);
                if (container) {
                    for (const subItemId of container.items) {
                        const desc = findInInventory(subItemId);
                        if (desc) return desc;
                    }
                }
                return null;
            };

            if (inventory.leftHand) {
                const desc = findInInventory(inventory.leftHand);
                if (desc) return desc;
            }
            if (inventory.rightHand) {
                const desc = findInInventory(inventory.rightHand);
                if (desc) return desc;
            }

            for (const itemId of inventory.equipment.values()) {
                const desc = findInInventory(itemId);
                if (desc) return desc;
            }
        }

        return null;
    }
}
