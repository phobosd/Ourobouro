
import json
import os

items_path = r'c:\Users\andyp\Zenith-9\server\data\items.json'

new_items = [
    # Neon-Ronin Set (Agility/Stealth)
    {
        "id": "55",
        "name": "ronin_visor",
        "shortName": "Ronin Visor",
        "description": "A sleek, wrap-around visor with glowing neon accents. It provides a HUD overlay and minimal protection.",
        "weight": 0.5,
        "size": "Small",
        "legality": "Legal",
        "attributes": "Head Armor; Low Defense, No Penalty.",
        "cost": 1200,
        "type": "armor",
        "extraData": { "defense": 2, "penalty": 0, "slot": "head" }
    },
    {
        "id": "56",
        "name": "synth_silk_kimono",
        "shortName": "Synth-Silk Kimono",
        "description": "A stylish jacket woven from ballistic synth-silk. It flows with your movements and offers surprising protection.",
        "weight": 1.5,
        "size": "Medium",
        "legality": "Legal",
        "attributes": "Torso Armor; Medium Defense, No Penalty.",
        "cost": 2500,
        "type": "armor",
        "extraData": { "defense": 5, "penalty": 0, "slot": "torso" }
    },
    {
        "id": "57",
        "name": "scabbard_pack",
        "shortName": "Scabbard Pack",
        "description": "A lightweight backpack with integrated magnetic locks for sheathing blades.",
        "weight": 1.0,
        "size": "Medium",
        "legality": "Legal",
        "attributes": "Back Armor/Container; Low Defense.",
        "cost": 800,
        "type": "armor",
        "extraData": { "defense": 1, "penalty": 0, "slot": "back", "capacity": 15 }
    },
    {
        "id": "58",
        "name": "obi_sash",
        "shortName": "Obi Sash",
        "description": "A wide, reinforced belt that conceals several pouches.",
        "weight": 0.5,
        "size": "Small",
        "legality": "Legal",
        "attributes": "Waist Armor; Low Defense.",
        "cost": 500,
        "type": "armor",
        "extraData": { "defense": 1, "penalty": 0, "slot": "waist" }
    },
    {
        "id": "59",
        "name": "hakama_trousers",
        "shortName": "Hakama Trousers",
        "description": "Loose-fitting, pleated trousers reinforced with impact-absorbing gel layers.",
        "weight": 1.0,
        "size": "Medium",
        "legality": "Legal",
        "attributes": "Leg Armor; Medium Defense.",
        "cost": 1000,
        "type": "armor",
        "extraData": { "defense": 3, "penalty": 0, "slot": "legs" }
    },
    {
        "id": "60",
        "name": "tabi_boots",
        "shortName": "Tabi Boots",
        "description": "Split-toe boots designed for silence and grip.",
        "weight": 0.5,
        "size": "Small",
        "legality": "Legal",
        "attributes": "Foot Armor; Low Defense.",
        "cost": 600,
        "type": "armor",
        "extraData": { "defense": 1, "penalty": 0, "slot": "feet" }
    },

    # Heavy-Chrome Set (Tank/Defense)
    {
        "id": "61",
        "name": "enforcer_helm",
        "shortName": "Enforcer Helm",
        "description": "A heavy, full-face helmet with reinforced ceramic plating. Intimidating and nearly bulletproof.",
        "weight": 3.0,
        "size": "Medium",
        "legality": "Restricted",
        "attributes": "Head Armor; High Defense, Low Penalty.",
        "cost": 2000,
        "type": "armor",
        "extraData": { "defense": 5, "penalty": 1, "slot": "head" }
    },
    {
        "id": "62",
        "name": "plated_cuirass",
        "shortName": "Plated Cuirass",
        "description": "A heavy chest piece made of industrial-grade steel and ceramic composites.",
        "weight": 15.0,
        "size": "Large",
        "legality": "Restricted",
        "attributes": "Torso Armor; Very High Defense, High Penalty.",
        "cost": 5000,
        "type": "armor",
        "extraData": { "defense": 12, "penalty": 3, "slot": "torso" }
    },
    {
        "id": "63",
        "name": "power_unit",
        "shortName": "Power Unit",
        "description": "A back-mounted power supply and armor plate. Looks like a jetpack, but it's just heavy armor.",
        "weight": 10.0,
        "size": "Medium",
        "legality": "Restricted",
        "attributes": "Back Armor; High Defense, Medium Penalty.",
        "cost": 1500,
        "type": "armor",
        "extraData": { "defense": 4, "penalty": 2, "slot": "back" }
    },
    {
        "id": "64",
        "name": "load_bearing_harness",
        "shortName": "Load-Bearing Harness",
        "description": "A heavy-duty waist harness designed to support the weight of other armor pieces.",
        "weight": 2.0,
        "size": "Medium",
        "legality": "Legal",
        "attributes": "Waist Armor; Medium Defense.",
        "cost": 800,
        "type": "armor",
        "extraData": { "defense": 2, "penalty": 1, "slot": "waist" }
    },
    {
        "id": "65",
        "name": "greaves_of_industry",
        "shortName": "Greaves of Industry",
        "description": "Thick, hydraulic-assisted leg armor. Makes a loud stomping sound.",
        "weight": 8.0,
        "size": "Large",
        "legality": "Restricted",
        "attributes": "Leg Armor; High Defense, Medium Penalty.",
        "cost": 2500,
        "type": "armor",
        "extraData": { "defense": 8, "penalty": 2, "slot": "legs" }
    },
    {
        "id": "66",
        "name": "mag_lock_boots",
        "shortName": "Mag-Lock Boots",
        "description": "Heavy boots with magnetic locking clamps. Great for stability, bad for running.",
        "weight": 4.0,
        "size": "Medium",
        "legality": "Legal",
        "attributes": "Foot Armor; Medium Defense, Medium Penalty.",
        "cost": 1200,
        "type": "armor",
        "extraData": { "defense": 4, "penalty": 2, "slot": "feet" }
    }
]

with open(items_path, 'r') as f:
    data = json.load(f)

# Check if items already exist to avoid duplicates
existing_ids = set(item['id'] for item in data)
for item in new_items:
    if item['id'] not in existing_ids:
        data.append(item)
    else:
        print(f"Skipping {item['name']} (ID {item['id']}) - already exists.")

with open(items_path, 'w') as f:
    json.dump(data, f, indent=4)

print(f"Added {len(new_items)} items to {items_path}")
