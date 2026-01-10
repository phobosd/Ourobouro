import { Engine } from '../ecs/Engine';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Item } from '../components/Item';
import { NPC } from '../components/NPC';
import { Shop } from '../components/Shop';
import { CombatStats } from '../components/CombatStats';

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
        if (Math.random() > 0.7) {
            this.spawnNPC(x, y, type);
        }
    }

    private spawnNPC(x: number, y: number, type: number) {
        const npc = new Entity();
        npc.addComponent(new Position(x, y));

        if (type === 5) { // Club
            npc.addComponent(new NPC(
                "Dancer",
                ["Keep the rhythm.", "Want a drink?", "Too loud? Never."],
                "A holographic dancer shimmering in the strobe lights.",
                `
      /\\
     (  )
     /  \\
    /|  |\\
   / |  | \\
                `
            ));
        } else if (type === 4) { // Clinic
            npc.addComponent(new NPC(
                "Ripperdoc",
                ["Need a fix?", "I can replace that arm.", "Clean credits only."],
                "A surgeon with multi-tool fingers and a blood-stained apron.",
                `
     .--.
    ( () )
     |__|
    /|  |\\
   / |  | \\
                `
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
                    "A menacing figure with a glowing red cybernetic eye.",
                    `
  .  .      
  |\\/|      
  |  |      
 .|  |.     
/      \\    
|  *   |    
| \\__/ |    
 \\    /     
  \\  /      
  |  |      
 /|  |\\     
/ |  | \\    
                    `
                ));
            } else if (Math.random() > 0.4) { // 60% chance for Rat (if not Cyber Thug)
                // Spawn a Rat
                npc.addComponent(new NPC(
                    "Giant Rat",
                    ["Squeak!", "Hiss...", "*scratches floor*"],
                    "A large, mutated rat with glowing green eyes.",
                    `
      __             
   .-"  "-.          
  /        \\         
 |          |        
  \\  .--.  /         
   "|    |"          
    |    |           
   /      \\          
  (        )         
   \\      /          
    "----"           
                    `
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
                    "An old man hunched over a steaming cart.",
                    `
     ___
                    /   \\
   | o o |
   |  =  |
                    \\___ /
                    `
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
                        desc: "A high-end cybernetics shop. Display cases show off the latest neural links and limb replacements.",
                        shopData: { name: "Chrome & Steel", desc: "Cybernetics" }
                    };
                } else if (x > 10 && y < 10) {
                    return {
                        title: "The Armory",
                        desc: "Walls lined with plasma rifles and kinetic pistols. The air smells of gun oil.",
                        shopData: { name: "The Armory", desc: "Weapons" }
                    };
                } else {
                    return {
                        title: "Bits & Bytes",
                        desc: "A cluttered general store selling everything from nutrient paste to data shards.",
                        shopData: { name: "Bits & Bytes", desc: "General Goods" }
                    };
                }
            case 4: // Clinic
                return {
                    title: "Doc's Clinic",
                    desc: "A sterile white room that smells of antiseptic. A surgical bot hums in the corner.",
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
            default:
                return {
                    title: "Void",
                    desc: "You shouldn't be here."
                };
        }
    }
}
