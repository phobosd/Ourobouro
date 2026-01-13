# Ouroboro: Technical Knowledge Base for AI Agents

Welcome, Architect. This document is your primary source of truth for the Ouroboro game engine. It is designed to provide you with an instant mental model of the system and "Golden Path" recipes for implementation.

---

## 🛠 Maintenance Protocols

As an agent, you are responsible for maintaining the integrity of this knowledge base and the user-facing documentation.

1.  **Update `AGENTS.md`**: Every time a new mechanic, architectural change, or large-scale modification is added or removed, you **MUST** update this file to reflect the current state of the engine.
2.  **Update `docs/USERS_GUIDE.md`**: This is the player's primary manual and the source for the in-game guide. You **MUST** update this file whenever:
    - A new **command** is added, modified, or removed.
    - A **new area** is introduced (e.g., The Glitch Zone, The Alchemist's Study, or new city sectors like Straylight).
    - A **major mechanic** is added (e.g., the Combat Buffer, Flow State, or specialized weapon traits like Smart-Link).
    - A **lore element** or **world-building detail** that affects gameplay is established.
    - **Environmental effects** or hazards are added.
    Accuracy is paramount as players rely on this for survival and progression.
3.  **Update `docs/COMPENDIUM.md`**: This is the reference for all game data. You **MUST** update this file whenever:
    - A new **NPC** is added or modified (stats, behavior, description).
    - A new **Item** is added or modified (stats, cost, type).
4.  **Update `docs/AREAS.md`**: You **MUST** update this file whenever:
    - A new **Area** or **Zone** is added.
    - The **Map Layout** is changed in `WorldGenerator.ts`.
    - New **Key Locations** (Shops, Dungeons) are created.
5.  **Update `client/src/components/Terminal.tsx`**: You **MUST** update this file whenever a new command is added:
    - Add the command to the `COMMANDS` list.
    - Implement its argument autocomplete logic in `getMatches`.
6.  **Review Game Documentation**: You **MUST** review `docs/USERS_GUIDE.md`, `docs/COMPENDIUM.md`, and `docs/AREAS.md` to become familiar with the game itself.

---

## 🧠 The Mental Model

Ouroboro is a **High-Performance ECS (Entity-Component-System)** MUD (Multi-User Dungeon) built with Node.js and React.

### 1. Core Architecture
- **Entities**: Simple containers with a unique ID. They hold **Components**.
- **Components**: Pure data structures (classes) that inherit from `Component`. They must be serializable.
- **Systems**: Logic classes that inherit from `System`. They iterate over entities with specific component signatures.
- **Engine**: The orchestrator. It manages the entity list, component indexing, and system execution. Uses the `IEngine` interface to break circular dependencies and implements **Component Caching** for high-performance queries.
- **Event Bus**: A type-safe `GameEventBus` for decoupled communication between systems (e.g., `MovementSystem` emitting events that `NPCSystem` listens to).

### 2. The Game Loop
The server runs at **10 Ticks Per Second (TPS)**.
1. **Input**: Socket.io receives commands (validated by Zod).
2. **Update**: `engine.update(deltaTime)` runs all registered systems.
3. **Persistence**: `WorldStateService` saves entities to Redis every 30 seconds.
4. **Broadcast**: `MessageService` sends structured JSON updates to clients.

### 3. State & Persistence
- **Serialization**: Components use `toJSON()` and `fromJSON()`. Special care is taken for `Map` objects.
- **Registry**: `ComponentRegistry` maps string types to Class constructors for reconstruction.
- **Versioning**: Entities have a `version` field for schema migration.

### 4. System Architecture Diagram

```mermaid
graph TD
    subgraph Client_Layer [Client Layer - React]
        Terminal[Terminal.tsx]
        SocketClient[Socket.io-Client]
    end

    subgraph Network_Layer [Network Layer - Node.js]
        SocketServer[Socket.io-Server]
        Zod[Zod Validation]
    end

    subgraph Engine_Layer [Engine Layer - ECS]
        Engine[ECS Engine]
        Systems[Systems: Movement, Combat, Interaction, Inventory, NPC]
        Entities[Entities & Components]
        Registry[Component Registry]
        EventBus[GameEventBus]
    end

    subgraph Service_Layer [Service Layer]
        MessageService[MessageService]
        WorldState[WorldStateService]
        PrefabFactory[PrefabFactory]
        ItemRegistry[ItemRegistry]
        Autocomplete[AutocompleteAggregator]
    end

    subgraph Persistence_Layer [Persistence Layer]
        PersistenceManager[PersistenceManager]
        Redis[(Redis DB)]
        CSV[items.csv]
    end

    %% Command Flow
    Terminal -->|Raw String| SocketClient
    SocketClient -->|Socket Event| SocketServer
    SocketServer -->|Validate| Zod
    Zod -->|Clean Command| Engine
    Engine -->|Execute| Systems

    %% System Logic
    Systems -->|Query| Entities
    Systems -->|Emit/Listen| EventBus
    Systems -->|Notify| MessageService
    Systems -->|Spawn| PrefabFactory
    
    %% Data Flow
    PrefabFactory -->|Lookup| ItemRegistry
    ItemRegistry -->|Load| CSV
    
    %% Persistence Flow
    Engine -.->|Auto-Save| WorldState
    WorldState -->|Serialize| Registry
    Registry -->|JSON| PersistenceManager
    PersistenceManager -->|SET/GET| Redis

    %% Feedback Flow
    MessageService -->|Structured JSON| SocketServer
    SocketServer -->|GameMessage| SocketClient
    SocketClient -->|Render| Terminal
```

---

## 🛠 Golden Path Implementation Recipes

### 📦 Adding a New Item
The game uses `server/data/items.json` as the primary item database. Items are loaded by `ItemRegistry` and instantiated by `PrefabFactory`.

#### Item Types
- **`item`**: General items (consumables, quest items, ammo)
- **`weapon`**: Combat weapons (requires `Weapon` component)
- **`armor`**: Wearable armor (requires `Armor` component)
- **`cyberware`**: Neural/body implants (requires `Cyberware` component)
- **`container`**: Storage items like backpacks (requires `Container` component)

#### Adding a Weapon
1. **Add to `items.json`**:
   ```json
   {
       "id": "99",
       "name": "plasma_cutter",
       "shortName": "Plasma Cutter",
       "description": "A high-energy cutting tool.",
       "weight": 3.0,
       "size": "Medium",
       "legality": "Restricted",
       "attributes": "Melee Weapon; Ignores armor.",
       "cost": 2500,
       "type": "weapon",
       "extraData": {
           "damage": 35,
           "range": 0,
           "minTier": "melee",
           "maxTier": "close quarters",
           "momentumImpact": 0.4,
           "roundtime": 3,
           "difficulty": { "speed": 1.2, "zoneSize": 3, "jitter": 0.2 }
       }
   }
   ```
2. **Add to Shop** (optional): Update `WorldGenerator.ts` shop terminal items array.
3. **Update COMPENDIUM.md**: Document the new weapon with stats.

#### Adding Armor
**CRITICAL**: Armor items store their slot in `extraData.slot`, not at the top level!

1. **Add to `items.json`**:
   ```json
   {
       "id": "100",
       "name": "tactical_vest",
       "shortName": "Tactical Vest",
       "description": "Lightweight kevlar vest.",
       "weight": 2.0,
       "size": "Medium",
       "legality": "Legal",
       "attributes": "Torso Armor; Medium Defense, Low Penalty.",
       "cost": 1500,
       "type": "armor",
       "extraData": {
           "defense": 8,
           "penalty": 1,
           "slot": "torso"
       }
   }
   ```
   **Valid Slots**: `head`, `torso`, `back`, `waist`, `legs`, `feet`
   
2. **Armor Mechanics**:
   - `defense`: Added to defender's power in combat calculations
   - `penalty`: Subtracted from defender's power (represents agility loss)
   - Equipped armor is checked in `CombatSystem.calculateDefenderPower()`

3. **Add to Shop** (optional): Add to The Armory in `WorldGenerator.ts`.
4. **Update COMPENDIUM.md**: Document with defense/penalty stats.

#### Adding Cyberware
1. **Add to `items.json`**:
   ```json
   {
       "id": "101",
       "name": "neural_boost",
       "shortName": "Neural Boost Chip",
       "description": "Enhances cognitive processing.",
       "weight": 0.01,
       "size": "Tiny",
       "legality": "Legal",
       "attributes": "Neural Cyberware; +2 INT.",
       "cost": 3000,
       "type": "cyberware",
       "extraData": {
           "slot": "neural",
           "modifiers": { "INT": 2 }
       }
   }
   ```

#### Adding a Container
**CRITICAL**: Containers need `slot` at the TOP level (not in extraData) AND in extraData!
1. **Add to `items.json`**:
   ```json
   {
       "id": "102",
       "name": "tactical_backpack",
       "shortName": "Tactical Backpack",
       "description": "Military-grade storage.",
       "weight": 2.0,
       "size": "Large",
       "legality": "Legal",
       "attributes": "Container; 30kg capacity.",
       "cost": 200,
       "type": "container",
       "slot": "back",
       "extraData": { "capacity": 30 }
   }
   ```

#### Registry & Components
- **No code changes needed** for standard item types (weapon, armor, cyberware, container)
- `PrefabFactory.createItem()` automatically handles all standard types
- If creating a **new component type**, register it in `ComponentRegistry.ts`

### 🤖 Adding a New NPC
NPCs are created via the `PrefabFactory`:
1. **Factory**: Add a case to `PrefabFactory.createNPC`.
   ```typescript
   case 'cyber_merchant':
       entity.addComponent(new NPC(
           "Cyber Merchant",
           ["Best deals in the sprawl!", "Need a neural upgrade?"],
           "A merchant with more chrome than flesh."
       ));
       entity.addComponent(new CombatStats(100, 10, 20));
       break;
   ```
2. **Spawning**: Add the ID to `getSpawnableNPCs()` in the factory.
3. **World Gen**: Use `this.spawnNPC(x, y, type)` in `WorldGenerator.ts`.

### ⌨️ Adding a New Command
Commands are registered in the `CommandRegistry`:
1. **Interface**: Commands must implement the `Command` interface.
2. **Registration**: Add to `server/src/index.ts`.
   ```typescript
   commandRegistry.register({
       name: 'shout',
       aliases: ['yell'],
       description: 'Shout a message to the room',
       execute: (ctx) => {
           const msg = ctx.args.join(' ');
           ctx.messageService.info(ctx.socketId, `You shout: ${msg}`);
           // Broadcast logic here...
       }
   });
   ```
3. **Context**: Use `ctx.systems` to access other systems and `ctx.messageService` for all output.
   ```typescript
   // Example: Accessing inventory from a command
   ctx.systems.inventory.handleGet(ctx.socketId, itemName, ctx.engine);
   ```
4. **Special Flags**:
    - `ignoresRoundtime: true`: Allows the command to be executed even if the player is currently in roundtime (e.g., `stop`).

### 💊 Consumables & The 'Use' Command
Consumables are handled by the `InventorySystem.handleUse` method.
1. **Logic**: The system checks the player's hands and equipment (containers) for the item.
2. **Effects**: Effects are hardcoded in `handleUse` based on the item name (e.g., `medkit`, `stimpack`).
3. **Consumption**: Items are removed from the world and inventory using `consumeItem`.

### 📡 Event-Driven Communication
Use the `GameEventBus` to decouple systems:
1. **Define Event**: Add to `GameEventType` and `GameEventPayloads` in `GameEventBus.ts`.
2. **Emit**: `GameEventBus.getInstance().emit(GameEventType.PLAYER_MOVED, { ... })`.
3. **Listen**: Subscribe in a system's constructor:
   ```typescript
   GameEventBus.getInstance().on(GameEventType.PLAYER_MOVED, (payload) => {
       this.onPlayerMoved(payload);
   });
   ```

### 🧪 Testing Framework
Ouroboro uses **Jest** for unit testing:
- **Location**: Tests are located in `**/__tests__/*.test.ts`.
- **Running**: Use `npm test` to run the suite.
- **Mocking**: Use `jest.mock('uuid')` or similar for deterministic tests.
- **Config**: `jest.config.js` handles TypeScript transformation and module mapping.

### 🔍 Implementing Tab Completion
Autocomplete is a two-part system:
1. **Server-side**: `AutocompleteAggregator.ts` gathers valid targets (NPCs, Items, Containers) based on player location/inventory.
2. **Client-side**: `Terminal.tsx` maintains a `COMMANDS` list and cycles through matches on `Tab`.
   - **Adding a Command**: Add the string to the `COMMANDS` array in `Terminal.tsx`.
   - **Adding an Argument**: Update the `handleKeyDown` logic in `Terminal.tsx` to handle specific command argument matching.

### 🗺 Growing the Map
To add a new "Black Market" room:
1. **Layout**: Update `server/src/world/WorldGenerator.ts`.
   ```typescript
   // In createLayout
   layout[y][x] = 8; // 8 = Black Market
   ```
2. **Flavor**: Add to `getRoomFlavor`.
   ```typescript
   case 8:
       return { title: "The Black Market", desc: "A dimly lit basement filled with illegal tech." };
   ```
3. **Logic**: Add spawns in `createRoom`.
   ```typescript
   if (type === 8) {
       this.spawnNPC(x, y, type); // Spawns thugs/dealers
   }
   ```

### 🌐 Cyberspace & The Matrix
The Matrix is implemented as a **Mirror World** with a coordinate offset.
- **Coordinate Offset**: Cyberspace exists at `x + 10000`. Every physical room has a corresponding digital node.
- **Persona**: Use the `IsPersona` component to track the active neural link.
- **Jacking Mechanics**: Managed by `CyberspaceSystem.ts`.
    - `jack_in`: Moves player to offset, sets physical body to `Stasis`, adds `IsPersona`, and emits `cyberspace-state` to the client.
    - `jack_out`: Restores position and stance, removes `IsPersona`.
- **Client Transformation**: When `isMatrixMode` is true, the client applies the `.matrix-mode` CSS class and renders the `MatrixBackground3D` component.
- **ICE**: Digital enemies (ICE) use the `IsICE` and `IsCyberspace` components.

---

### 🧩 Adding a Puzzle
Puzzles follow the **State-Check Pattern**:
1. **Component**: Attach `PuzzleObject` to an entity.
   ```typescript
   entity.addComponent(new PuzzleObject("gravity_puzzle", "up", "down"));
   ```
2. **Interaction**: Add a command handler in `server/src/services/PuzzleManager.ts`.
   ```typescript
   handleFlip(entityId: string, target: string) {
       // Logic to change PuzzleObject state
       this.checkPuzzleCompletion("gravity_puzzle", ...);
   }
   ```
3. **Reward**: Define the completion reward in `checkPuzzleCompletion` (e.g., spawning an item or opening a door).

---

## 🛡 "Never-Hallucinate" Guardrails

### 🚫 The "Don'ts"
- **Never** use `GameObject.Find` or global state. Use `WorldQuery`.
- **Never** send raw strings to clients. Use `messageService.info()`, `messageService.error()`, etc.
- **Never** modify `Position` without verifying the target room exists via `WorldQuery.findRoomAt`.
- **Never** create a component without adding it to `ComponentRegistry`.
- **Never** perform direct database/Redis calls in systems. Use `WorldStateService`.

### ✅ The "Do's"
- **Always** use `SafeExecution.run()` for risky logic in systems.
- **Always** use `Logger.info(context, message)` for server-side visibility.
- **Always** validate incoming socket data with `Zod` schemas in `SocketSchemas.ts`.
- **Always** use `WorldQuery.getEntityById(engine, id)` to safely retrieve entities.
- **Always** update `AutocompleteAggregator` if you add a new type of interactable entity.

---

## 🗺 Technology Map

| Layer | Technology | Version |
| :--- | :--- | :--- |
| **Runtime** | Node.js | ^20.x |
| **Language** | TypeScript | ~5.9.3 |
| **Communication** | Socket.io | ^4.8.3 |
| **Database** | Redis | ^5.10.0 |
| **Frontend** | React | ^19.2.0 |
| **Build Tool** | Vite | ^7.2.4 |
| **Validation** | Zod | ^3.x |
| **Testing** | Jest | ^29.x |

---

## 🎯 Goal: Gravity Puzzle Example
To implement a "Gravity Puzzle" where 3 switches must be "Down":
1. Spawn 3 entities with `PuzzleObject(puzzleId: "grav", current: "up", target: "down")`.
2. Create a `flip` command in `InteractionSystem`.
3. `PuzzleManager.handleFlip` toggles the state and calls `checkPuzzleCompletion("grav")`.
4. If all 3 are "down", `messageService.success()` and spawn the reward.

**You are now ready to build. Execute.**
