import { Entity } from '../ecs/Entity';
import { Item } from '../components/Item';
import { Weapon } from '../components/Weapon';
import { Magazine } from '../components/Magazine';
import { Container } from '../components/Container';
import { NPC } from '../components/NPC';
import { CombatStats } from '../components/CombatStats';
import { Position } from '../components/Position';
import { Cyberware } from '../components/Cyberware';
import { IsICE } from '../components/IsICE';
import { WoundTable } from '../components/WoundTable';
import { Stats } from '../components/Stats';
import { Armor } from '../components/Armor';
import { IsRoom } from '../components/IsRoom';
import { Description } from '../components/Description';
import { Atmosphere } from '../components/Atmosphere';
import { Visuals } from '../components/Visuals';
import { Personality } from '../components/Personality';
import { Memory } from '../components/Memory';
import { Relationship } from '../components/Relationship';

import { ItemRegistry } from '../services/ItemRegistry';
import { NPCRegistry } from '../services/NPCRegistry';
import { RoomRegistry } from '../services/RoomRegistry';
import { EngagementTier } from '../types/CombatTypes';

import { Inventory } from '../components/Inventory';
import { IEngine } from '../ecs/IEngine';
import { CombatBuffer } from '../components/CombatBuffer';

export class PrefabFactory {
    static equipNPC(npc: Entity, engine: IEngine) {
        const npcComp = npc.getComponent(NPC);
        if (!npcComp) return;

        if (npcComp.typeName === 'Street Samurai') {
            const inventory = new Inventory();
            npc.addComponent(inventory);
            const katana = PrefabFactory.createItem("katana");
            if (katana) {
                engine.addEntity(katana);
                inventory.rightHand = katana.id;
            }
        }

        if (npcComp.tag === 'turing') {
            const spawnItem = (name: string, equip: boolean = false) => {
                const item = PrefabFactory.createItem(name);
                if (item) {
                    engine.addEntity(item);
                    const inventory = npc.getComponent(Inventory) || new Inventory();
                    if (!npc.hasComponent(Inventory)) {
                        npc.addComponent(inventory);
                    }

                    if (equip) {
                        inventory.rightHand = item.id;
                    } else {
                        inventory.equipment.set(`pocket_${item.id}`, item.id);
                    }
                }
            };

            spawnItem('ceska_scorpion', true);
            spawnItem('compliance_derm');
        }
    }

    static equipICE(npc: Entity, engine: IEngine) {
        // 1. Equip Armor
        const armor = PrefabFactory.createItem("digital_vest");
        if (armor) {
            engine.addEntity(armor);
            const inventory = npc.getComponent(Inventory) || new Inventory();
            if (!npc.hasComponent(Inventory)) npc.addComponent(inventory);

            inventory.equipment.set('body', armor.id);

            // Apply armor stats manually since we don't have an ArmorSystem yet
            const combatStats = npc.getComponent(CombatStats);
            if (combatStats) {
                combatStats.defense += 10; // Match the item definition
            }
        }

        // 2. Equip Weapon (50/50 chance)
        const isRanged = Math.random() < 0.5;
        const weaponName = isRanged ? "pulse_rifle" : "digital_blade";
        const weapon = PrefabFactory.createItem(weaponName);

        if (weapon) {
            engine.addEntity(weapon);
            const inventory = npc.getComponent(Inventory) || new Inventory();
            if (!npc.hasComponent(Inventory)) npc.addComponent(inventory);

            inventory.rightHand = weapon.id;

            // If ranged, give them some ammo too
            if (isRanged) {
                const ammo = PrefabFactory.createItem("energy_cell");
                if (ammo) {
                    engine.addEntity(ammo);
                    inventory.equipment.set('belt_1', ammo.id);
                }
            }
        }
    }

    static createItem(name: string): Entity | null {
        const entity = new Entity();
        const registry = ItemRegistry.getInstance();

        // Try to find by ID first (exact match), then by name (fuzzy/exact)
        let def = registry.getItem(name);

        // If not found, try searching by shortName or name in the all items list
        if (!def) {
            const allItems = registry.getAllItems();
            def = allItems.find(i => i.name.toLowerCase() === name.toLowerCase() || i.shortName.toLowerCase() === name.toLowerCase());
        }

        // If not found by ID, try to find by name in the registry (ItemRegistry handles this via its map)

        if (def) {
            // Get slot from either def.slot or extraData.slot (for all item types)
            const itemSlot = def.slot || def.extraData?.slot || null;

            // Use name as the display name, and shortName as the internal slug/alias
            entity.addComponent(new Item(def.name, def.description, def.weight, 1, def.size, def.legality, def.attributes, def.shortName, itemSlot, def.rarity || 'common', def.id));

            if (def.type === 'container') {
                const capacity = def.extraData.capacity || 10;
                entity.addComponent(new Container(capacity));
            } else if (def.type === 'weapon') {
                const data = def.extraData;
                const minTier = data.minTier || EngagementTier.MELEE;
                const maxTier = data.maxTier || EngagementTier.MELEE;
                const momentumImpact = data.momentumImpact || 0.1;
                const roundtime = data.roundtime || 3;
                const range = data.range !== undefined ? data.range : 0;
                const ammoType = range > 0 ? (data.ammoType || '9mm') : null;
                const magSize = range > 0 ? (data.magSize || 10) : 0;

                entity.addComponent(new Weapon(
                    def.shortName,
                    def.description,
                    data.damage || 10,
                    range,
                    ammoType,
                    data.magazineType || null,
                    magSize,
                    data.difficulty || { speed: 1.0, zoneSize: 1, jitter: 0.1 },
                    minTier as any,
                    maxTier as any,
                    momentumImpact,
                    roundtime
                ));
            } else if (def.type === 'cyberware') {
                const data = def.extraData;
                entity.addComponent(new Cyberware(data.slot || 'neural', new Map(Object.entries(data.modifiers || {}))));
            } else if (def.type === 'armor') {
                const data = def.extraData;
                entity.addComponent(new Armor(data.defense || 0, data.penalty || 0));
            }

            // Add Magazine component if it's a magazine item
            if (def.extraData && def.extraData.isMagazine) {
                const data = def.extraData;
                entity.addComponent(new Magazine(
                    def.shortName,
                    data.capacity || 10,
                    data.currentAmmo !== undefined ? data.currentAmmo : (data.capacity || 10),
                    data.ammoType || '9mm'
                ));
            }

            return entity;
        }

        // Fallback for hardcoded items (legacy support)
        const lowerName = name.toLowerCase();
        switch (lowerName) {
            case 'beer can':
                entity.addComponent(new Item("Beer Can", "An empty, crushed beer can.", 0.5));
                break;
            case 'backpack':
                entity.addComponent(new Item("Backpack", "A sturdy canvas backpack.", 1.0, 1, "Medium", "Legal", "Container", "backpack", "back"));
                entity.addComponent(new Container(20.0));
                break;
            case 'ceska_scorpion':
                entity.addComponent(new Item("Ceska Scorpion", "A matte-black submachine gun.", 2.0));
                entity.addComponent(new Weapon("Ceska Scorpion", "smg", 15, 20, "9mm", "Ceska Scorpion Magazine", 20, { speed: 1.2, zoneSize: 4, jitter: 0.2 }, EngagementTier.MISSILE, EngagementTier.MELEE, 0.3, 3));
                break;
            case 'compliance_derm':
                entity.addComponent(new Item("Compliance Derm", "A dermal patch that induces paralysis.", 0.01));
                entity.addComponent(new Weapon("Compliance Derm", "derm", 1, 1, "none", "none", 1, { speed: 1.0, zoneSize: 5, jitter: 0.0 }, EngagementTier.CLOSE_QUARTERS, EngagementTier.CLOSE_QUARTERS, 0.0, 1));
                break;
            default:
                return null;
        }
        return entity;
    }

    static createRoom(id: string): Entity | null {
        const registry = RoomRegistry.getInstance();
        const def = registry.getRoom(id);
        if (!def) return null;

        const entity = new Entity(def.id);
        entity.addComponent(new IsRoom());
        entity.addComponent(new Position(def.coordinates.x, def.coordinates.y));
        entity.addComponent(new Description(def.name, def.description));
        entity.addComponent(new Atmosphere());

        // We don't have an engine reference here to add NPCs directly, 
        // so we'll rely on the caller to handle NPC spawning if needed,
        // or we can add a 'spawns' property to the room entity if we had a component for it.
        // However, the Director handles the engine.

        return entity;
    }

    static createNPC(name: string, id?: string): Entity | null {
        const entity = new Entity(id);
        const lowerName = name.toLowerCase();

        // Try Registry First
        const registry = NPCRegistry.getInstance();
        const def = registry.getNPC(name);

        if (def) {
            entity.addComponent(new NPC(
                def.name,
                def.dialogue || ["..."],
                def.description,
                def.canMove ?? true,
                def.tags?.[0] || '',
                def.behavior === 'aggressive',
                (def.behavior as any) || 'neutral'
            ));
            entity.addComponent(new CombatStats(def.stats.health, def.stats.attack, def.stats.defense, def.behavior === 'aggressive'));

            // Add common components
            entity.addComponent(new WoundTable());
            entity.addComponent(new Stats());
            entity.addComponent(new CombatBuffer(3));

            // Add Visuals if portrait exists
            if (def.portrait) {
                entity.addComponent(new Visuals('E', 'white', 0, def.portrait));
            }

            // Handle Special Tags
            if (def.tags?.includes('ice')) {
                entity.addComponent(new IsICE(def.name));
            }

            // Add Personality and Social Components if defined
            if (def.personality) {
                entity.addComponent(new Personality(
                    def.personality.traits,
                    def.personality.voice,
                    def.personality.agenda,
                    def.personality.background
                ));
                entity.addComponent(new Memory());
                entity.addComponent(new Relationship());
            }

            return entity;
        }

        switch (lowerName) {
            case 'giant rat':
                entity.addComponent(new NPC(
                    "Giant Rat",
                    ["Squeak!", "Hiss...", "*scratches floor*"],
                    "A massive, mutated rodent the size of a large dog. Its fur is matted and greasy, patchy in places where scarred, pink skin shows through. Its eyes glow with a sickly, radioactive green luminescence, twitching erratically. You can hear its heavy, wheezing breath and smell the acrid stench of decay and sewage that clings to it.",
                    false,
                    '',
                    false, // isAggressive
                    'cautious'
                ));
                entity.addComponent(new CombatStats(30, 8, 2, false));
                entity.addComponent(new Stats());
                entity.addComponent(new CombatBuffer(3));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/giant_rat.jpg'));
                break;
            case 'cyber thug':
                entity.addComponent(new NPC(
                    "Cyber Thug",
                    ["You lookin' at me?", "Got any credits?", "This is my turf."],
                    "A lean, dangerous figure leaning with practiced nonchalance. They wear a patchwork of scavenged leather and matte-black synthetic plates. A glowing red cybernetic implant replaces their left eye, scanning you with mechanical precision, while their right hand hovers near a holster. A low hum emanates from their enhanced limbs, and they smell of ozone and cheap tobacco.",
                    true,
                    '',
                    false, // isAggressive
                    'cautious'
                ));
                entity.addComponent(new CombatStats(60, 12, 6));
                entity.addComponent(new Stats());
                entity.addComponent(new CombatBuffer(3));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/cyber_thug.jpg'));
                break;
            case 'dancer':
                entity.addComponent(new NPC(
                    "Dancer",
                    ["Keep the rhythm.", "Want a drink?", "Too loud? Never."],
                    "A holographic dancer shimmering in the strobe lights.",
                    false,
                    '',
                    false,
                    'friendly'
                ));
                entity.addComponent(new CombatStats(30, 5, 2));
                entity.addComponent(new Stats());
                entity.addComponent(new CombatBuffer(3));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/dancer.jpg'));
                break;
            case 'ripperdoc':
                entity.addComponent(new NPC(
                    "Ripperdoc",
                    ["Need a fix?", "I can replace that arm.", "Clean credits only."],
                    "A surgeon with multi-tool fingers and a blood-stained apron.",
                    false,
                    '',
                    false,
                    'neutral'
                ));
                entity.addComponent(new CombatStats(40, 8, 3));
                entity.addComponent(new Stats());
                entity.addComponent(new CombatBuffer(3));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/ripperdoc.jpg'));
                break;
            case 'street vendor':
                entity.addComponent(new NPC(
                    "Street Vendor",
                    ["Fresh noodles!", "Best synthetic meat!", "Buy something!"],
                    "An old man hunched over a steaming cart.",
                    false,
                    '',
                    false,
                    'friendly'
                ));
                entity.addComponent(new CombatStats(30, 5, 1));
                entity.addComponent(new Stats());
                entity.addComponent(new CombatBuffer(3));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/street_vendor.jpg'));
                break;
            case 'street samurai':
                entity.addComponent(new NPC(
                    "Street Samurai",
                    ["My reflexes are faster than your thoughts.", "Honor is a luxury you can't afford.", "Target locked."],
                    "A razor-edged warrior with chrome-plated limbs and retractable mono-filament claws. Their eyes are replaced by a multi-spectrum sensor array, and they move with a fluid, predatory grace that suggests heavy synaptic acceleration.",
                    true,
                    '',
                    false, // isAggressive
                    'neutral'
                ));
                entity.addComponent(new CombatStats(80, 12, 8));
                const samuraiStats = new Stats();
                samuraiStats.attributes.set('AGI', { name: 'AGI', value: 20 });
                entity.addComponent(samuraiStats);
                entity.addComponent(new CombatBuffer(5));
                entity.addComponent(new WoundTable());
                entity.addComponent(new Visuals('E', 'white', 0, '/assets/portraits/street_samurai.jpg'));
                break;
            case 'fixer':
                entity.addComponent(new NPC(
                    "The Fixer",
                    ["I have a job for you.", "Information is the only real currency.", "Don't ask where I got it."],
                    "A well-dressed individual sitting in the shadows, surrounded by multiple encrypted data-slates. They have a calm, calculating demeanor and a neural-link that never seems to stop blinking.",
                    false,
                    '',
                    false,
                    'neutral'
                ));
                entity.addComponent(new CombatStats(60, 10, 5));
                entity.addComponent(new Visuals('F', 'cyan', 0, '/assets/portraits/fixer.jpg'));
                break;
            case 'turing police':
                entity.addComponent(new NPC(
                    "Turing Police",
                    ["AI breakthrough detected.", "Cease and desist.", "By order of the Turing Registry."],
                    "A stern agent in a grey polycarbon suit, wearing a badge that signifies their authority over artificial intelligences. They carry a heavy taser-prod and a specialized scanner for detecting rogue code.",
                    true, // canMove
                    'turing', // tag
                    false,
                    'neutral'
                ));
                entity.addComponent(new CombatStats(100, 16, 10));
                // Loadout is handled in WorldGenerator based on 'turing' tag.

                // We need to handle inventory assignment. 
                // Since PrefabFactory returns an Entity, we can't easily add components to child entities here without an engine reference or a more complex return type.
                // However, we can add an Inventory component to the NPC and pre-populate it?
                // The Inventory component stores IDs, which requires the items to be in the engine.
                // This is a limitation of the current factory. 
                // For now, we will mark them to be spawned by the caller (WorldGenerator) or handle it differently.
                // Actually, let's just add a 'Loadout' component or similar, or handle it in WorldGenerator.
                // BETTER: Let's just return the NPC and let WorldGenerator handle the loadout based on the tag?
                // OR: We can't add entities to the engine here.
                // Let's modify WorldGenerator to check for 'turing' tag and spawn items.
                break;
            case 'white ice':
                entity.addComponent(new NPC(
                    "White ICE",
                    ["[SYSTEM] ACCESS DENIED", "[SYSTEM] INTRUSION DETECTED", "[SYSTEM] TRACE INITIATED"],
                    "A shimmering wall of crystalline code, pulsing with a cold, white light. It is a passive but formidable defense system designed to block unauthorized access.",
                    false,
                    '',
                    false,
                    'neutral'
                ));
                entity.addComponent(new IsICE('White ICE'));
                entity.addComponent(new CombatStats(100, 0, 20)); // Passive defense
                break;
            case 'black ice':
                entity.addComponent(new NPC(
                    "Black ICE",
                    ["[SYSTEM] LETHAL FEEDBACK ENGAGED", "[SYSTEM] NEURAL SPIKE UPLOADING", "[SYSTEM] TARGET ACQUIRED"],
                    "A dark, swirling vortex of malevolent code. It is an aggressive intrusion countermeasure designed to physically damage the brain of any hacker it encounters.",
                    false,
                    '',
                    false, // isAggressive
                    'neutral'
                ));
                entity.addComponent(new IsICE('Black ICE'));
                entity.addComponent(new CombatStats(140, 22, 12, false)); // Lethal
                break;
            default:
                return null;
        }

        // All NPCs get a WoundTable and Stats
        entity.addComponent(new WoundTable());
        entity.addComponent(new Stats());
        if (entity.hasComponent(CombatStats)) {
            entity.addComponent(new CombatBuffer(3));
        }

        // Add AI Components to all neutral/friendly NPCs
        const npc = entity.getComponent(NPC);
        if (npc && !npc.isAggressive) {
            entity.addComponent(new Memory());
            entity.addComponent(new Relationship());

            // Default personality if not already set by registry
            if (!entity.hasComponent(Personality)) {
                let traits = ["Neutral"];
                let voice = "Average";
                let agenda = "Survive";

                if (lowerName === 'street vendor') {
                    traits = ["Hardworking", "Gossip", "Friendly"];
                    voice = "Raspy, enthusiastic";
                    agenda = "Sell all the noodles";
                } else if (lowerName === 'fixer') {
                    traits = ["Calculating", "Secretive", "Ambitious"];
                    voice = "Smooth, low-volume";
                    agenda = "Collect all the secrets";
                } else if (lowerName === 'ripperdoc') {
                    traits = ["Professional", "Cynical", "Steady-handed"];
                    voice = "Clinical, detached";
                    agenda = "Keep the city's chrome running";
                } else {
                    // Generate random personality for other NPCs
                    const randomP = PrefabFactory.generateRandomPersonality(npc.typeName, npc.tag);
                    traits = randomP.traits;
                    voice = randomP.voice;
                    agenda = randomP.agenda;
                }

                entity.addComponent(new Personality(traits, voice, agenda));
            }
        }

        return entity;
    }

    static getSpawnableItems(): string[] {
        const hardcoded = [
            'beer can', 'pistol_9mm', 'mag_pistol_9mm', 'backpack',
            'tactical shirt', 'cargo pants', 'utility belt',
            'ceska_scorpion', 'mag_scorpion', 'shotgun_12g', 'shells_12g',
            'rifle_556', 'mag_rifle_556', 'ammo_9mm_loose', 'ammo_556_loose',
            'katana', 'dagger', 'machete', 'brass_knuckles',
            'digital_blade', 'pulse_rifle', 'digital_vest', 'energy_cell'
        ];
        const registryItems = ItemRegistry.getInstance().getUniqueItemNames();
        return Array.from(new Set([...hardcoded, ...registryItems]));
    }

    static getSpawnableNPCs(): string[] {
        const hardcoded = ['giant rat', 'cyber thug', 'dancer', 'ripperdoc', 'street vendor', 'street samurai', 'fixer', 'turing police', 'white ice', 'black ice'];
        const registryNPCs = NPCRegistry.getInstance().getAllNPCs().map(n => n.name.toLowerCase());
        return Array.from(new Set([...hardcoded, ...registryNPCs]));
    }

    private static generateRandomPersonality(name: string, tag: string): { traits: string[], voice: string, agenda: string } {
        const traitsList = [
            "Paranoid", "Friendly", "Aggressive", "Stoic", "Nervous", "Arrogant", "Humble", "Curious", "Greedy", "Altruistic",
            "Cynical", "Optimistic", "Pessimistic", "Mysterious", "Talkative", "Silent", "Observant", "Clumsy", "Graceful", "Rough"
        ];

        const voices = [
            "Deep and gravelly", "High-pitched and squeaky", "Smooth and melodic", "Raspy and harsh", "Monotone and robotic",
            "Whispery and soft", "Loud and booming", "Stuttering and nervous", "Fast and energetic", "Slow and deliberate"
        ];

        const agendas = [
            "Survive another day", "Get rich quick", "Find a lost friend", "Escape the city", "Protect their turf",
            "Learn the secrets of the Matrix", "Get revenge on a rival", "Find the best noodles", "Upgrade their cyberware", "Cause chaos"
        ];

        // Pick 2-3 random traits
        const numTraits = 2 + Math.floor(Math.random() * 2);
        const traits: string[] = [];
        for (let i = 0; i < numTraits; i++) {
            const trait = traitsList[Math.floor(Math.random() * traitsList.length)];
            if (!traits.includes(trait)) {
                traits.push(trait);
            }
        }

        const voice = voices[Math.floor(Math.random() * voices.length)];
        const agenda = agendas[Math.floor(Math.random() * agendas.length)];

        return { traits, voice, agenda };
    }

    static stockVendor(npc: Entity, engine: IEngine, itemNames: string[]) {
        let inventory = npc.getComponent(Inventory);
        if (!inventory) {
            inventory = new Inventory();
            npc.addComponent(inventory);
        }

        let container = npc.getComponent(Container);
        if (!container) {
            container = new Container(100); // 100kg capacity for vendors
            npc.addComponent(container);
        }

        for (const itemName of itemNames) {
            const item = PrefabFactory.createItem(itemName);
            if (item) {
                engine.addEntity(item);
                container.items.push(item.id);
            }
        }
    }
}
