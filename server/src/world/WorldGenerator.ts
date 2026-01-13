import { Engine } from '../ecs/Engine';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Item } from '../components/Item';
import { NPC } from '../components/NPC';
import { Shop } from '../components/Shop';
import { Inventory } from '../components/Inventory';
import { CombatStats } from '../components/CombatStats';
import { Terminal } from '../components/Terminal';
import { PuzzleObject } from '../components/PuzzleObject';
import { Atmosphere } from '../components/Atmosphere';
import { IsCyberspace } from '../components/IsCyberspace';
import { PrefabFactory } from '../factories/PrefabFactory';
import { ItemRegistry } from '../services/ItemRegistry';
import { Portal } from '../components/Portal';

export class WorldGenerator {
    private engine: Engine;
    private width: number;
    private height: number;

    constructor(engine: Engine, width: number = 20, height: number = 20) {
        this.engine = engine;
        this.width = width;
        this.height = height;
    }

    generate() {
        console.log(`Generating ${this.width}x${this.height} world...`);

        // 0: Empty, 1: Street, 2: Plaza, 3: Shop, 4: Clinic, 5: Club, 6: Park
        const mapLayout = this.createLayout(this.width, this.height);

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const type = mapLayout[y][x];
                if (type !== 0) {
                    this.createRoom(x, y, type);
                }
            }
        }

        this.createMatrixMirror(mapLayout);

        console.log('World generation complete.');
    }

    private createMatrixMirror(layout: number[][]) {
        console.log("Generating Matrix Mirror world...");
        const offset = 10000;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const type = layout[y][x];
                if (type === 0) continue;

                const node = new Entity();
                node.addComponent(new IsRoom());
                node.addComponent(new IsCyberspace());
                node.addComponent(new Position(x + offset, y));
                node.addComponent(new Atmosphere("Neon-Pulse Grid", "Digital Glow", "Ultra-High"));

                let title = "Digital Node";
                let desc = "A crystalline structure of pulsing light and shifting data-streams.";

                switch (type) {
                    case 1: // Street
                        title = "Data-Stream Conduit";
                        desc = "A high-speed data conduit where packets of encrypted information flow like liquid light.";
                        break;
                    case 2: // Plaza
                        title = "Central Processing Nexus";
                        desc = "The core of the local network. Massive pillars of light represent the arcology's primary data-hubs.";
                        break;
                    case 3: // Shop
                        title = "Encrypted Sub-Node";
                        desc = "A secure sub-node containing commercial data-shards and transaction logs.";
                        break;
                    case 4: // Clinic
                        title = "Bio-Data Repository";
                        desc = "A specialized node for storing and processing biological telemetry and neural-map data.";
                        break;
                    case 5: // Club
                        title = "Social Frequency Hub";
                        desc = "A chaotic hub of unencrypted social data and sensory-broadcast streams.";
                        break;
                    case 6: // Park
                        title = "Recursive Logic Garden";
                        desc = "A peaceful sector of the grid where fractal algorithms create a digital representation of nature.";
                        break;
                    case 7: // Alchemist's Study
                        title = "Obfuscated Archive";
                        desc = "A heavily encrypted archive node, hidden behind layers of ancient, non-standard protocols.";
                        break;
                }

                node.addComponent(new Description(title, desc));
                this.engine.addEntity(node);

                // Spawn ICE in the Matrix
                if (Math.random() > 0.8) {
                    const ice = PrefabFactory.createNPC(Math.random() > 0.7 ? 'black ice' : 'white ice');
                    if (ice) {
                        ice.addComponent(new Position(x + offset, y));
                        this.engine.addEntity(ice);
                        PrefabFactory.equipICE(ice, this.engine);
                    }
                }
            }
        }
    }

    private createLayout(w: number, h: number): number[][] {
        const layout = Array(h).fill(0).map(() => Array(w).fill(0));
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);

        // Main Streets
        for (let y = 2; y < h - 2; y++) layout[y][cx] = 1;
        for (let x = 2; x < w - 2; x++) layout[cy][x] = 1;

        // Plaza
        layout[cy][cx] = 2;
        layout[cy - 1][cx] = 2;
        layout[cy + 1][cx] = 2;
        layout[cy][cx - 1] = 2;
        layout[cy][cx + 1] = 2;
        layout[cy - 1][cx - 1] = 2;
        layout[cy - 1][cx + 1] = 2;
        layout[cy + 1][cx - 1] = 2;
        layout[cy + 1][cx + 1] = 2;
        layout[cy - 1][cx - 1] = 2;
        layout[cy - 1][cx + 1] = 2;
        layout[cy + 1][cx - 1] = 2;
        layout[cy + 1][cx + 1] = 2;

        // Shops
        layout[cy - 2][cx - 2] = 3; // Cyber-Implant Shop
        layout[cy - 2][cx + 2] = 3; // Weapon Shop
        layout[cy + 2][cx - 2] = 3; // General Store

        // Shop Connections (Side Streets)
        layout[cy - 2][cx - 1] = 1; // Connect (8,8) to Main St (10,8)
        layout[cy - 2][cx + 1] = 1; // Connect (12,8) to Main St (10,8)
        layout[cy + 2][cx - 1] = 1; // Connect (8,12) to Main St (10,12)

        // Clinic
        layout[cy + 2][cx + 2] = 4;
        layout[cy + 2][cx + 1] = 1; // Connect (12,12) to Main St (10,12)

        // Club
        layout[cy][cx + 5] = 5;
        layout[cy][cx + 6] = 5;
        layout[cy + 1][cx + 5] = 5;
        layout[cy + 1][cx + 6] = 5;

        // Park
        for (let py = cy + 4; py < cy + 8; py++) {
            for (let px = cx - 6; px < cx - 2; px++) {
                layout[py][px] = 6;
            }
        }
        // Park Connection
        for (let x = cx - 2; x <= cx; x++) {
            layout[cy + 4][x] = 1; // Connect Park top-right to Main St vertical
        }

        // Alchemist's Study (Hidden Room)
        // Connected to Bits & Bytes (cx - 2, cy + 2) via a hidden passage? 
        // Let's just connect it to the side street at (cx - 3, cy - 1) for now, or make it accessible from the shop.
        // Let's put it at (cx + 3, cy - 1) connected to the side street (cx + 1, cy - 2) is a bit far.
        // Let's put it off the East Main Street.
        layout[cy][cx + 3] = 7; // Alchemist's Study
        layout[cy][cx + 2] = 1; // Connecting street

        return layout;
    }

    private createRoom(x: number, y: number, type: number) {
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
                    'combat_knife',
                    'katana',
                    'dagger',
                    'machete',
                    'brass_knuckles',
                    'pistol_9mm',
                    'mag_pistol_9mm',
                    'shotgun_12g',
                    'shells_12g',
                    'rifle_556',
                    'mag_rifle_556',
                    'ammo_9mm_loose',
                    'ammo_556_loose',
                    'monofilament_wire',
                    'smart_pistol',
                    'mag_smart_pistol',
                    'street_sweeper',
                    'mag_street_sweeper',
                    'vibro_blade',
                    'ceska_scorpion',
                    'mag_scorpion',
                    'modular_firearm',
                    'monofilament_whip',
                    'taser_prod',
                    'compliance_derm',
                    // Neon-Ronin Armor
                    'ronin_visor',
                    'synth_silk_kimono',
                    'scabbard_pack',
                    'obi_sash',
                    'hakama_trousers',
                    'tabi_boots',
                    // Heavy-Chrome Armor
                    'enforcer_helm',
                    'plated_cuirass',
                    'power_unit',
                    'load_bearing_harness',
                    'greaves_of_industry',
                    'mag_lock_boots'
                ];
            } else if (flavor.shopData.name === "Bits & Bytes") {
                items = [
                    'beer_can',
                    'backpack',
                    'flashlight',
                    'water_bottle',
                    'multitool',
                    'neon_spray'
                ];
            } else if (flavor.shopData.name === "Doc's Clinic") {
                items = [
                    'medkit',
                    'stimpack',
                    'bandage',
                    'painkillers',
                    'flatline_heal'
                ];
            }

            terminal.addComponent(new Terminal("shop-catalog", {
                items,
                title: flavor.shopData.name.toUpperCase() + " CATALOG"
            }));
            this.engine.addEntity(terminal);
        }

        this.engine.addEntity(room);

        // Randomly spawn items
        if (Math.random() > 0.8 && type !== 2) { // Less trash in plaza
            const item = new Entity();
            item.addComponent(new Position(x, y));
            item.addComponent(new Item("Beer Can", "An empty, crushed beer can.", 0.5));
            this.engine.addEntity(item);
        }

        // Randomly spawn NPCs
        if (Math.random() > 0.7 && type !== 7) { // No random NPCs in puzzle room
            this.spawnNPC(x, y, type);
        }

        // Spawn Puzzle Objects for Alchemist's Study
        if (type === 7) {
            this.spawnPuzzleObjects(x, y);
        }

        // Spawn Cyber-Door in Plaza (10, 10)
        if (x === 10 && y === 10) {
            const door = new Entity();
            door.addComponent(new Position(x, y));
            door.addComponent(new Description("Glitch Door", "A flickering, unstable tear in reality. It hums with the sound of dial-up internet and screams."));
            door.addComponent(new Portal('dungeon'));
            this.engine.addEntity(door);
        }
    }

    private spawnPuzzleObjects(x: number, y: number) {
        // Table with inscription
        const table = new Entity();
        table.addComponent(new Position(x, y));
        table.addComponent(new Description("Stone Table", "The table is a monolithic slab of grey granite. A brass plate is bolted to the center, etched with elegant but fading script. It reads:\n\n\"The sun sets in the west, the rain falls to the mud, and the wind blows toward the dawn. Only when the elements find their gaze shall the hidden path be revealed.\""));
        this.engine.addEntity(table);

        // Busts
        const createBust = (name: string, desc: string, targetDir: string | null, initialDir: string = "north") => {
            const bust = new Entity();
            bust.addComponent(new Position(x, y));
            bust.addComponent(new Description(name, `${desc} It is currently facing ${initialDir.charAt(0).toUpperCase() + initialDir.slice(1)}.`));
            bust.addComponent(new PuzzleObject("alchemist_puzzle", initialDir, targetDir));
            this.engine.addEntity(bust);
        };

        createBust("Ignis Bust", "This bust depicts a man with wild, flickering hair and eyes made of polished rubies. He looks defiant.", "west");
        createBust("Aqua Bust", "A serene woman with flowing robes that seem to ripple like waves. Her stone eyelids are closed in meditation.", "south");
        createBust("Air Bust", "This bust is carved from a lighter, almost translucent marble. Her hair is swept back as if by a gale.", "east");

        // Terra Bust - Special case: Fused to base, faces Down.
        // We set targetDir to null or a special value to indicate it's part of the set but static?
        // Actually, the puzzle logic checks if current == target. If target is null, it might ignore it or fail.
        // The user says "Terra: Direction does not matter" in previous context, but here "He faces Down... cannot be turned".
        // If it cannot be turned, we should probably set its target to its initial direction if we want it to count, or null if it doesn't matter.
        // Previous logic: "Terra: Direction does not matter."
        // Let's set targetDir to "down" and initial to "down" and ensure it can't be turned in InteractionSystem.
        const terra = new Entity();
        terra.addComponent(new Position(x, y));
        terra.addComponent(new Description("Terra Bust", "A stout, bearded figure carved from heavy basalt. He faces Down, staring intently at the floor beneath his pedestal. Unlike the others, this bust is fused to its base and cannot be turned."));
        terra.addComponent(new PuzzleObject("alchemist_puzzle", "down", "down"));
        this.engine.addEntity(terra);
    }

    private spawnNPC(x: number, y: number, type: number) {
        let npc: Entity | null = null;

        if (type === 5) { // Club
            npc = PrefabFactory.createNPC('dancer');
        } else if (type === 4) { // Clinic
            npc = PrefabFactory.createNPC('ripperdoc');
        } else {
            // Generic NPCs
            const rand = Math.random();
            if (rand > 0.7) {
                npc = PrefabFactory.createNPC('street samurai');
            } else if (rand > 0.4) {
                npc = PrefabFactory.createNPC('turing police');
            } else if (rand > 0.1) {
                npc = PrefabFactory.createNPC('giant rat');
            } else {
                npc = PrefabFactory.createNPC('street vendor');
            }
        }

        if (npc) {
            npc.addComponent(new Position(x, y));
            this.engine.addEntity(npc);

            const npcComp = npc.getComponent(NPC);
            if (npcComp) {
                PrefabFactory.equipNPC(npc, this.engine);
            }
        }
    }


    private getRoomFlavor(type: number, x: number, y: number): { title: string, desc: string, shopData?: { name: string, desc: string } } {
        let zonePrefix = "";
        if (x < 7) zonePrefix = "Chiba City: ";
        else if (x < 14) zonePrefix = "The Sprawl: ";
        else zonePrefix = "Straylight: ";

        switch (type) {
            case 1: // Street
                return {
                    title: zonePrefix + "Neon-Pulse Interstitial",
                    desc: "A rain-slicked polycarbon street reflecting the neon-pulse signs above. Graphene-coated vents hiss with steam as sararimen hurry past the arcology shadows."
                };
            case 2: // Plaza
                return {
                    title: zonePrefix + "Central Arcology Plaza",
                    desc: "The beating heart of the sprawl. Huge holographic ads tower over the geo-dome. Crowds of people move through the interstitial spaces in every direction. In the center of the plaza, a flickering <terminal>Glitch Door</terminal> tears at the fabric of reality."
                };
            case 3: // Shop
                if (x < 10 && y < 10) {
                    return {
                        title: zonePrefix + "Chrome & Steel",
                        desc: "The air in Chrome & Steel is sterile, filtered to a crisp chill that smells faintly of ozone and antiseptic. Rows of pristine polycarbon display cases line the walls, illuminated by harsh, mercury-vapor lighting that reflects off the polished graphene surfaces. Inside, the latest in cybernetic enhancements rest on velvet cushions—sleek neural interface decks with gold-plated connectors, hydraulic limb replacements that gleam with oil-slick iridescence, and ocular implants that seem to track your movement even when powered down. In the back, the rhythmic whir of a precision servo-arm suggests ongoing modifications. A faint hum permeates the room, the sound of high-voltage power running through top-tier hardware. This isn't just a shop; it's a showroom for the next stage of human evolution, where flesh is merely a suggestion and steel is the upgrade you didn't know you needed until now. The Fixer sits in a corner, watching the door.",
                        shopData: { name: "Chrome & Steel", desc: "Cybernetics" }
                    };
                } else if (x > 10 && y < 10) {
                    return {
                        title: zonePrefix + "The Armory",
                        desc: "Stepping into The Armory feels like walking into the belly of a war machine. The walls are reinforced with heavy polycarbon plating, covered from floor to ceiling with racks of lethal hardware. The scent of gun oil, spent casing brass, and cold iron hangs heavy in the stagnant air. Kinetic pistols with matte-black finishes sit alongside heavy plasma rifles that hum with suppressed energy. Crates of ammunition are stacked haphazardly in the corners, some pried open to reveal glimmering rows of high-caliber rounds. A workbench in the corner is cluttered with disassembled weapon parts, scattered springs, and cleaning rags stained dark with grease. The lighting is dim and amber, casting long, jagged shadows that make the weapons look like sleeping beasts waiting to be woken. Here, violence is a currency, and business is always booming.",
                        shopData: { name: "The Armory", desc: "Weapons" }
                    };
                } else {
                    return {
                        title: zonePrefix + "Bits & Bytes",
                        desc: "Bits & Bytes is a chaotic explosion of sensory overload. The cramped space is packed floor-to-ceiling with shelves overflowing with the detritus of daily survival in the sprawl. Tangled graphene wires hang from the ceiling like synthetic vines, dripping with blinking LEDs and data-charms. Bins of discounted nutrient paste tubes in questionable flavors sit next to stacks of second-hand data shards, their labels faded and peeling. The air is thick with the smell of stale recycled air, cheap polycarbon, and the faint, sweet tang of energy drinks. A flickering holographic ad for 'Real Water' buzzes intermittently near the counter, casting a glitchy green light over the eclectic merchandise. It’s a scavenger’s paradise, a place where you can find a replacement battery, a meal, or a lost memory, provided you have the credits and the patience to dig through the junk.",
                        shopData: { name: "Bits & Bytes", desc: "General Goods" }
                    };
                }
            case 4: // Clinic
                return {
                    title: zonePrefix + "Doc's Clinic",
                    desc: "Doc's Clinic is a jarring contrast to the grime of the streets outside. The automatic polycarbon doors slide open with a pneumatic hiss, revealing a space that is aggressively, blindingly white. The smell of strong chemical antiseptic hits you immediately, burning the nostrils and masking the underlying copper tang of old blood. A surgical bot, its multi-jointed arms folded neatly, hums quietly in the corner, its optical sensors scanning you with cold indifference. The waiting area consists of a few uncomfortable plastic chairs, and a bio-monitor on the wall displays a flatline rhythm that hopefully isn't live. Behind a translucent partition, the silhouette of a medical gurney and the glint of surgical steel promise relief or reconstruction. It’s a place of last resorts, where the desperate come to be patched up, stitched together, or upgraded, leaving their pain—and their credits—on the operating table.",
                    shopData: { name: "Doc's Clinic", desc: "Medical Services" }
                };
            case 5: // Club
                return {
                    title: zonePrefix + "The Pulse",
                    desc: "Deafening bass shakes the polycarbon floor. Flashing neon-pulse lights disorient you. The crowd is wild."
                };
            case 6: // Park
                return {
                    title: zonePrefix + "Synth-Park",
                    desc: "Artificial trees with fiber-optic leaves glow softly. The grass is a perfect, uniform green synthetic graphene weave."
                };
            case 7: // Alchemist's Study
                return {
                    title: zonePrefix + "The Alchemist's Study",
                    desc: "The air here is thick with the scent of ozone and ancient, dried herbs. Shafts of dim, amber light filter through high, grime-streaked polycarbon windows, illuminating millions of dust motes dancing in the stillness. In the center of the room sits a heavy stone table, its surface scarred by centuries of chemical spills. Arranged in a semi-circle around it are four life-sized stone busts mounted on heavy pedestals. The silence is absolute, broken only by the faint, rhythmic scratching of grit beneath your boots."
                };
            default:
                return {
                    title: "Void",
                    desc: "You shouldn't be here."
                };
        }
    }
}
