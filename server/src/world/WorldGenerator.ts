import { Engine } from '../ecs/Engine';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Item } from '../components/Item';
import { NPC } from '../components/NPC';
import { Shop } from '../components/Shop';
import { CombatStats } from '../components/CombatStats';
import { Terminal } from '../components/Terminal';
import { PuzzleObject } from '../components/PuzzleObject';

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

        // Spawn a guaranteed rat in the center of Central Plaza
        const centerX = Math.floor(this.width / 2);
        const centerY = Math.floor(this.height / 2);
        const plazaRat = new Entity();
        plazaRat.addComponent(new Position(centerX, centerY));
        plazaRat.addComponent(new NPC(
            "Giant Rat",
            ["Squeak!", "Hiss...", "*scratches floor*"],
            "A large, mutated rat with glowing green eyes."
        ));
        plazaRat.addComponent(new CombatStats(20, 5, 0));
        this.engine.addEntity(plazaRat);

        console.log('World generation complete.');
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

        if (flavor.shopData) {
            room.addComponent(new Shop(flavor.shopData.name, flavor.shopData.desc));

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
                    'exoskeleton_frame'
                ];
            } else if (flavor.shopData.name === "The Armory") {
                items = [
                    'combat_knife',
                    'pistol_9mm',
                    'shotgun_12g',
                    'rifle_556',
                    'ammo_9mm',
                    'ammo_12g',
                    'ammo_556',
                    'monofilament_wire',
                    'smart_pistol',
                    'street_sweeper',
                    'vibro_blade'
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
                    'reflex_boost',
                    'flatline_heal'
                ];
            }

            terminal.addComponent(new Terminal("shop-catalog", { items }));
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
        const npc = new Entity();
        npc.addComponent(new Position(x, y));

        if (type === 5) { // Club
            npc.addComponent(new NPC(
                "Dancer",
                ["Keep the rhythm.", "Want a drink?", "Too loud? Never."],
                "A holographic dancer shimmering in the strobe lights."
            ));
        } else if (type === 4) { // Clinic
            npc.addComponent(new NPC(
                "Ripperdoc",
                ["Need a fix?", "I can replace that arm.", "Clean credits only."],
                "A surgeon with multi-tool fingers and a blood-stained apron."
            ));
        } else {
            // Generic NPCs
            if (Math.random() > 0.5) {
                npc.addComponent(new NPC(
                    "Cyber Thug",
                    [
                        "You lookin' at me?", "Got any credits?", "This is my turf.", "Keep walkin', chrome-dome.",
                        "Nice implants. Shame if someone ripped 'em out.", "I smell fear... or maybe just cheap ozone.",
                        "Don't make me use this.", "You lost, glitch?", "Pay up or bleed out.", "My optics are tracking your every move.",
                        "City's chewing you up already.", "Got a light? No? Get lost.", "Seen better tech in a dumpster.",
                        "Watch your back in the sprawl.", "I run this block.", "You cop or corp? Doesn't matter, you bleed the same.",
                        "Need a new scar?", "Buzz off before I short-circuit your nervous system.", "Spare some creds? Didn't think so.",
                        "Life's cheap here.", "What's in the bag?", "Eyes front, meatbag.", "I've flatlined better punks than you.",
                        "Don't touch the merchandise.", "Looking for trouble?", "Beat it, kid.", "This alley's closed.",
                        "You hear that hum? That's my arm powering up.", "Nothing personal, just business.", "Wrong place, wrong time.",
                        "Scram.", "I don't like your face.", "You wearing wire?", "Don't trust anyone. Especially me.",
                        "Night City eats the weak.", "Got a death wish?", "Move along.", "I'm watching you.", "Don't be a hero.",
                        "Heroes die fast here.", "Got some fresh chrome?", "You want a piece of me?", "Step off.",
                        "I'm not in the mood.", "Walk away.", "You're blocking my light.", "Make a move.", "I dare you.",
                        "Pathetic.", "Get out of my face.",
                        "You blink, you die.", "My software is faster than your reflexes.", "Don't make me dirty my blades.", "I'm the nightmare you can't wake up from.", "Your credits or your kneecaps.",
                        "I've got a quota to fill.", "You smell like a corp rat.", "This street is a graveyard.", "I'm the reaper of the neon jungle.", "Don't cross the line.",
                        "I'm wired for violence.", "You're just another statistic.", "My patience is at 1%.", "I can see your heartbeat.", "Fear is a useful emotion.",
                        "Run while you still have legs.", "I'm not here to talk.", "Silence is golden, screaming is silver.", "I'll recycle your parts.", "You're obsolete.",
                        "Don't test my firewall.", "I've got friends in low places.", "Gravity is the only law here.", "I'm the judge, jury, and executioner.", "Your warranty just expired.",
                        "I'm glitching... in a bad way.", "Don't look at my eye.", "I see dead pixels.", "You're lagging.", "Connection terminated.",
                        "I'm the virus in the system.", "System error: Mercy not found.", "I'll delete you.", "Format C: your face.", "Ctrl-Alt-Delete yourself.",
                        "I'm the blue screen of death.", "404: Hope not found.", "I'm the admin here.", "Access denied.", "Firewall breached.",
                        "Uploading pain...", "Downloading suffering...", "Buffering violence...", "Ping: 0ms.", "Packet loss: 100%.",
                        "You're offline.", "Rebooting... just kidding.", "Shutting down...", "Power off.", "End of line."
                    ],
                    "A menacing figure with a glowing red cybernetic eye."
                ));
            } else if (Math.random() > 0.2) { // 80% chance for Rat (if not Cyber Thug)
                // Spawn a Rat
                npc.addComponent(new NPC(
                    "Giant Rat",
                    ["Squeak!", "Hiss...", "*scratches floor*"],
                    "A large, mutated rat with glowing green eyes."
                ));
                npc.addComponent(new CombatStats(20, 5, 0)); // Weak stats
            } else {
                npc.addComponent(new NPC(
                    "Street Vendor",
                    [
                        "Fresh noodles!", "Best synthetic meat!", "Buy something!", "Hot rat-on-a-stick! crunchy!",
                        "Recycled water, 99% pure!", "Soy-paste, just like mom used to print!", "Data-shards! Get your lore here!",
                        "Real coffee! ...Okay, mostly real!", "Spicy algae wraps! Get 'em while they're green!", "Need a recharge? Energy drinks here!",
                        "Cheap eats for cheap streets!", "Don't ask where the meat comes from, just eat!", "Full belly, happy life!",
                        "Special deal for you, friend!", "Noodles so good you'll forget the rain!", "Vitamins! Minerals! Flavor... mostly!",
                        "Two for one on bio-sludge!", "Guaranteed not to kill you immediately!", "Taste the future!",
                        "Warm your bones with some broth!", "Best prices in the sector!", "I got what you need!", "Hungry? I know you are!",
                        "Feed the machine!", "Organic? Ha! Who can afford that?", "Synth-beef, synth-pork, synth-chicken! It's all the same!",
                        "No refunds!", "Eat now, pay... well, pay now too.", "Fresh from the vat!", "Support local business!",
                        "Don't starve in the street!", "A little grease keeps the gears turning!", "Try the mystery skewer!",
                        "It's not radioactive! I checked!", "Fuel for the fight!", "Comfort food for a cold night.", "Just like the ads!",
                        "Sustain your existence!", "Quick bite?", "I saw you eyeing the dumplings!", "Don't be shy!", "Everything must go!",
                        "Freshly printed!", "Hot and spicy!", "Sweet and sour!", "Savory and... texture!", "Fill the void!",
                        "Credits only, no crypto!", "Last chance for hot food!", "Tell your friends!",
                        "Spicy enough to melt your internals!", "Guaranteed 10% real meat!", "Don't ask, just chew!", "It's not slime, it's sauce!", "Flavor explosion!",
                        "Your stomach will thank me later!", "Maybe!", "Hotter than a plasma vent!", "Cold drinks for cold hearts!", "Feed the beast!",
                        "Nutrition blocks! Get your blocks!", "Square meals for square people!", "Round meals for... well, everyone!", "Eat it before it eats you!",
                        "Just kidding, it's dead... mostly.", "Fresh from the hydroponic gardens!", "Grown in a lab, cooked with love!", "Taste the chemistry!",
                        "Better living through MSG!", "Salt! Fat! Sugar! The holy trinity!", "Ignore the texture, focus on the taste!", "It's chewy because it's fresh!",
                        "Crunchy bits are free!", "Mystery meat surprise!", "Today's special: Edible matter!", "Consumables for sale!", "Refuel your biological unit!",
                        "Keep your organic components functioning!", "Maintenance for your gut!", "Lubricate your insides!", "Grease is good!", "Oil for your joints!",
                        "Bio-fuel for humans!", "High octane soup!", "Turbo-charge your metabolism!", "Warning: May cause happiness!", "Side effects include fullness!",
                        "Consult your doctor before eating... nah, it's fine!", "FDA approved... in some sector!", "Imported from... somewhere else!", "Exotic flavors from the wasteland!",
                        "Radioactive-free guarantee!", "Geiger counter says it's safe!", "Glowing green means it's good!", "Neon noodles!", "Cyber-spices!",
                        "Upgrade your lunch!", "Patch your hunger!", "Version 2.0 flavors!", "The ultimate food update!"
                    ],
                    "An old man hunched over a steaming cart."
                ));
            }
        }
        this.engine.addEntity(npc);
    }

    private getRoomFlavor(type: number, x: number, y: number): { title: string, desc: string, shopData?: { name: string, desc: string } } {
        switch (type) {
            case 1: // Street
                return {
                    title: "Neon Street",
                    desc: "A rain-slicked street reflecting the neon signs above. Steam rises from the vents."
                };
            case 2: // Plaza
                return {
                    title: "Central Plaza",
                    desc: "The beating heart of the city. Huge holographic ads tower overhead. Crowds of people move in every direction."
                };
            case 3: // Shop
                // Simple logic to vary shops based on position
                if (x < 10 && y < 10) {
                    return {
                        title: "Chrome & Steel",
                        desc: "The air in Chrome & Steel is sterile, filtered to a crisp chill that smells faintly of ozone and antiseptic. Rows of pristine glass display cases line the walls, illuminated by harsh, clinical blue lighting that reflects off the polished chrome surfaces. Inside, the latest in cybernetic enhancements rest on velvet cushions—sleek neural interface decks with gold-plated connectors, hydraulic limb replacements that gleam with oil-slick iridescence, and ocular implants that seem to track your movement even when powered down. In the back, the rhythmic whir of a precision servo-arm suggests ongoing modifications. A faint hum permeates the room, the sound of high-voltage power running through top-tier hardware. This isn't just a shop; it's a showroom for the next stage of human evolution, where flesh is merely a suggestion and steel is the upgrade you didn't know you needed until now.",
                        shopData: { name: "Chrome & Steel", desc: "Cybernetics" }
                    };
                } else if (x > 10 && y < 10) {
                    return {
                        title: "The Armory",
                        desc: "Stepping into The Armory feels like walking into the belly of a war machine. The walls are reinforced with heavy industrial plating, covered from floor to ceiling with racks of lethal hardware. The scent of gun oil, spent casing brass, and cold iron hangs heavy in the stagnant air. Kinetic pistols with matte-black finishes sit alongside heavy plasma rifles that hum with suppressed energy. Crates of ammunition are stacked haphazardly in the corners, some pried open to reveal glimmering rows of high-caliber rounds. A workbench in the corner is cluttered with disassembled weapon parts, scattered springs, and cleaning rags stained dark with grease. The lighting is dim and amber, casting long, jagged shadows that make the weapons look like sleeping beasts waiting to be woken. Here, violence is a currency, and business is always booming.",
                        shopData: { name: "The Armory", desc: "Weapons" }
                    };
                } else {
                    return {
                        title: "Bits & Bytes",
                        desc: "Bits & Bytes is a chaotic explosion of sensory overload. The cramped space is packed floor-to-ceiling with shelves overflowing with the detritus of daily survival in the sprawl. Tangled wires hang from the ceiling like synthetic vines, dripping with blinking LEDs and data-charms. Bins of discounted nutrient paste tubes in questionable flavors sit next to stacks of second-hand data shards, their labels faded and peeling. The air is thick with the smell of stale recycled air, cheap plastic, and the faint, sweet tang of energy drinks. A flickering holographic ad for 'Real Water' buzzes intermittently near the counter, casting a glitchy green light over the eclectic merchandise. It’s a scavenger’s paradise, a place where you can find a replacement battery, a meal, or a lost memory, provided you have the credits and the patience to dig through the junk.",
                        shopData: { name: "Bits & Bytes", desc: "General Goods" }
                    };
                }
            case 4: // Clinic
                return {
                    title: "Doc's Clinic",
                    desc: "Doc's Clinic is a jarring contrast to the grime of the streets outside. The automatic doors slide open with a pneumatic hiss, revealing a space that is aggressively, blindingly white. The smell of strong chemical antiseptic hits you immediately, burning the nostrils and masking the underlying copper tang of old blood. A surgical bot, its multi-jointed arms folded neatly, hums quietly in the corner, its optical sensors scanning you with cold indifference. The waiting area consists of a few uncomfortable plastic chairs, and a bio-monitor on the wall displays a flatline rhythm that hopefully isn't live. Behind a translucent partition, the silhouette of a medical gurney and the glint of surgical steel promise relief or reconstruction. It’s a place of last resorts, where the desperate come to be patched up, stitched together, or upgraded, leaving their pain—and their credits—on the operating table.",
                    shopData: { name: "Doc's Clinic", desc: "Medical Services" }
                };
            case 5: // Club
                return {
                    title: "The Pulse",
                    desc: "Deafening bass shakes the floor. Flashing lights disorient you. The crowd is wild."
                };
            case 6: // Park
                return {
                    title: "Synth-Park",
                    desc: "Artificial trees with fiber-optic leaves glow softly. The grass is a perfect, uniform green synthetic weave."
                };
            case 7: // Alchemist's Study
                return {
                    title: "The Alchemist's Study",
                    desc: "The air here is thick with the scent of ozone and ancient, dried herbs. Shafts of dim, amber light filter through high, grime-streaked windows, illuminating millions of dust motes dancing in the stillness. In the center of the room sits a heavy stone table, its surface scarred by centuries of chemical spills. Arranged in a semi-circle around it are four life-sized stone busts mounted on heavy pedestals. The silence is absolute, broken only by the faint, rhythmic scratching of grit beneath your boots."
                };
            default:
                return {
                    title: "Void",
                    desc: "You shouldn't be here."
                };
        }
    }
}
