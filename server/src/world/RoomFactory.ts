import { Engine } from '../ecs/Engine';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Shop } from '../components/Shop';
import { Atmosphere } from '../components/Atmosphere';
import { Portal } from '../components/Portal';
import { Terminal } from '../components/Terminal';
import { PuzzleObject } from '../components/PuzzleObject';
import { NPC } from '../components/NPC';
import { PrefabFactory } from '../factories/PrefabFactory';
import { WorldQuery } from '../utils/WorldQuery';

export interface RoomFlavor {
    title: string;
    desc: string;
    shopData?: { name: string; desc: string };
}

export class RoomFactory {
    private engine: Engine;
    private vendorCount = 0;
    private readonly MAX_VENDORS = 7;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public createRoom(x: number, y: number, type: number) {
        const room = new Entity();
        room.addComponent(new IsRoom());
        room.addComponent(new Position(x, y));

        const flavor = this.getRoomFlavor(type, x, y);
        room.addComponent(new Description(flavor.title, flavor.desc));
        room.addComponent(new Atmosphere());

        if (flavor.shopData) {
            room.addComponent(new Shop(flavor.shopData.name, flavor.shopData.desc));

            if (flavor.shopData.name === "Chrome & Steel") {
                const fixer = PrefabFactory.createNPC('fixer', 'npc_the_fixer');
                if (fixer) {
                    fixer.addComponent(new Position(x, y));
                    this.engine.addEntity(fixer);
                }
            }

            // Spawn Terminal in all shops
            const terminal = new Entity();
            terminal.addComponent(new Position(x, y));
            terminal.addComponent(new Description("Shop Terminal", "A sleek terminal displaying a catalog of goods. Type 'read terminal' to view."));

            let items: string[] = [];
            if (flavor.shopData.name === "Chrome & Steel") {
                items = [
                    'neural_deck',
                    'data_chip',
                    'optical_hud',
                    'signal_jammer',
                    'ext_drive',
                    'exoskeleton_frame',
                    'ono_sendai_cyberspace7',
                    'microsoft_hacking',
                    'reflex_boost'
                ];
            } else if (flavor.shopData.name === "The Armory") {
                items = [
                    'pistol_9mm',
                    'mag_pistol_9mm',
                    'ammo_9mm_loose',
                    'assault_rifle',
                    'shotgun',
                    'katana',
                    'combat_knife',
                    'ammo_rifle',
                    'ammo_shotgun',
                    'tactical_shirt',
                    'heavy_jacket',
                    'cargo_pants',
                    'armored_slacks',
                    'combat_boots',
                    'kinetic_dampeners',
                    'street_cap',
                    'ballistic_helmet',
                    'stealth_belt',
                    'frag_grenade',
                    'flashbang'
                ];
            } else if (flavor.shopData.name === "Bits & Bytes") {
                items = [
                    'messenger_bag',
                    'tactical_backpack',
                    'utility_belt',
                    'flashlight',
                    'rope',
                    'grappling_hook',
                    'stimpack',
                    'medkit',
                    'energy_drink',
                    'nutrient_paste',
                    'syntho_caf'
                ];
            } else if (flavor.shopData.name === "Street Doc's Clinic") {
                items = [
                    'medkit',
                    'stimpack',
                    'bandage',
                    'painkillers',
                    'water_bottle'
                ];
            }

            terminal.addComponent(new Terminal(flavor.shopData.name, {
                title: `${flavor.shopData.name} - Catalog`,
                items: items
            }));

            this.engine.addEntity(terminal);
        }

        // Special handling for Alchemist's Study (Type 7) - Puzzle Room
        if (type === 7) {
            // Check if table already exists here
            const existingTable = this.engine.getEntitiesAt(x, y).find(e => e.getComponent(Description)?.title === "Stone Table");
            if (existingTable) return;

            // Create Stone Table with Inscription
            const table = new Entity();
            table.addComponent(new Position(x, y));
            table.addComponent(new Description(
                "Stone Table",
                "A heavy stone table with an inscription carved into its surface. It reads: 'The sun sets in the west, the rain falls to the mud, and the wind blows toward the dawn.'"
            ));
            this.engine.addEntity(table);

            // Create Four Elemental Busts on Pedestals
            // Solution: Ignis=West, Aqua=South, Ventus=East, Terra=North (fixed)

            // Ignis Bust (Fire) - Should face West
            const ignis = new Entity();
            ignis.addComponent(new Position(x, y));
            ignis.addComponent(new Description(
                "Ignis Bust",
                "A bronze bust with ruby eyes, representing the element of fire. It is currently facing North."
            ));
            ignis.addComponent(new PuzzleObject("alchemist_puzzle", "north", "west"));
            this.engine.addEntity(ignis);

            // Aqua Bust (Water) - Should face South
            const aqua = new Entity();
            aqua.addComponent(new Position(x, y));
            aqua.addComponent(new Description(
                "Aqua Bust",
                "A silver bust with sapphire eyes, representing the element of water. It is currently facing North."
            ));
            aqua.addComponent(new PuzzleObject("alchemist_puzzle", "north", "south"));
            this.engine.addEntity(aqua);

            // Ventus Bust (Air) - Should face East
            const ventus = new Entity();
            ventus.addComponent(new Position(x, y));
            ventus.addComponent(new Description(
                "Ventus Bust",
                "A white marble bust with diamond eyes, representing the element of air. It is currently facing North."
            ));
            ventus.addComponent(new PuzzleObject("alchemist_puzzle", "north", "east"));
            this.engine.addEntity(ventus);

            // Terra Bust (Earth) - Fixed, cannot be turned, already facing North
            const terra = new Entity();
            terra.addComponent(new Position(x, y));
            terra.addComponent(new Description(
                "Terra Bust",
                "A granite bust with emerald eyes, representing the element of earth. It is fused to its base and faces North."
            ));
            terra.addComponent(new PuzzleObject("alchemist_puzzle", "north", "north"));
            this.engine.addEntity(terra);
        }

        // Special handling for Portal Room (Type 8) - Add Glitch Door
        if (type === 8) {
            // Check if portal already exists here
            const existingPortals = this.engine.getEntitiesAt(x, y).filter(e => e.hasComponent(Portal));
            if (existingPortals.length === 0) {
                const portal = new Entity();
                portal.addComponent(new Position(x, y));
                portal.addComponent(new Description("Glitch Door", "A door made of shifting, translucent code. It seems to lead somewhere... unstable."));
                portal.addComponent(new Portal('dungeon', 'glitch_zone'));
                this.engine.addEntity(portal);
            }
        }

        // Special handling for Bar (Type 9) - Spawn Roxy
        if (type === 9) {
            const roxy = PrefabFactory.createNPC('roxana_sinclair', 'npc_roxy');
            if (roxy) {
                roxy.addComponent(new Position(x, y));
                roxy.addComponent(new Shop("The Rusty Cog", "A dive bar with cold synth-ale and warm memories."));
                PrefabFactory.stockVendor(roxy, this.engine, ['synth_ale', 'synth_ale', 'synth_ale', 'rusty_cog_special']);
                this.engine.addEntity(roxy);
            }
        }

        // Random NPC Spawning
        this.spawnNPCs(x, y, type);

        this.engine.addEntity(room);
        return room;
    }

    private spawnNPCs(x: number, y: number, type: number) {
        const spawn = (name: string, id?: string) => {
            if (name === 'street vendor') {
                const currentVendors = this.engine.getEntitiesWithComponent(NPC).filter(e => {
                    const n = e.getComponent(NPC);
                    return n && n.typeName === 'Street Vendor';
                }).length;
                if (currentVendors >= this.MAX_VENDORS) return;
            }

            // Check if this NPC already exists here to avoid duplicates
            const existingNPCs = WorldQuery.findNPCsAt(this.engine, x, y);
            if (existingNPCs.some(e => e.getComponent(NPC)?.typeName.toLowerCase() === name.toLowerCase())) {
                return;
            }

            const npc = PrefabFactory.createNPC(name, id);
            if (npc) {
                npc.addComponent(new Position(x, y));
                this.engine.addEntity(npc);
                PrefabFactory.equipNPC(npc, this.engine);
            }
        };

        const roll = Math.random();

        switch (type) {
            case 1: // Street
                if (roll < 0.12) spawn('street vendor');
                break;
            case 2: // Plaza
                if (roll < 0.15) spawn('street vendor');
                break;
            case 5: // Club
                if (roll < 0.60) spawn('dancer');
                break;
            case 4: // Clinic
                spawn('ripperdoc', 'npc_ripperdoc');
                break;
        }
    }

    private getRoomFlavor(type: number, x: number, y: number): RoomFlavor {
        switch (type) {
            case 1: // Street
                return {
                    title: "Neon-Lit Street",
                    desc: "Rain slicks the pavement, reflecting the garish neon signs above. Steam vents hiss, and the distant sound of sirens fills the air."
                };
            case 2: // Plaza
                return {
                    title: "Arcology Plaza",
                    desc: "A wide open space dominated by a massive holographic statue. Crowds of people hurry past, faces illuminated by the glow of their AR displays."
                };
            case 3: // Shop
                if (x === 8 && y === 8) {
                    return {
                        title: "Chrome & Steel",
                        desc: "The air smells of ozone and antiseptic. Glass cases display gleaming cybernetic limbs and neural interfaces.",
                        shopData: { name: "Chrome & Steel", desc: "High-end cybernetics and neural interfaces." }
                    };
                } else if (x === 12 && y === 8) {
                    return {
                        title: "The Armory",
                        desc: "Walls lined with weapons of all shapes and sizes. The shopkeeper eyes you suspiciously from behind a reinforced counter.",
                        shopData: { name: "The Armory", desc: "Weapons for every occasion." }
                    };
                } else {
                    return {
                        title: "Bits & Bytes",
                        desc: "Cluttered shelves overflow with miscellaneous tech parts, cables, and survival gear.",
                        shopData: { name: "Bits & Bytes", desc: "General supplies and tech scraps." }
                    };
                }
            case 4: // Clinic
                return {
                    title: "Street Doc's Clinic",
                    desc: "A grimy waiting room with flickering lights. The muffled sound of a surgical drill comes from the back.",
                    shopData: { name: "Street Doc's Clinic", desc: "Medical supplies and emergency treatments." }
                };
            case 5: // Club
                return {
                    title: "The Glitch Club",
                    desc: "Bass thumps in your chest. The air is thick with smoke and the smell of synthetic pheromones. Dancers move in cages suspended from the ceiling."
                };
            case 6: // Park
                return {
                    title: "Synth-Park",
                    desc: "Artificial turf and holographic trees create a poor imitation of nature. The sky above is a projection of a sunny day, glitching occasionally."
                };
            case 7: // Alchemist's Study
                return {
                    title: "The Alchemist's Study",
                    desc: "A hidden room filled with strange, glowing vials and ancient-looking computer terminals. The air hums with a strange energy. In the center stands a heavy stone table, surrounded by four pedestals, each bearing an ornate elemental bust."
                };
            case 8: // Portal Room
                return {
                    title: "Reality Breach Chamber",
                    desc: "The center of the city. Reality seems thin here, as if the fabric of space itself is fraying. Strange energies pulse through the air."
                };
            case 9: // Bar
                return {
                    title: "The Rusty Cog",
                    desc: "The air is thick with the smell of stale synth-ale and ozone. Dim, flickering amber lights illuminate a long, scarred metal bar. A collection of mismatched stools are bolted to the floor, and a jukebox in the corner plays a low, distorted bassline. This is a place for those who want to disappear for a while."
                };
            default:
                return {
                    title: "Empty Lot",
                    desc: "A vacant lot filled with rubble and trash."
                };
        }
    }
}
