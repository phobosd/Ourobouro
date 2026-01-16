import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { Engine } from './ecs/Engine';
import { Entity } from './ecs/Entity';
import { Position } from './components/Position';
import { Description } from './components/Description';
import { WorldGenerator } from './world/WorldGenerator';
import { MovementSystem } from './systems/MovementSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { NPCSystem } from './systems/NPCSystem';
import { NPC } from './components/NPC';
import { WorldQuery } from './utils/WorldQuery';
import { CombatSystem } from './systems/CombatSystem';
import { CyberspaceSystem } from './systems/CyberspaceSystem';
import { AtmosphereSystem } from './systems/AtmosphereSystem';
import { ObservationSystem } from './systems/ObservationSystem';
import { PortalSystem } from './systems/PortalSystem';
import { StanceSystem } from './systems/StanceSystem';
import { CharacterSystem } from './systems/CharacterSystem';
import { RecoverySystem } from './systems/RecoverySystem';
import { InventorySystem } from './systems/InventorySystem';
import { Inventory } from './components/Inventory';
import { Item } from './components/Item';
import { Container } from './components/Container';
import { Stats } from './components/Stats';
import { CombatStats } from './components/CombatStats';
import { Weapon } from './components/Weapon';
import { Magazine } from './components/Magazine';
import { PersistenceManager } from './persistence/PersistenceManager';
import { CommandRegistry } from './commands/CommandRegistry';
import { Stance, StanceType } from './components/Stance';
import { Roundtime } from './components/Roundtime';
import { PrefabFactory } from './factories/PrefabFactory';
import { PlayerFactory } from './factories/PlayerFactory';
import { ItemRegistry } from './services/ItemRegistry';
import { RoomRegistry } from './services/RoomRegistry';
import { Logger } from './utils/Logger';
import { Credits } from './components/Credits';
import { WorldStateService } from './services/WorldStateService';
import { AutocompleteAggregator } from './services/AutocompleteAggregator';
import { MessageService } from './services/MessageService';
import { DungeonService } from './services/DungeonService';
import { CommandSchema, CombatResultSchema, TerminalBuySchema } from './schemas/SocketSchemas';
import { EngagementTier } from './types/CombatTypes';
import { CombatBuffer, CombatActionType } from './components/CombatBuffer';
import { Momentum } from './components/Momentum';
import { WorldDirector } from './worldDirector/Director';
import { GuardrailService } from './services/GuardrailService';
import { SnapshotService } from './services/SnapshotService';
import { PublisherService } from './services/PublisherService';
import { HealthDescriptor } from './utils/HealthDescriptor';
import { NPCRegistry } from './services/NPCRegistry';

import { registerMovementCommands } from './commands/MovementCommands';
import { registerCombatCommands } from './commands/CombatCommands';
import { registerInteractionCommands } from './commands/InteractionCommands';
import { registerAdminCommands } from './commands/AdminCommands';
import { registerCharacterCommands } from './commands/CharacterCommands';

const ALL_STATS = ['STR', 'CON', 'AGI', 'CHA', 'HP', 'MAXHP', 'ATTACK', 'DEFENSE'];
const ALL_SKILLS = [
    'Hacking',
    'Stealth',
    'Marksmanship (Light)',
    'Marksmanship (Medium)',
    'Marksmanship (Heavy)'
];


// Initialize ItemRegistry
ItemRegistry.getInstance();

const app = express();
app.use(cors());
app.use('/assets', express.static(path.join(process.cwd(), '../client/public/assets')));
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Console Interceptor for Admin Dashboard
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

function broadcastLog(type: 'info' | 'warn' | 'error' | 'success', message: string, ...args: any[]) {
    // Convert args to string if possible for display
    const formattedArgs = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return '[Circular/Object]';
            }
        }
        return arg;
    }).join(' ');

    const fullMessage = `${message} ${formattedArgs}`.trim();

    // Emit to admin namespace
    io.of('/admin').emit('server:console_output', {
        timestamp: Date.now(),
        type,
        message: fullMessage
    });
}

console.log = (message?: any, ...optionalParams: any[]) => {
    originalLog(message, ...optionalParams);
    broadcastLog('info', message, ...optionalParams);
};

console.error = (message?: any, ...optionalParams: any[]) => {
    originalError(message, ...optionalParams);
    broadcastLog('error', message, ...optionalParams);
};

console.warn = (message?: any, ...optionalParams: any[]) => {
    originalWarn(message, ...optionalParams);
    broadcastLog('warn', message, ...optionalParams);
};

console.info = (message?: any, ...optionalParams: any[]) => {
    originalInfo(message, ...optionalParams);
    broadcastLog('info', message, ...optionalParams);
};

// ECS Setup
const engine = new Engine();

// Initialize Services
const guardrails = new GuardrailService();
const snapshots = new SnapshotService();
const publisher = new PublisherService();
const director = new WorldDirector(io, guardrails, snapshots, publisher, engine);
const messageService = new MessageService(io);
const dungeonService = DungeonService.getInstance(engine, messageService);
const movementSystem = new MovementSystem(io, messageService);
const interactionSystem = new InteractionSystem(io);
const inventorySystem = new InventorySystem(io);
const npcSystem = new NPCSystem(io, messageService, director.getLLM());
const combatSystem = new CombatSystem(engine, io, messageService);
const cyberspaceSystem = new CyberspaceSystem(io, messageService);
const atmosphereSystem = new AtmosphereSystem(messageService);
const observationSystem = new ObservationSystem(io);
const portalSystem = new PortalSystem(io, director);
const stanceSystem = new StanceSystem(io);
const characterSystem = new CharacterSystem(io);
const recoverySystem = new RecoverySystem();

engine.addSystem(movementSystem);
engine.addSystem(interactionSystem);
engine.addSystem(inventorySystem);
engine.addSystem(npcSystem);
engine.addSystem(combatSystem);
engine.addSystem(cyberspaceSystem);
engine.addSystem(atmosphereSystem);
engine.addSystem(observationSystem);
engine.addSystem(portalSystem);
engine.addSystem(stanceSystem);
engine.addSystem(characterSystem);
engine.addSystem(recoverySystem);

movementSystem.setObservationSystem(observationSystem);
npcSystem.setCombatSystem(combatSystem);

// Command Registry Setup
const commandRegistry = new CommandRegistry();

// Register Commands
registerMovementCommands(commandRegistry);
registerCombatCommands(commandRegistry);
registerInteractionCommands(commandRegistry);
registerAdminCommands(commandRegistry);
registerCharacterCommands(commandRegistry);

commandRegistry.register({
    name: 'help',
    aliases: ['?'],
    description: 'List all available commands',
    execute: (ctx) => {
        const helpText = commandRegistry.getHelp();
        ctx.messageService.info(ctx.socketId, helpText);
    },
    ignoresRoundtime: true
});

// Persistence Setup
const persistence = new PersistenceManager();
persistence.connect();
const worldState = new WorldStateService(persistence);

// Generate World
const worldGen = new WorldGenerator(engine, 20, 20);
worldGen.generate();
engine.update(0); // Force spatial reindex so we can detect existing rooms

// Load and Spawn Generated Expansions
const roomRegistry = RoomRegistry.getInstance();
const generatedRooms = roomRegistry.getAllRooms();
if (generatedRooms.length > 0) {
    Logger.info('Startup', `Spawning ${generatedRooms.length} generated rooms...`);
    for (const roomDef of generatedRooms) {
        // Check if room already exists to avoid duplication
        const existingRoom = WorldQuery.findRoomAt(engine, roomDef.coordinates.x, roomDef.coordinates.y);
        if (!existingRoom) {
            const roomEntity = PrefabFactory.createRoom(roomDef.id);
            if (roomEntity) {
                engine.addEntity(roomEntity);
            }
        }
    }
}

// Game Loop
const TICK_RATE = 10; // 10 ticks per second
const TICK_MS = 1000 / TICK_RATE;
let lastSaveTime = Date.now();

setInterval(() => {
    engine.update(TICK_MS);

    // Broadcast state to clients (Simplified for now)
    io.emit('tick', { timestamp: Date.now() });

    // Auto-save world state
    const SAVE_INTERVAL = 60000; // Save every minute
    if (Date.now() - lastSaveTime > SAVE_INTERVAL) {
        lastSaveTime = Date.now();
        const entitiesToSave = Array.from(engine.getEntities().values()).map(e => e.toJSON());
        persistence.saveWorldState(entitiesToSave).catch(err => {
            Logger.error('Persistence', 'Failed to auto-save world state:', err);
        });
        Logger.info('Persistence', `Auto-saved ${entitiesToSave.length} entities.`);
    }

    // Send health updates to all connected players
    for (const [id, entity] of engine.getEntities()) {
        const combatStats = entity.getComponent(CombatStats);
        const stance = entity.getComponent(Stance);
        const momentum = entity.getComponent(Momentum);

        if (combatStats) {
            const rt = entity.getComponent(Roundtime) as Roundtime | undefined;
            const stats = entity.getComponent(Stats);
            const con = stats?.attributes.get('CON')?.value || 10;

            const inventory = entity.getComponent(Inventory);

            const leftHandItem = inventory?.leftHand ? WorldQuery.getEntityById(engine, inventory.leftHand) : null;
            const leftHandName = leftHandItem?.getComponent(Item)?.name || 'Empty';
            const leftHandItemComp = leftHandItem?.getComponent(Item);
            const leftHandWeapon = leftHandItem?.getComponent(Weapon);

            const rightHandItem = inventory?.rightHand ? WorldQuery.getEntityById(engine, inventory.rightHand) : null;
            const rightHandName = rightHandItem?.getComponent(Item)?.name || 'Empty';
            const rightHandItemComp = rightHandItem?.getComponent(Item);
            const rightHandWeapon = rightHandItem?.getComponent(Weapon);

            const weaponName = rightHandWeapon?.name.toLowerCase() || '';
            const hasKatana = weaponName.includes('katana') ||
                weaponName.includes('kitana') ||
                weaponName.includes('samurai sword') || false;

            io.to(id).emit('stats-update', {
                hp: combatStats.hp,
                maxHp: combatStats.maxHp,
                stance: stance?.current || 'standing',
                roundtime: rt?.secondsRemaining || 0,
                maxRoundtime: rt?.totalSeconds || 0,
                balance: combatStats.balance,
                fatigue: combatStats.fatigue,
                maxFatigue: con * 10,
                engagement: combatStats.engagementTier,
                momentum: momentum?.current || 0,
                hasKatana,
                leftHand: leftHandName,
                rightHand: rightHandName,
                leftHandDetails: leftHandItemComp ? {
                    name: leftHandItemComp.name,
                    description: leftHandItemComp.description,
                    weight: leftHandItemComp.weight,
                    attributes: leftHandItemComp.attributes,
                    rarity: leftHandItemComp.rarity,
                    damage: leftHandWeapon?.damage,
                    range: leftHandWeapon?.range,
                    ammo: (leftHandWeapon && leftHandWeapon.range > 0 && leftHandWeapon.magSize > 0) ? `${leftHandWeapon.currentAmmo}/${leftHandWeapon.magSize}` : undefined
                } : null,
                rightHandDetails: rightHandItemComp ? {
                    name: rightHandItemComp.name,
                    description: rightHandItemComp.description,
                    weight: rightHandItemComp.weight,
                    attributes: rightHandItemComp.attributes,
                    rarity: rightHandItemComp.rarity,
                    damage: rightHandWeapon?.damage,
                    range: rightHandWeapon?.range,
                    ammo: (rightHandWeapon && rightHandWeapon.range > 0 && rightHandWeapon.magSize > 0) ? `${rightHandWeapon.currentAmmo}/${rightHandWeapon.magSize}` : undefined
                } : null,
                evasion: combatStats.evasion,
                parry: combatStats.parry,
                shield: combatStats.shield,
                aggression: combatStats.aggression
            });
        }

        // Momentum Management
        if (momentum) {
            let inCombat = combatStats && combatStats.engagementTier !== EngagementTier.DISENGAGED;

            if (!inCombat) {
                // Check if any NPC is targeting us in the same room
                const pos = entity.getComponent(Position);
                if (pos) {
                    const hostiles = engine.getEntitiesWithComponent(NPC).filter(npc => {
                        const npcStats = npc.getComponent(CombatStats);
                        const npcPos = npc.getComponent(Position);
                        return npcStats?.targetId === id && npcPos?.x === pos.x && npcPos?.y === pos.y;
                    });
                    if (hostiles.length > 0) {
                        inCombat = true;
                    }
                }
            }

            if (inCombat) {
                // In combat: No decay
            } else {
                // Out of combat: Reset
                if (momentum.current > 0) {
                    momentum.reset();
                    messageService.info(id, "<error>[MOMENTUM] Your combat flow dissipates as the threat fades.</error>");
                }
            }
        }
    }

    // Auto-save every 30 seconds
    if (Date.now() - lastSaveTime > 30000) {
        worldState.saveAllEntities(Array.from(engine.getEntities().values()));
        Logger.info('Persistence', 'World saved to Redis');
        lastSaveTime = Date.now();
    }
}, TICK_MS);

io.on('connection', (socket) => {
    Logger.info('Network', `User connected: ${socket.id}`);

    // Send Autocomplete Data
    socket.emit('autocomplete-data', {
        spawnables: [...PrefabFactory.getSpawnableItems(), ...PrefabFactory.getSpawnableNPCs()],
        stats: ALL_STATS,
        skills: ALL_SKILLS
    });

    // Create player entity using Factory
    const player = PlayerFactory.createPlayer(socket.id, engine);

    // Send initial autocomplete data
    const playerPos = player.getComponent(Position)!;
    const roomAuto = AutocompleteAggregator.getRoomAutocomplete(playerPos, engine);
    socket.emit('autocomplete-update', roomAuto);
    const invAuto = AutocompleteAggregator.getInventoryAutocomplete(player, engine);
    socket.emit('autocomplete-update', invAuto);

    // Initial Look
    observationSystem.handleLook(socket.id, engine);

    // Check for aggressive NPCs in the spawn room
    const spawnPos = player.getComponent(Position)!;
    const npcsInRoom = WorldQuery.findNPCsAt(engine, spawnPos.x, spawnPos.y);
    for (const npc of npcsInRoom) {
        const npcComp = npc.getComponent(NPC);
        const npcCombat = npc.getComponent(CombatStats);

        // If NPC is aggressive and doesn't have a target, make it detect the player
        if (npcComp?.isAggressive && npcCombat && !npcCombat.targetId) {
            npcCombat.isHostile = true;
            npcCombat.targetId = socket.id;
            npcCombat.engagementTier = EngagementTier.DISENGAGED; // Start at disengaged
            console.log(`[Connection] ${npcComp.typeName} (${npc.id}) detected new player ${socket.id} on spawn`);
            messageService.combat(socket.id, `<enemy>${npcComp.typeName} notices you and prepares to attack!</enemy>`);
        }
    }

    socket.on('command', (cmd: string) => {
        const result = CommandSchema.safeParse(cmd);
        if (!result.success) {
            Logger.warn('Network', `Invalid command received from ${socket.id}: ${cmd}`);
            return;
        }

        commandRegistry.execute(result.data, {
            socketId: socket.id,
            args: [],
            io: io,
            engine: engine,
            systems: {
                movement: movementSystem,
                interaction: interactionSystem,
                inventory: inventorySystem,
                npc: npcSystem,
                combat: combatSystem,
                cyberspace: cyberspaceSystem,
                atmosphere: atmosphereSystem,
                observation: observationSystem,
                portal: portalSystem,
                stance: stanceSystem,
                character: characterSystem
            },
            messageService: messageService
        });
    });

    socket.on('combat-result', (data: any) => {
        const result = CombatResultSchema.safeParse(data);
        if (!result.success) {
            Logger.warn('Network', `Invalid combat-result received from ${socket.id}`, result.error);
            return;
        }
        combatSystem.handleSyncResult(socket.id, result.data.targetId, result.data.hitType, engine);
    });

    socket.on('terminal-buy', (data: any) => {
        const result = TerminalBuySchema.safeParse(data);
        if (!result.success) {
            Logger.warn('Network', `Invalid terminal-buy received from ${socket.id}`, result.error);
            return;
        }
        interactionSystem.handleTerminalBuy(socket.id, engine, result.data.itemName, result.data.cost);
    });

    socket.on('get-item-details', (request: any, callback: (data: any) => void) => {
        let itemName = '';
        let itemId = '';

        if (typeof request === 'string') {
            itemName = request;
        } else {
            itemName = request.name;
            itemId = request.id;
        }

        console.log(`[Server] get-item-details requested for: "${itemName}" (ID: ${itemId})`);

        let item: any = null;

        // 1. Try to find by Entity ID first (if provided)
        if (itemId) {
            const entity = engine.getEntity(itemId);
            if (entity) {
                const itemComp = entity.getComponent(Item);
                if (itemComp) {
                    const template = ItemRegistry.getInstance().getItem(itemComp.name) ||
                        ItemRegistry.getInstance().getAllItems().find(i => i.name === itemComp.name);

                    item = {
                        name: itemComp.name,
                        description: itemComp.description || template?.description || "No description.",
                        weight: itemComp.weight,
                        rarity: itemComp.rarity || template?.rarity,
                        extraData: {
                            damage: (entity.getComponent(Weapon) as any)?.damage || template?.extraData?.damage,
                            range: (entity.getComponent(Weapon) as any)?.range || template?.extraData?.range,
                            magSize: template?.extraData?.magSize,
                            currentAmmo: (entity.getComponent(Weapon) as any)?.currentAmmo || template?.extraData?.currentAmmo,
                            hasAmmo: template?.extraData?.magSize > 0 && template?.extraData?.range > 0
                        },
                        attributes: template?.attributes
                    };
                }
            }
        }

        // 2. Fallback to Registry Lookup by Name
        if (!item) {
            item = ItemRegistry.getInstance().getItem(itemName);
            if (!item) {
                const allItems = ItemRegistry.getInstance().getAllItems();
                item = allItems.find(i => i.name.toLowerCase() === itemName.toLowerCase() || i.shortName.toLowerCase() === itemName.toLowerCase());
            }
        }

        if (item) {
            callback({
                name: item.name,
                description: item.description,
                damage: item.extraData?.damage,
                range: item.extraData?.range,
                ammo: (item.extraData?.magSize > 0 && item.extraData?.range > 0) ? `${item.extraData.currentAmmo || item.extraData.magSize}/${item.extraData.magSize}` : undefined,
                weight: item.weight,
                attributes: item.attributes,
                rarity: item.rarity
            });
        } else {
            callback(null);
        }
    });

    socket.on('get-npc-details', (request: { id?: string, name: string }, callback) => {
        let npcName = request.name;
        let npcId = request.id;

        let npcEntity: Entity | undefined;

        if (npcId) {
            npcEntity = engine.getEntity(npcId);
        }

        if (!npcEntity) {
            const player = engine.getEntity(socket.id);
            if (player) {
                const playerPos = player.getComponent(Position);
                if (playerPos) {
                    const npcsInRoom = WorldQuery.findNPCsAt(engine, playerPos.x, playerPos.y);
                    npcEntity = npcsInRoom.find(n => {
                        const npcComp = n.getComponent(NPC);
                        return npcComp && npcComp.typeName.toLowerCase() === npcName.toLowerCase();
                    });
                }
            }
        }

        if (npcEntity) {
            const npcComp = npcEntity.getComponent(NPC);
            const combatStats = npcEntity.getComponent(CombatStats);
            const inventory = npcEntity.getComponent(Inventory);

            const details: any = {
                name: npcComp?.typeName || "Unknown",
                description: npcComp?.description || "No description available.",
                isHostile: combatStats?.isHostile || false,
                health: combatStats ? HealthDescriptor.getStatusDescriptor(combatStats.hp, combatStats.maxHp) : "Unknown",
                status: combatStats?.isHostile ? "Hostile" : "Neutral"
            };

            if (inventory) {
                const equipment: string[] = [];
                if (inventory.rightHand) {
                    const item = WorldQuery.getEntityById(engine, inventory.rightHand);
                    if (item) equipment.push(`Right Hand: ${item.getComponent(Item)?.name}`);
                }
                if (inventory.leftHand) {
                    const item = WorldQuery.getEntityById(engine, inventory.leftHand);
                    if (item) equipment.push(`Left Hand: ${item.getComponent(Item)?.name}`);
                }
                if (equipment.length > 0) {
                    details.equipment = equipment;
                }
            }

            callback(details);
        } else {
            callback(null);
        }
    });

    socket.on('disconnect', () => {
        Logger.info('Network', `User disconnected: ${socket.id}`);
        engine.removeEntity(socket.id);
    });
});

// API Routes
app.get('/api/llm/balance/:profileId', async (req, res) => {
    try {
        const profileId = req.params.profileId;
        const config = director.guardrails.getConfig();
        const profile = Object.values(config.llmProfiles).find(p => p.id === profileId);

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const balanceInfo = await director.llm.getProviderBalance(profile);
        res.json(balanceInfo);
    } catch (error) {
        Logger.error('API', `Failed to fetch balance: ${error}`);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    Logger.info('Server', `Game Server running on port ${PORT}`);
    Logger.info('Server', 'Forcing registry reload...');
    NPCRegistry.getInstance().reloadGeneratedNPCs();
    ItemRegistry.getInstance().reloadGeneratedItems();
});