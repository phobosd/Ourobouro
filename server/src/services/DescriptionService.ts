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
import { Stats } from '../components/Stats';
import { WorldQuery } from '../utils/WorldQuery';
import { MessageFormatter } from '../utils/MessageFormatter';
import { IEngine } from '../ecs/IEngine';
import { Atmosphere } from '../components/Atmosphere';
import { Portal } from '../components/Portal';
import { DungeonService } from '../services/DungeonService';
import { Visuals } from '../components/Visuals';
import { ParserUtils } from '../utils/ParserUtils';

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
            return itemComp ? `There is a ${MessageFormatter.item(itemComp.name, item.id)} here.` : '';
        }).filter(s => s !== '').join('\n');

        // Find NPCs in the room
        const npcsInRoom = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
        const npcDescriptions = npcsInRoom.map(npc => {
            const npcComp = npc.getComponent(NPC);
            const combatStats = npc.getComponent(CombatStats);
            if (npcComp) {
                // Enemies (with CombatStats and isHostile) are red
                if (combatStats && combatStats.isHostile) {
                    return `<enemy id="${npc.id}">${npcComp.typeName} is standing here.</enemy>`;
                } else {
                    return MessageFormatter.npc(`${npcComp.typeName} is standing here.`, npc.id);
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

        // Find Portals
        const portalsInRoom = engine.getEntitiesWithComponent(Portal).filter(e => {
            const pos = e.getComponent(Position);
            return pos && pos.x === playerPos.x && pos.y === playerPos.y;
        });
        const portalText = portalsInRoom.map(p => {
            const desc = p.getComponent(Description);
            return desc ? `\n${desc.description}` : '';
        }).join('');

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
${atmosphereText}<desc>${roomDesc.description}</desc>${terminalText}${portalText}
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

        // Get player ID for visited check
        const playerEntity = engine.getEntitiesWithComponent(Position).find(e => {
            const p = e.getComponent(Position);
            return p && p.x === playerPos.x && p.y === playerPos.y && e.hasComponent(Stats) && !e.hasComponent(NPC);
        });
        const playerId = playerEntity?.id || "";

        for (let y = playerPos.y - range; y <= playerPos.y + range; y++) {
            let row = "";
            for (let x = playerPos.x - range; x <= playerPos.x + range; x++) {
                // Fog of War check
                if (x >= 2000 && x < 10000 && !DungeonService.getInstance()?.isVisited(playerId, x, y)) {
                    row += "  "; // Two spaces to match char + space width
                    continue;
                }

                if (x === playerPos.x && y === playerPos.y) {
                    row += MessageFormatter.mapPlayer("@");
                } else {
                    // Check for NPCs with Visuals first
                    const npcs = WorldQuery.findNPCsAt(engine, x, y);
                    const visualNPC = npcs.find(n => n.hasComponent(Visuals));

                    if (visualNPC) {
                        const visuals = visualNPC.getComponent(Visuals);
                        row += `<enemy>${visuals?.char || 'E'}</enemy>`;
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
        let startX = 0;
        let startY = 0;
        let width = 20;
        let height = 20;

        const isMatrix = playerPos.x >= 10000;
        const isDungeon = playerPos.x >= 2000 && playerPos.x < 10000;

        if (isMatrix) {
            startX = 10000;
            startY = 0;
            width = 20;
            height = 20;
        } else if (isDungeon) {
            const viewRadius = 10;
            startX = playerPos.x - viewRadius;
            startY = playerPos.y - viewRadius;
            width = viewRadius * 2;
            height = viewRadius * 2;
        }

        const grid: any[][] = [];
        const playerEntity = engine.getEntitiesWithComponent(Position).find(e => {
            const p = e.getComponent(Position);
            return p && p.x === playerPos.x && p.y === playerPos.y && e.hasComponent(Stats) && !e.hasComponent(NPC);
        });

        const playerId = playerEntity?.id || "";

        for (let y = startY; y < startY + height; y++) {
            const row: any[] = [];
            for (let x = startX; x < startX + width; x++) {
                if (isDungeon && !DungeonService.getInstance()?.isVisited(playerId, x, y)) {
                    row.push(null);
                    continue;
                }

                const room = WorldQuery.findRoomAt(engine, x, y);
                if (room) {
                    const shop = room.getComponent(Shop);
                    const desc = room.getComponent(Description);
                    const isPlayer = x === playerPos.x && y === playerPos.y;

                    let type = 'street';
                    if (isDungeon) type = 'dungeon';
                    else if (desc?.title.includes("Clinic") || desc?.title.includes("Bio-Data")) type = 'clinic';
                    else if (shop || desc?.title.includes("Encrypted Sub-Node")) type = 'shop';
                    else if (desc?.title.includes("Club") || desc?.title.includes("Social Frequency")) type = 'club';
                    else if (desc?.title.includes("Park") || desc?.title.includes("Recursive Logic")) type = 'park';
                    else if (desc?.title.includes("Plaza") || desc?.title.includes("Central Processing")) type = 'plaza';
                    else if (desc?.title.includes("Archive")) type = 'dungeon';

                    row.push({
                        x: x - startX,
                        y: y - startY,
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
            playerPos: { x: playerPos.x - startX, y: playerPos.y - startY },
            worldPos: { x: playerPos.x, y: playerPos.y }
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
                        row += " ";
                    }
                }
                row += " ";
            }
            mapOutput += row + "\n";
        }

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
    static describeNPC(npc: Entity, engine: IEngine): string {
        const npcComp = npc.getComponent(NPC);
        if (!npcComp) return "You see nothing special.";

        let desc = `
${MessageFormatter.title(`[${npcComp.typeName}]`)}
<desc>${npcComp.description}</desc>
`.trim();

        const inventory = npc.getComponent(Inventory);
        if (inventory) {
            const equipmentList: string[] = [];
            const getItemName = (id: string | null) => {
                if (!id) return null;
                const item = WorldQuery.getEntityById(engine, id);
                return item?.getComponent(Item)?.name;
            };

            const rightHand = getItemName(inventory.rightHand);
            if (rightHand) equipmentList.push(`<cyan>Right Hand:</cyan> <item>${rightHand}</item>`);

            const leftHand = getItemName(inventory.leftHand);
            if (leftHand) equipmentList.push(`<cyan>Left Hand:</cyan> <item>${leftHand}</item>`);

            inventory.equipment.forEach((itemId, slot) => {
                const name = getItemName(itemId);
                if (name) {
                    let slotName = slot;
                    if (slot.startsWith('pocket')) slotName = 'Pocket';
                    else slotName = slot.charAt(0).toUpperCase() + slot.slice(1);
                    equipmentList.push(`<cyan>${slotName}:</cyan> <item>${name}</item>`);
                }
            });

            if (equipmentList.length > 0) {
                desc += `\n\n<title>Equipment:</title>\n${equipmentList.map(e => `- ${e}`).join('\n')}`;
            }
        }
        return desc;
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
            const displayName = i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name;
            return MessageFormatter.item(displayName, id);
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
                output += `  - ${MessageFormatter.item(displayName, id)}\n`;
            }
        });

        return output;
    }

    /**
     * Generates a description for a specific target at a location.
     */
    static describeTargetAt(player: Entity, engine: IEngine, playerPos: Position, targetName: string): string | null {
        const { index, name: targetNameLower } = ParserUtils.parseOrdinal(targetName.toLowerCase());

        // 1. Check for "pedestals" or "pedestal" (special case for Alchemist's Study)
        if (targetNameLower === 'pedestal' || targetNameLower === 'pedestals') {
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
                        message += `- ${MessageFormatter.item(desc.title, p.id)}\n`;
                    }
                });
                return message;
            }
        }

        const matches: { type: 'npc' | 'object' | 'item', entity: Entity }[] = [];

        // 2. Check for NPCs
        const npcsInRoom = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
        npcsInRoom.forEach(npc => {
            const npcComp = npc.getComponent(NPC);
            if (npcComp && npcComp.typeName.toLowerCase().includes(targetNameLower)) {
                matches.push({ type: 'npc', entity: npc });
            }
        });

        // 3. Check for other entities (Terminals, Objects, PuzzleObjects)
        const roomEntities = engine.getEntitiesWithComponent(Description).filter(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            return pos && desc && pos.x === playerPos.x && pos.y === playerPos.y && (
                desc.title.toLowerCase().includes(targetNameLower) ||
                (targetNameLower === 'bust' && desc.title.toLowerCase().includes('bust')) ||
                (targetNameLower === 'table' && desc.title.toLowerCase().includes('table'))
            );
        });
        roomEntities.forEach(e => matches.push({ type: 'object', entity: e }));

        // 4. Check inventory
        const inventory = player.getComponent(Inventory);
        if (inventory) {
            const collectFromInventory = (itemId: string) => {
                const itemEntity = WorldQuery.getEntityById(engine, itemId);
                if (!itemEntity) return;
                const item = itemEntity.getComponent(Item);
                if (item && item.name.toLowerCase().includes(targetNameLower)) {
                    matches.push({ type: 'item', entity: itemEntity });
                }

                const container = itemEntity.getComponent(Container);
                if (container) {
                    for (const subItemId of container.items) {
                        collectFromInventory(subItemId);
                    }
                }
            };

            if (inventory.leftHand) collectFromInventory(inventory.leftHand);
            if (inventory.rightHand) collectFromInventory(inventory.rightHand);
            for (const itemId of inventory.equipment.values()) {
                collectFromInventory(itemId);
            }
        }

        const target = matches[index];
        if (target) {
            if (target.type === 'npc') return this.describeNPC(target.entity, engine);
            if (target.type === 'item') return this.describeItem(target.entity);
            const desc = target.entity.getComponent(Description);
            return desc ? desc.description : null;
        }

        return null;
    }
}
