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
import { IEngine } from './ecs/IEngine';
import { PortalSystem } from './systems/PortalSystem';
import { StanceSystem } from './systems/StanceSystem';
import { CharacterSystem } from './systems/CharacterSystem';
import { RecoverySystem } from './systems/RecoverySystem';
import { HeatSystem } from './systems/HeatSystem';
import { GameEventBus, GameEventType } from './utils/GameEventBus';

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
import { HealthDescriptor } from './utils/HealthDescriptor';
import { NPCRegistry } from './services/NPCRegistry';
import { Atmosphere } from './components/Atmosphere';
import { Visuals } from './components/Visuals';
import { Role } from './components/Role';
import { Momentum } from './components/Momentum';
import { Reputation } from './components/Reputation';
import { Heat } from './components/Heat';
import { Humanity } from './components/Humanity';
import { WorldDirector } from './worldDirector/Director';
import { GuardrailService } from './services/GuardrailService';
import { SnapshotService } from './services/SnapshotService';
import { PublisherService } from './services/PublisherService';

import { registerMovementCommands } from './commands/MovementCommands';
import { registerCombatCommands } from './commands/CombatCommands';
import { registerInteractionCommands } from './commands/InteractionCommands';
import { registerAdminCommands } from './commands/AdminCommands';
import { registerCharacterCommands } from './commands/CharacterCommands';
import { registerSocialCommands } from './commands/SocialCommands';
import { registerEmoteCommands } from './commands/EmoteCommands';
import { AuthService } from './services/AuthService';
import { CharacterService, ARCHETYPES } from './services/CharacterService';
import { DatabaseService } from './services/DatabaseService';
import { RateLimiter } from './services/RateLimiter';


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

let isBroadcasting = false;
function broadcastLog(type: 'info' | 'warn' | 'error' | 'success', message: string, ...args: any[]) {
    if (isBroadcasting) return;
    isBroadcasting = true;
    try {
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
    } catch (err) {
        // Fallback to original log if broadcast fails
        originalError('Broadcast error:', err);
    } finally {
        isBroadcasting = false;
    }
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
console.log('[DEBUG] WorldDirector initialized');
const messageService = new MessageService(io);

// Persistence Setup
const persistence = new PersistenceManager();
persistence.connect();
const worldState = new WorldStateService(persistence);

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
const characterSystem = new CharacterSystem(io, worldState);
const recoverySystem = new RecoverySystem();
const heatSystem = new HeatSystem(messageService);
const rateLimiter = new RateLimiter();

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
engine.addSystem(heatSystem);

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
registerSocialCommands(commandRegistry);
registerEmoteCommands(commandRegistry);


commandRegistry.register({
    name: 'help',
    aliases: ['?'],
    description: 'List all available commands or search the user guide',
    execute: (ctx) => {
        const searchTerm = ctx.args.join(' ').toLowerCase();

        if (!searchTerm) {
            // No search term - show command list
            const helpText = commandRegistry.getHelp();
            ctx.messageService.info(ctx.socketId, helpText);
            return;
        }

        // Search the USERS_GUIDE.md
        const fs = require('fs');
        const path = require('path');
        const guidePath = path.join(process.cwd(), '..', 'docs', 'USERS_GUIDE.md');

        // Function to clean markdown formatting
        const cleanMarkdown = (text: string): string => {
            return text
                .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***text***
                .replace(/\*\*(.+?)\*\*/g, '$1')      // **text**
                .replace(/\*(.+?)\*/g, '$1')          // *text*
                .replace(/__(.+?)__/g, '$1')          // __text__
                .replace(/_(.+?)_/g, '$1')            // _text_
                .replace(/`([^`]+)`/g, '$1')          // `code`
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
                .replace(/<[^>]+>/g, '')              // HTML tags
                .replace(/\|/g, ' ')                  // Table pipes
                .replace(/:-+/g, '')                  // Table separators
                .trim();
        };

        try {
            const guideContent = fs.readFileSync(guidePath, 'utf-8');
            const lines = guideContent.split('\n');

            const results: string[] = [];
            let currentSection = '';
            let inRelevantSection = false;
            let sectionContent: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Track sections (## headers)
                if (line.startsWith('## ')) {
                    // Save previous section if it was relevant
                    if (inRelevantSection && sectionContent.length > 0) {
                        results.push(`<title>${currentSection}</title>`);
                        const cleanedContent = sectionContent
                            .map(l => cleanMarkdown(l))
                            .filter(l => l.length > 0)
                            .slice(0, 30);
                        results.push(...cleanedContent);
                        if (sectionContent.length > 30) {
                            results.push('<info>... (truncated, use "read guide" for full text)</info>');
                        }
                        results.push('');
                    }

                    currentSection = line.replace('## ', '').trim();
                    sectionContent = [];
                    inRelevantSection = currentSection.toLowerCase().includes(searchTerm);
                }

                // Check if line contains search term
                if (line.toLowerCase().includes(searchTerm)) {
                    inRelevantSection = true;
                }

                // Collect content if in relevant section
                if (inRelevantSection && !line.startsWith('#') && !line.match(/^[\s|:-]+$/)) {
                    sectionContent.push(line);
                }
            }

            // Add last section if relevant
            if (inRelevantSection && sectionContent.length > 0) {
                results.push(`<title>${currentSection}</title>`);
                const cleanedContent = sectionContent
                    .map(l => cleanMarkdown(l))
                    .filter(l => l.length > 0)
                    .slice(0, 30);
                results.push(...cleanedContent);
                if (sectionContent.length > 30) {
                    results.push('<info>... (truncated, use "read guide" for full text)</info>');
                }
            }

            if (results.length === 0) {
                ctx.messageService.info(ctx.socketId, `<info>No results found for "${searchTerm}". Try a different search term.</info>`);
            } else {
                ctx.messageService.info(ctx.socketId, `<title>[ Search Results for "${searchTerm}" ]</title>\n\n` + results.join('\n'));
            }
        } catch (error) {
            Logger.error('Help', 'Failed to read USERS_GUIDE.md', error);
            ctx.messageService.error(ctx.socketId, 'Failed to search the user guide.');
        }
    },
    ignoresRoundtime: true
});

// Initialize Auth & Character Services
const authService = AuthService.getInstance();
const characterService = CharacterService.getInstance();


const PORT = process.env.PORT || 3000;

// Generate World or Load from Persistence
async function startServer() {
    let worldGen: WorldGenerator;

    if (persistence.hasEntities()) {
        Logger.info('Startup', 'Persistent world entities found. Loading world state...');
        await worldState.loadWorldState(engine);

        // Regenerate Matrix world (not persisted)
        Logger.info('Startup', 'Regenerating Matrix mirror world...');
        worldGen = new WorldGenerator(engine, 20, 20);
        worldGen.regenerateMatrixOnly();
    } else {
        Logger.info('Startup', 'No persistent entities found. Generating new world...');
        worldGen = new WorldGenerator(engine, 20, 20);
        worldGen.generate();
    }
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

    console.log('[DEBUG] About to start listening on port', PORT);

    httpServer.listen(PORT, () => {
        Logger.info('Server', `Game Server running on port ${PORT}`);
    });
}

// Game Loop
const TICK_RATE = 10; // 10 ticks per second
const TICK_MS = 1000 / TICK_RATE;
let lastSaveTime = Date.now();
let lastWorldSaveTime = Date.now();
let lastStatsUpdateTime = Date.now();

setInterval(() => {
    try {
        engine.update(TICK_MS);

        // Periodically save characters (every 30 seconds)
        if (Date.now() - lastSaveTime > 30000) {
            const players = engine.getEntitiesWithComponent(Role);
            for (const player of players) {
                const charData = characterService.getCharacterBySocketId(player.id);
                if (charData) {
                    // Serialize components
                    const components: any = {};
                    player.components.forEach((comp, type) => {
                        components[type] = comp.toJSON();
                    });
                    characterService.saveCharacter(charData.id, {
                        archetype: charData.archetype,
                        components
                    });
                }
            }
            lastSaveTime = Date.now();
        }

        // Periodically save world state (every 60 seconds)
        if (Date.now() - lastWorldSaveTime > 60000) {
            const allEntities = Array.from(engine.getEntities().values()).filter(e => {
                if (e.hasComponent(Role)) return false;
                const pos = e.getComponent(Position);
                // Don't save dungeon entities (x >= 2000)
                if (pos && pos.x >= 2000) return false;
                return true;
            });
            worldState.saveAllEntities(allEntities);
            lastWorldSaveTime = Date.now();
        }

        // Periodically update player stats (every 1 second)
        if (Date.now() - lastStatsUpdateTime > 1000) {
            const players = engine.getEntitiesWithComponent(Role);
            for (const player of players) {
                const socket = io.sockets.sockets.get(player.id);
                if (socket) {
                    emitPlayerStats(socket, player, engine);
                }
            }
            lastStatsUpdateTime = Date.now();
        }
    } catch (error) {
        Logger.error('GameLoop', 'Error in game loop:', error);
    }
}, TICK_MS);

console.log('[DEBUG] Game loop initialized');

console.log('[DEBUG] Setting up connection handler');

function emitPlayerStats(socket: any, player: Entity, engine: IEngine) {
    const combatStats = player.getComponent(CombatStats);
    const stance = player.getComponent(Stance);
    const rt = player.getComponent(Roundtime);
    const credits = player.getComponent(Credits);
    const reputation = player.getComponent(Reputation);
    const heat = player.getComponent(Heat);
    const humanity = player.getComponent(Humanity);
    const inventory = player.getComponent(Inventory);
    const momentum = player.getComponent(Momentum);

    if (!combatStats) return;

    const getHandContent = (handId: string | null) => {
        if (!handId) return null;
        const item = engine.getEntity(handId);
        return item?.getComponent(Item)?.name || null;
    };

    const getHandDetails = (handId: string | null) => {
        if (!handId) return null;
        const entity = engine.getEntity(handId);
        if (!entity) return null;
        const itemComp = entity.getComponent(Item);
        if (!itemComp) return null;

        const template = ItemRegistry.getInstance().getItem(itemComp.name) ||
            ItemRegistry.getInstance().getAllItems().find(i => i.name === itemComp.name);

        return {
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
    };

    const stats = {
        hp: combatStats.hp,
        maxHp: combatStats.maxHp,
        stance: stance?.current || 'standing',
        roundtime: rt?.secondsRemaining || 0,
        maxRoundtime: rt?.totalSeconds || 0,
        balance: combatStats.balance || 1.0,
        fatigue: combatStats.fatigue || 0,
        maxFatigue: 100,
        engagement: combatStats.engagementTier || 'disengaged',
        momentum: momentum?.current || 0,
        hasKatana: false,
        leftHand: getHandContent(inventory?.leftHand || null),
        rightHand: getHandContent(inventory?.rightHand || null),
        leftHandDetails: getHandDetails(inventory?.leftHand || null),
        rightHandDetails: getHandDetails(inventory?.rightHand || null),
        evasion: combatStats.evasion,
        parry: combatStats.parry,
        shield: combatStats.shield,
        aggression: combatStats.aggression,
        heat: heat?.value || 0,
        humanity: humanity?.current || 100,
        reputation: reputation?.factions ? Object.fromEntries(reputation.factions) : {}
    };

    // Check for katana
    if (inventory) {
        const checkKatana = (id: string | null) => {
            if (!id) return false;
            const item = engine.getEntity(id);
            return !!item?.getComponent(Item)?.name.toLowerCase().includes('katana');
        };
        stats.hasKatana = !!(checkKatana(inventory.leftHand) || checkKatana(inventory.rightHand));
    }

    socket.emit('stats-update', stats);
}

io.on('connection', (socket) => {
    Logger.info('Network', `User connected: ${socket.id}`);

    // Send Autocomplete Data
    socket.emit('autocomplete-data', {
        spawnables: [...PrefabFactory.getSpawnableItems(), ...PrefabFactory.getSpawnableNPCs()],
        stats: ALL_STATS,
        skills: ALL_SKILLS,
        archetypes: Object.keys(ARCHETYPES)
    });

    // --- AUTHENTICATION EVENTS ---
    socket.on('auth:verify', async (data: { token: string }) => {
        const user = authService.verifyToken(data.token);
        if (user) {
            const character = characterService.getCharacterByUserId(user.id);
            socket.emit('auth:login_result', {
                success: true,
                user,
                token: data.token,
                hasCharacter: !!character
            });
        } else {
            socket.emit('auth:login_result', { success: false, message: 'Invalid token' });
        }
    });

    socket.on('auth:register', async (data: any) => {
        const result = await authService.register(data.username, data.password);
        if (result.success && result.user && data.archetype) {
            // Automatically create character for the new user
            await characterService.createCharacter(result.user.id, data.username, data.archetype);
            Logger.info('Auth', `Created citizen and character for: ${data.username}`);
        }
        socket.emit('auth:register_result', result);
    });

    socket.on('auth:login', async (data: any) => {
        Logger.info('Auth', `Login attempt for user: ${data.username}`);
        const result = await authService.login(data.username, data.password);
        if (result.success && result.user) {
            const character = characterService.getCharacterByUserId(result.user.id);
            socket.emit('auth:login_result', { ...result, hasCharacter: !!character });
        } else {
            socket.emit('auth:login_result', result);
        }
    });

    socket.on('char:create', async (data: any) => {
        // Verify token first
        const user = authService.verifyToken(data.token);
        if (!user) return socket.emit('char:create_result', { success: false, message: 'Unauthorized' });

        const result = await characterService.createCharacter(user.id, data.name, data.archetype);
        socket.emit('char:create_result', result);
    });

    socket.on('game:start', async (data: any) => {
        const user = authService.verifyToken(data.token);
        if (!user) return;

        const charData = characterService.getCharacterByUserId(user.id);
        if (!charData) return;

        // Clean up any existing entity for this character (prevents duplicates on refresh)
        const existingEntity = characterService.getActiveEntityByCharId(charData.id, engine);
        if (existingEntity) {
            Logger.info('Character', `Removing stale entity ${existingEntity.id} for character ${charData.name}`);
            characterService.updateNPCTargets(existingEntity.id, socket.id, engine);
            engine.removeEntity(existingEntity.id);
        }

        // Instantiate Player
        const player = characterService.instantiateCharacter(charData, socket.id, engine);
        player.addComponent(new Role(user.role));

        // Join initial room
        const pos = player.getComponent(Position)!;
        socket.join(`room:${pos.x}:${pos.y}`);
        dungeonService?.markVisited(socket.id, pos.x, pos.y);

        // Send initial state
        const roomAuto = AutocompleteAggregator.getRoomAutocomplete(pos, engine);
        socket.emit('autocomplete-update', roomAuto);
        const invAuto = AutocompleteAggregator.getInventoryAutocomplete(player, engine);
        socket.emit('autocomplete-update', invAuto);

        observationSystem.handleLook(socket.id, engine);
        observationSystem.handleMap(socket.id, engine);

        // Initial stats update
        emitPlayerStats(socket, player, engine);

        Logger.info('Game', `Player ${charData.name} (${user.username}) entered the world.`);

        GameEventBus.getInstance().emit(GameEventType.PLAYER_CONNECTED, {
            playerId: socket.id,
            characterId: charData.id,
            username: user.username
        });
    });

    socket.on('command', async (command: string) => {
        const player = engine.getEntity(socket.id);
        if (!player) return;

        try {
            commandRegistry.execute(command, {
                socketId: socket.id,
                args: [], // Will be populated by execute
                io,
                engine,
                messageService,
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
                }
            });
        } catch (error) {
            Logger.error('Command', `Error executing command: ${command}`, error);
            messageService.error(socket.id, "An error occurred while executing that command.");
        }
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
            const visuals = npcEntity.getComponent(Visuals) as Visuals;

            const details: any = {
                name: npcComp?.typeName || "Unknown",
                description: npcComp?.description || "No description available.",
                isHostile: combatStats?.isHostile || false,
                health: combatStats ? HealthDescriptor.getStatusDescriptor(combatStats.hp, combatStats.maxHp) : "Unknown",
                status: combatStats?.isHostile ? "Hostile" : "Neutral",
                portrait: visuals?.portrait
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
        rateLimiter.cleanup(socket.id);
        Logger.info('Network', `User disconnected: ${socket.id}`);

        characterService.removeCharacter(socket.id);

        GameEventBus.getInstance().emit(GameEventType.PLAYER_DISCONNECTED, {
            playerId: socket.id
        });

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
    }
});

app.get('/api/llm/models/:profileId', async (req, res) => {
    try {
        const profileId = req.params.profileId;
        const config = director.guardrails.getConfig();
        const profile = Object.values(config.llmProfiles).find(p => p.id === profileId);

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const models = await director.llm.getAvailableModels(profile);
        res.json({ models });
    } catch (error) {
        Logger.error('API', `Failed to fetch models: ${error}`);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

app.get('/api/llm/samplers/:profileId', async (req, res) => {
    try {
        const profileId = req.params.profileId;
        const config = director.guardrails.getConfig();
        const profile = Object.values(config.llmProfiles).find(p => p.id === profileId);

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const samplers = await director.llm.getAvailableSamplers(profile);
        res.json({ samplers });
    } catch (error) {
        Logger.error('API', `Failed to fetch samplers: ${error}`);
        res.status(500).json({ error: 'Failed to fetch samplers' });
    }
});

startServer().catch(err => {
    Logger.error('Server', 'Failed to start server:', err);
});
