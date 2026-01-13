# Ouroboro User's Guide

Welcome to Ouroboro, a cyberpunk text-based RPG. This guide will help you navigate the dark, neon-lit streets, manage your inventory, and survive combat.

## Table of Contents
1. [Basic Commands](#basic-commands)
2. [Interaction & Exploration](#interaction--exploration)
3. [Combat System](#combat-system)
4. [Shops & Terminals](#shops--terminals)
5. [Skills & Progression](#skills--progression)
6. [Cyberspace](#cyberspace)
7. [The Glitch Zone](#the-glitch-zone-dungeon)
8. [The Alchemist's Study](#the-alchemists-study)
9. [God Commands](#god-commands-admindeveloper)

## Basic Commands

| Command | Alias | Description | Example |
| :--- | :--- | :--- | :--- |
| `help` | `?` | List all available commands. | `help` |
| `look` | `l` | Look at the room, an item, or an NPC. | `look`, `look rat` |
| `inventory` | `i` | Check your inventory. | `i` |
| `sheet` | `stats` | View your character attributes and equipment. | `sheet` |
| `score` | `skills` | View your character skills. | `score` |
| `map` | `m` | Display the world map. | `map` |
| `weather` | `sky` | Scan the sky for current weather conditions. | `weather` |
| `stance` | - | Check or set your physical/combat stance. | `stance`, `stance offensive` |
| `use` | `u` | Use a consumable item. | `use medkit` |

## The Sprawl & Its Districts

The world of Ouroboro is divided into several distinct sectors, each with its own atmosphere and dangers.

*   **Chiba City**: The industrial heart, filled with rain-slicked streets and heavy manufacturing.
*   **The Sprawl**: The central urban hub, home to the Arcology Plaza and major corporate headquarters.
*   **Straylight**: The high-end district where the elite reside in gleaming towers of glass and chrome.
*   **The Matrix (Cyberspace)**: A digital mirror of the physical world, accessible via `jack_in`. It contains specialized nodes like **Data-Stream Conduits** and **Encrypted Sub-Nodes**.
*   **The Glitch Zone**: An unstable, procedurally generated dungeon accessed through the Glitch Door in the Central Plaza.

For a detailed map and list of key locations, see the [Area Guide](AREAS.md).

## Interaction & Exploration

### Movement
Navigate the world using cardinal directions: `north` (`n`), `south` (`s`), `east` (`e`), `west` (`w`).

### Items
*   **Get**: Pick up an item from the ground.
    *   `get <item name>` (e.g., `get medkit`)
*   **Drop**: Drop an item from your inventory.
    *   `drop <item name>` (e.g., `drop empty can`)
*   **Stow**: Put an item from your hands into your backpack or other containers.
    *   `stow <item name>` (e.g., `stow pistol`)
*   **Swap**: Switch items between your left and right hands.
    *   `swap`
*   **Wear**: Equip clothing or armor. Items automatically go to the correct slot (Head, Torso, Legs, Feet, Hands, Waist, Back).
    *   `wear <item name>` (e.g., `wear combat boots`)
*   **Remove**: Unequip an item.
    *   `remove <item name>` (e.g., `remove helmet`)
*   **Glance**: Quickly check what you are holding in your hands.
    *   `glance`
*   **Use**: Consume an item to gain its effects.
    *   `use <item name>` (e.g., `use medkit`)

### Consumables
Consumables provide vital recovery and buffs. Most are destroyed upon use.
*   **Medkit**: Restores **50 HP**.
*   **Stimpack**: Instantly clears all **Fatigue** and restores **Balance** to 100%.
*   **Painkillers**: Restores **25 HP**.
*   **Bandage**: Restores **15 HP**.
*   **Water Bottle**: Reduces **Fatigue** by 20.

### Stance & Posture
There are two types of "stance" in Ouroboro: **Physical Posture** and **Combat Stance**.

**Physical Posture**:
Affects your energy regeneration and ability to move.
*   `stand`: Stand up (default). Required for most movement and full combat effectiveness.
*   `sit`: Sit down (regenerate energy faster). **-25% Defense Power penalty.**
*   `lie`: Lie down (sleep/rest). **-50% Defense Power penalty.**

**Combat Stance**:
Determines how you defend yourself in a fight (Evasion vs. Parry vs. Shield). See the [Combat Stances](#3-combat-stances) section for details.
*   `stance`: Check your current physical and combat stance.
*   `stance <type>`: Change your combat stance (e.g., `stance evasion`).

## Combat System

Combat in Ouroboro is a high-stakes, real-time tactical experience. It combines traditional command-based interactions with a modern "Action Queuing" system for advanced maneuvers.

### 1. Attributes & Combat Stats
Your character's physical and mental capabilities directly impact your survival.

*   **Agility (AGI)**: The most critical combat stat. It determines your **Attack Power**, **Defense Power**, and your success in **Maneuvering**. Higher AGI also makes the "Sync Bar" easier to hit by widening the critical zone and slowing the cursor.
*   **Constitution (CON)**: Determines your **Max HP** and **Max Fatigue**. It also dictates how quickly you regenerate health and recover from exhaustion.
*   **Strength (STR)**: Affects your carrying capacity and weight limits (important for heavy armor and weapons).
*   **Momentum (Flow)**: A dynamic value (0-100%) representing your combat rhythm and focus. 
    *   **Building**: Gained through successful attacks, especially specialized moves like `slice`.
    *   **Persistence**: Momentum persists as long as you are actively engaged or being targeted by a hostile NPC in the same room. It resets to 0 only when combat is fully concluded.
    *   **States**: 
        *   `Building` (0-14%): Just starting to find your rhythm.
        *   `Flowing` (15-29%): Your movements become more fluid.
        *   `Peak` (30%+): You are in a state of perfect focus. **Required for Iaijutsu.**

### 2. Engagement Tiers (Range)
Combat occurs at specific ranges. You must be at the correct range for your weapon to be effective.

*   **Disengaged**: Outside of immediate combat.
*   **Missile**: Long range. Ideal for **Rifles**, **Pistols**, and **SMGs**.
*   **Polearm**: Extended melee range. Used for **Monofilament Whips** and other reach weapons.
*   **Melee**: The standard range for **Katanas**, **Machetes**, and **Clubs**.
*   **Close Quarters**: Extreme proximity. Required for **Knives**, **Knuckles**, and **Brawling** (Unarmed).

**Commands**:
*   `maneuver close`: Attempt to move one tier closer to your target.
*   `maneuver withdraw`: Attempt to move one tier further away.
*   `advance <target>`: Automatically attempt to close distance every round.
*   `retreat <target>`: Automatically attempt to withdraw every round.
*   `hangback`: Toggle a defensive mode where you automatically try to maintain your distance and prevent enemies from closing in.
*   `stop`: Cancel any automated actions (advance, retreat, hangback). **Ignores Roundtime.**
*   `flee [direction]`: Attempt to break engagement and exit the room.

### 3. Combat Stances
Your combat stance determines how you allocate your defensive focus. You have 100 "Defense Points" to distribute between three pools.

**Defense Pools**:
*   **Evasion**: Uses your **Evasion** skill. Effective against **ALL** attacks (Melee and Ranged).
*   **Parry**: Uses your **Melee Combat** (or **Kenjutsu**) skill. Effective against **Melee** attacks only.
    *   *Bonus*: Parrying allows you to deflect blows and create openings.
*   **Shield**: Uses your **Shield Usage** skill. Effective against **ALL** attacks.
    *   *Note*: Requires a shield generator or physical shield equipped.

**Available Stances**:

*   **Balanced Stances**: Distribute defense evenly (33% Evasion, 33% Parry, 34% Shield).
    *   `stance offensive`: Maximum Aggression (100%). Increases your damage but lowers defense.
    *   `stance neutral`: Moderate Aggression (50%). Balanced approach.
    *   `stance defensive`: Zero Aggression (0%). Focuses entirely on survival.

*   **Specialized Stances**: Allocate 100% defense to a single pool. Zero Aggression.
    *   `stance evasion`: **100% Evasion**. Best for dodging gunfire and keeping mobile.
    *   `stance parry`: **100% Parry**. Best for dueling melee opponents. **Passively generates Flow** when you successfully defend against an attack.
    *   `stance shield`: **100% Shield**. Maximizes protection if you have shield gear.

*   **Custom**:
    *   `stance custom <evasion> <parry> <shield>`: Manually allocate your 100 defense points (e.g., `stance custom 50 50 0`).
*   `stance`: Typing the command alone will display your current physical stance and defense allocation.

### 4. Traditional Combat (The Sync Bar)
When you use the `attack` command, you initiate a "Neural Sync." A bar will appear with a moving cursor.
*   **Hit**: Press `Space` or `F` when the cursor is in the zone.
*   **Critical**: Hit the center of the zone for massive damage and potential **Wounds**.
*   **Miss**: Failing to hit the zone or timing it poorly results in a miss and loss of balance.

**Targeting**:
*   `target <body_part>`: Set a specific body part to target (e.g., `target head`, `target legs`).
*   `assess`: View the current combat situation, including distances and statuses.
*   `appraise <target>`: Check an enemy's health and wound status.

### 5. Advanced Combat (Sequence Mode)
For melee combat, you can choose between immediate actions or "uploading" a sequence of actions to your neural buffer for rapid execution.

**Sequence Mode**:
*   **Toggle**: Type `sequence` (or `seq`) to toggle Sequence Mode ON/OFF.
*   **Mode OFF (Default)**: Commands like `slash`, `thrust`, `parry`, and `dash` execute **immediately** as standard actions.
*   **Mode ON**: These commands are queued into your **Combat Buffer** (up to 3 slots initially).

**Buffer Actions**:
*   `dash`: Closes distance to the target.
*   `slash`: A standard melee strike (1.2x damage).
*   `slice`: A fast, precision strike (Samurai weapons build momentum).
*   `thrust`: A powerful, focused strike (1.5x damage).
*   `parry`: Provides a temporary +20 bonus to your Parry defense and opens an **Active Parry Window** (1.5s).

**Execution**:
*   `upload` (or `execute`): Executes all queued actions in sequence.

**Combos**:
*   **Triple Strike**: `slash` -> `slash` -> `slash` (2.0x damage multiplier).
*   **Riposte**: `parry` -> `slash` -> `thrust` (2.5x damage multiplier).
*   **Critical Execution**: `dash` -> `dash` -> `slash` (3.0x damage multiplier).

While executing a buffer, watch for enemy **Telegraphs** (e.g., "The enemy prepares a SLASH!").

*   **Perfect Sync**: If you `parry` a telegraphed `slash` or `thrust`, or `dash` against a telegraphed `dash`, you achieve **Perfect Sync**.
*   **Active Parry**: Using the `parry` buffer action opens a 1.5s window. If an enemy attacks during this time, you deflect the blow, reducing its severity (e.g., a Solid hit becomes Marginal) and gaining Flow.
*   **Stance Parry**: If you are in `stance parry` (100% allocation), you gain Flow passively when an enemy misses you or lands only a Marginal hit.
*   **Flow State**: Accumulating 3 Flow increases your **Max Buffer Slots** (up to 6), allowing for even longer combos.

### 6. Wounds & System Shock
Heavy hits can cause lasting damage:
*   **Wounds**: Specific body parts can be bruised, bleeding, or shattered, imposing penalties to accuracy or movement. Use `appraise <target>` to check an enemy's condition.
*   **System Shock**: Taking a crushing blow while executing a buffer can **Scramble** your sequence, turning your planned attacks into useless `stumbles`.
*   **Malware**: Certain advanced enemies (like the Turing Police) can inject malware like `REBOOT.EXE` into your buffer, forcing a system shutdown.

### 7. Specialized Gear
Not all weapons are created equal. Some offer unique tactical advantages:

*   **Smart-Guns**: Equipped with neural-link software, these weapons (like the **Smart-Pistol**) make the Sync Bar significantly easier to hit.
*   **Monofilament Weapons**: Whips and wires that ignore physical armor, dealing massive damage but requiring high skill to control.
*   **Non-Lethal Options**: The **Taser Prod** and **Compliance Derm** can stun or paralyze targets, allowing for non-lethal takedowns.
*   **Heavy Kinetic**: Weapons like the **Street-Sweeper** deal devastating damage but are difficult to sync due to high recoil (jitter).
*   **Katanas**: Require the **Kenjutsu** skill for maximum effectiveness. These weapons are the core of the Samurai combat style, utilizing **Momentum** for devastating techniques.
    *   **Slice**: A fast, precision strike (2s roundtime). Successfully landing a `slice` with a katana grants **+5 Momentum**.
    *   **Iaijutsu**: A devastating instant strike. 
        *   **Requirement**: 30+ Momentum (Peak state).
        *   **Effect**: Deals massive damage and bypasses standard defense checks. Consumes a portion of your momentum.

### 8. Brawling (Unarmed Combat)
If you find yourself without a weapon, you can rely on your fists. The **Brawling** skill governs your effectiveness with unarmed attacks.
*   **Punch**: A standard strike. Balanced speed and damage.
*   **Jab**: A quick, light blow. High accuracy but low damage.
*   **Uppercut**: A powerful, rising strike. High damage but slower speed.
*   **Headbutt**: A risky, close-range attack. High damage.

### 9. Ammunition & Reloading
Firearms require ammunition. When your magazine is empty, use `reload` to insert a fresh one.
*   **Reload Speed**: Reloading takes time (Base: 5 seconds).
*   **Skill Bonus**: Higher Marksmanship skill levels significantly reduce reload time for that weapon type.
    *   *Light*: Pistols, SMGs
    *   *Medium*: Rifles, Carbines
    *   *Heavy*: Shotguns, Heavy Weapons

## Shops & Terminals

Shops are automated via **Terminals**.

1.  **Find a Shop**: Look for descriptions like "Chrome & Steel" or "The Armory".
2.  **Inspect Terminal**: Type `look terminal` to see the terminal description.
3.  **Browse Catalog**: Type `read terminal` (or `scan terminal`) to view the items for sale.
4.  **Purchase**: Click on the item in the terminal list (if using the mouse) or follow the on-screen prompts.

## Skills & Progression

Your character is defined by **Attributes** (STR, AGI, CON, CHA) and **Skills**.

*   **Attributes**: Fixed stats that determine your base capabilities.
*   **Skills**: Improve with use.
    *   *Kenjutsu*: Mastery of the Samurai Sword. Used for attacking and parrying with Katanas.
    *   *Melee Combat*: General skill for blunt and edged weapons.
    *   *Marksmanship (Light)*: Pistols and SMGs.
    *   *Marksmanship (Medium)*: Rifles and carbines.
    *   *Marksmanship (Heavy)*: Heavy weapons and launchers.
    *   *Stealth*: Helps you avoid detection.
    *   *Hacking*: Used for data terminals and cyber-warfare.

Type `score` to see your current skill levels.

## Cyberspace

Access the Matrix to interact with digital systems, bypass security, and navigate the neural sprawl.

### 🔌 Jacking In & Out
Connecting to the Matrix is a high-risk operation that requires focus and specialized hardware.

*   **`jack_in`**: Connect your consciousness to the grid.
    *   **Requirements**:
        *   You must be **holding** a Cyberdeck in your hands (left or right).
        *   You must be in a **Standing** stance.
        *   You must be **Disengaged** from combat.
    *   **Effect**: Your physical body enters a **Stasis** stance, and you incur a **4-second Round Timer** as your neural link synchronizes.
*   **`jack_out`**: Disconnect and return to your physical body.
    *   **Requirements**:
        *   You must still be **holding** your Cyberdeck.
        *   You must be **Disengaged** from digital combat.
    *   **Effect**: You return to your physical body in a **Standing** stance, incurring a **4-second Round Timer** for re-entry.

### 📟 The Matrix Environment
Once jacked in, the world transforms into a neon-green wireframe grid.
*   **Matrix Rain**: A constant stream of falling code permeates your vision.
*   **Neural Topology Grid**: The `map` command provides a digital wireframe of the local network. Digital nodes are represented by specialized icons (e.g., `+` for Bio-Data, `$` for Encrypted Sub-Nodes).
*   **Mirror World**: The Matrix mirrors the physical city. Every physical street and building has a corresponding digital node at a coordinate offset of +10,000.
*   **ICE**: Intrusion Countermeasure Electronics (Black ICE, White ICE) patrol the grid. Engaging them in digital combat can cause **Lethal Feedback** to your physical nervous system.

## The Glitch Zone (Dungeon)

The Glitch Zone is an unstable, procedurally generated area filled with high-value "Glitch" enemies.

*   **Entry**: Look for the **Glitch Door** in the Central Plaza (10, 10). Use `enter door` or `enter glitch` to step through.
*   **Exit**: To leave the dungeon, you must find the **Reality Rift**, typically located at the furthest point from the entry. Use `enter rift` to return to the stability of the Sprawl.
*   **Scaling Difficulty**: The Glitch Zone is dangerous. Enemies scale in power the further you venture from the entry point. Ensure you are well-equipped before exploring deep into the sector.
*   **Progression**: Defeating glitch enemies provides high-value loot drops. The system will notify you of remaining glitch signatures as you clear the sector.

## The Alchemist's Study

A hidden chamber filled with ancient tech and mysterious artifacts. It contains a complex puzzle involving four stone busts: **Ignis**, **Aqua**, **Air**, and **Terra**.

*   **The Puzzle**: You must `turn` the busts to face the correct directions based on the inscription found in the room.
*   **Terra**: This bust is fused to its base and cannot be turned. It faces **Down**.
*   **Interaction**: Use `turn <bust> <direction>` (e.g., `turn ignis west`).
*   **Reward**: Solving the puzzle reveals a hidden path or grants access to rare archives.

## God Commands (Admin/Developer)

These commands are for testing and world management.

| Command | Description | Example |
| :--- | :--- | :--- |
| `god find <query>` | Search for entities by name or ID. | `god find door` |
| `god spawn <name>` | Spawn an item or NPC at your location. | `god spawn giant rat` |
| `god money <amt> [target]` | Give credits to yourself or a target. | `god money 1000000` |
| `god set-stat <stat> <val>` | Set a specific attribute for a target. | `god set-stat STR 20` |
| `god set-skill <skill> <val>` | Set a specific skill level for a target. | `god set-skill Hacking 10` |
| `god view [target]` | View detailed stats and components of a target. | `god view me` |
| `god reset <skills\|health>` | Reset your skills or restore health to full. | `god reset health` |
| `god weather` | Trigger a random weather change. | `god weather` |
| `god pacify [target]` | Stop a target (or everyone in room) from attacking. | `god pacify` |
| `god registry` | List all unique items in the game database. | `god registry` |
