import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

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
import { ItemRegistry } from './services/ItemRegistry';
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
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

import { RecoverySystem } from './systems/RecoverySystem';

// ECS Setup
const engine = new Engine();
const messageService = new MessageService(io);
const dungeonService = DungeonService.getInstance(engine, messageService);
const movementSystem = new MovementSystem(io, messageService);
const interactionSystem = new InteractionSystem(io);
const inventorySystem = new InventorySystem(io);
const npcSystem = new NPCSystem(io, messageService);
const combatSystem = new CombatSystem(engine, io, messageService);
const cyberspaceSystem = new CyberspaceSystem(io, messageService);
const atmosphereSystem = new AtmosphereSystem(messageService);
const observationSystem = new ObservationSystem(io);
const portalSystem = new PortalSystem(io);
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

import { CommandContext } from './commands/CommandRegistry';

const findTarget = (ctx: CommandContext, targetName: string): Entity | undefined => {
    if (!targetName || targetName.toLowerCase() === 'me' || targetName.toLowerCase() === 'self') {
        return ctx.engine.getEntity(ctx.socketId);
    }

    // Get player position
    const player = ctx.engine.getEntity(ctx.socketId);
    if (!player) return undefined;
    const pos = player.getComponent(Position);
    if (!pos) return undefined;

    const ordinalNames = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
    const parts = targetName.toLowerCase().split(' ');
    let ordinal = 1;
    let searchName = targetName;

    if (parts.length > 1) {
        const firstPart = parts[0];
        const index = ordinalNames.indexOf(firstPart);
        if (index !== -1) {
            ordinal = index + 1;
            searchName = parts.slice(1).join(' ');
        } else {
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart);
            if (!isNaN(num)) {
                ordinal = num;
                searchName = parts.slice(0, -1).join(' ');
            }
        }
    }

    // Search for NPCs in the same room
    const npcs = WorldQuery.findNPCsAt(ctx.engine, pos.x, pos.y);
    const matchingNPCs = npcs.filter((n: Entity) => {
        const npcComp = n.getComponent(NPC);
        return npcComp && npcComp.typeName.toLowerCase().includes(searchName.toLowerCase());
    });

    if (matchingNPCs.length >= ordinal) {
        return matchingNPCs[ordinal - 1];
    }

    // Search for other players in the same room
    const entities = ctx.engine.getEntities();
    let playerMatchCount = 0;
    for (const [id, entity] of entities) {
        if (id === ctx.socketId) continue;
        const ePos = entity.getComponent(Position);
        if (ePos && ePos.x === pos.x && ePos.y === pos.y) {
            // Check if it's a player (has Stats but not NPC)
            if (entity.hasComponent(Stats) && !entity.hasComponent(NPC)) {
                if (id.toLowerCase().includes(searchName.toLowerCase())) {
                    playerMatchCount++;
                    if (playerMatchCount === ordinal) return entity;
                }
            }
        }
    }

    // Search globally by ID
    const globalEntity = ctx.engine.getEntity(targetName);
    if (globalEntity) return globalEntity;

    return undefined;
};

const moveAndLook = (ctx: CommandContext, dir: 'n' | 's' | 'e' | 'w') => {
    const player = ctx.engine.getEntity(ctx.socketId);
    const stance = player?.getComponent(Stance);

    if (stance && stance.current !== StanceType.Standing) {
        // Let MovementSystem handle the error message
        ctx.systems.movement.queueMove(ctx.socketId, dir);
        return;
    }

    ctx.systems.movement.queueMove(ctx.socketId, dir);
};

commandRegistry.register({
    name: 'north',
    aliases: ['n'],
    description: 'Move north',
    execute: (ctx) => moveAndLook(ctx, 'n')
});

commandRegistry.register({
    name: 'south',
    aliases: ['s'],
    description: 'Move south',
    execute: (ctx) => moveAndLook(ctx, 's')
});

commandRegistry.register({
    name: 'east',
    aliases: ['e'],
    description: 'Move east',
    execute: (ctx) => moveAndLook(ctx, 'e')
});

commandRegistry.register({
    name: 'west',
    aliases: ['w'],
    description: 'Move west',
    execute: (ctx) => moveAndLook(ctx, 'w')
});

commandRegistry.register({
    name: 'look',
    aliases: ['l', 'la'],
    description: 'Look at the room, an item, or an NPC',
    execute: (ctx) => {
        let target = ctx.args.join(' ');
        if (target.toLowerCase().startsWith('at ')) {
            target = target.substring(3).trim();
        }
        ctx.systems.observation.handleLook(ctx.socketId, ctx.engine, target);
    },
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'map',
    aliases: ['m'],
    description: 'View the area map',
    execute: (ctx) => ctx.systems.observation.handleMap(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'get',
    aliases: ['g', 'take'],
    description: 'Pick up an item',
    execute: (ctx) => ctx.systems.inventory.handleGet(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'drop',
    aliases: ['d'],
    description: 'Drop an item',
    execute: (ctx) => ctx.systems.inventory.handleDrop(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'read',
    aliases: ['scan'],
    description: 'Read a terminal or object',
    execute: (ctx) => ctx.systems.interaction.handleRead(ctx.socketId, ctx.engine, ctx.args.join(' '))
});

commandRegistry.register({
    name: 'enter',
    aliases: ['go'],
    description: 'Enter a door or portal',
    execute: (ctx) => ctx.systems.portal.handleEnter(ctx.socketId, ctx.engine, ctx.args.join(' '))
});

commandRegistry.register({
    name: 'jack_in',
    aliases: ['connect', 'jackin'],
    description: 'Jack into the Matrix',
    execute: (ctx) => ctx.systems.cyberspace.handleJackIn(ctx.socketId, ctx.engine)
});

commandRegistry.register({
    name: 'jack_out',
    aliases: ['disconnect', 'jackout'],
    description: 'Jack out of the Matrix',
    execute: (ctx) => ctx.systems.cyberspace.handleJackOut(ctx.socketId, ctx.engine)
});

commandRegistry.register({
    name: 'inventory',
    aliases: ['inv', 'i'],
    description: 'Check your inventory',
    execute: (ctx) => ctx.systems.inventory.handleInventory(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'glance',
    aliases: ['gl'],
    description: 'Glance at your hands',
    execute: (ctx) => ctx.systems.observation.handleGlance(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'lie',
    aliases: ['rest', 'sleep'],
    description: 'Lie down',
    execute: (ctx) => ctx.systems.stance.handleStanceChange(ctx.socketId, StanceType.Lying, ctx.engine)
});

commandRegistry.register({
    name: 'sit',
    aliases: [],
    description: 'Sit down',
    execute: (ctx) => ctx.systems.stance.handleStanceChange(ctx.socketId, StanceType.Sitting, ctx.engine)
});

commandRegistry.register({
    name: 'stand',
    aliases: ['st'],
    description: 'Stand up',
    execute: (ctx) => ctx.systems.stance.handleStanceChange(ctx.socketId, StanceType.Standing, ctx.engine)
});

commandRegistry.register({
    name: 'stow',
    aliases: ['put'],
    description: 'Put an item in your backpack (Usage: stow <item>)',
    execute: (ctx) => ctx.systems.inventory.handleStow(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'sheet',
    aliases: ['stats'],
    description: 'View your character attributes',
    execute: (ctx) => ctx.systems.character.handleSheet(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'score',
    aliases: ['skills'],
    description: 'View your character skills',
    execute: (ctx) => ctx.systems.character.handleScore(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'swap',
    aliases: ['switch'],
    description: 'Swap items between your hands',
    execute: (ctx) => ctx.systems.inventory.handleSwap(ctx.socketId, ctx.engine)
});

commandRegistry.register({
    name: 'use',
    aliases: ['u'],
    description: 'Use an item from your hands or inventory',
    execute: (ctx) => ctx.systems.inventory.handleUse(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'wear',
    aliases: ['equip'],
    description: 'Wear a piece of clothing or equipment (Usage: wear <item>)',
    execute: (ctx) => ctx.systems.inventory.handleWear(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'remove',
    aliases: ['unequip', 'takeoff'],
    description: 'Remove a piece of clothing or equipment (Usage: remove <item>)',
    execute: (ctx) => ctx.systems.inventory.handleRemove(ctx.socketId, ctx.args.join(' '), ctx.engine)
});

commandRegistry.register({
    name: 'attack',
    aliases: ['kill', 'fight'],
    description: 'Attack a target',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Attack what?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine);
    }
});

commandRegistry.register({
    name: 'punch',
    aliases: [],
    description: 'Punch a target (Brawling)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Punch who?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'punch');
    }
});

commandRegistry.register({
    name: 'jab',
    aliases: [],
    description: 'Jab a target (Brawling)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Jab who?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'jab');
    }
});

commandRegistry.register({
    name: 'headbutt',
    aliases: [],
    description: 'Headbutt a target (Brawling)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Headbutt who?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'headbutt');
    }
});

commandRegistry.register({
    name: 'uppercut',
    aliases: [],
    description: 'Uppercut a target (Brawling)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Uppercut who?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'uppercut');
    }
});

commandRegistry.register({
    name: 'slice',
    aliases: [],
    description: 'Perform a fast, precision strike (Samurai weapons build momentum)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Slice who?');
            return;
        }
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'slice');
    }
});

commandRegistry.register({
    name: 'iaijutsu',
    aliases: ['iai'],
    description: 'Perform a devastating instant strike (Requires 30+ Momentum)',
    execute: (ctx) => {
        const targetName = ctx.args.join(' ');
        if (!targetName) {
            ctx.io.to(ctx.socketId).emit('message', 'Iaijutsu who?');
            return;
        }
        ctx.systems.combat.handleIaijutsu(ctx.socketId, targetName, ctx.engine);
    }
});

commandRegistry.register({
    name: 'reload',
    aliases: ['rel'],
    description: 'Reload your weapon',
    execute: (ctx) => ctx.systems.combat.handleReload(ctx.socketId, ctx.engine)
});

commandRegistry.register({
    name: 'ammo',
    aliases: ['checkammo'],
    description: 'Check ammunition in your weapon',
    execute: (ctx) => ctx.systems.combat.handleCheckAmmo(ctx.socketId, ctx.engine),
    ignoresRoundtime: true
});

const handleBufferAction = (ctx: CommandContext, type: CombatActionType) => {
    const player = ctx.engine.getEntity(ctx.socketId);
    if (!player) return;

    const buffer = player.getComponent(CombatBuffer);
    if (!buffer) {
        ctx.messageService.error(ctx.socketId, "You don't have a combat buffer.");
        return;
    }

    if (!buffer.isBuilding) {
        // Execute immediate action
        const targetName = ctx.args.join(' ');
        switch (type) {
            case CombatActionType.DASH:
                ctx.systems.combat.handleManeuver(ctx.socketId, 'CLOSE', ctx.engine, targetName);
                break;
            case CombatActionType.SLASH:
                ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'slash');
                break;
            case CombatActionType.THRUST:
                ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'thrust');
                break;
            case CombatActionType.PARRY:
                ctx.systems.combat.handleImmediateParry(ctx.socketId, ctx.engine);
                break;
        }
        return;
    }

    if (buffer.isExecuting) {
        ctx.messageService.error(ctx.socketId, "Buffer is currently executing. Wait for completion.");
        return;
    }

    if (buffer.actions.length >= buffer.maxSlots) {
        ctx.messageService.error(ctx.socketId, "Buffer is full. Use 'upload' to execute or wait.");
        return;
    }

    buffer.actions.push({ type });
    ctx.messageService.info(ctx.socketId, `[BUFFER] Added ${type}. (${buffer.actions.length}/${buffer.maxSlots})`);

    // Notify client to update UI
    ctx.io.to(ctx.socketId).emit('buffer-update', {
        actions: buffer.actions,
        maxSlots: buffer.maxSlots,
        isExecuting: buffer.isExecuting,
        isBuilding: buffer.isBuilding
    });
};

commandRegistry.register({
    name: 'sequence',
    aliases: ['seq', 'buffer'],
    description: 'Toggle combat sequence building mode',
    execute: (ctx) => {
        const player = ctx.engine.getEntity(ctx.socketId);
        if (!player) return;
        const buffer = player.getComponent(CombatBuffer);
        if (!buffer) return;

        buffer.isBuilding = !buffer.isBuilding;
        if (buffer.isBuilding) {
            ctx.messageService.success(ctx.socketId, "Sequence Mode ENABLED. Actions will be queued.");
            buffer.actions = []; // Clear on start
        } else {
            ctx.messageService.info(ctx.socketId, "Sequence Mode DISABLED. Actions will execute immediately.");
        }

        // Notify client
        ctx.io.to(ctx.socketId).emit('buffer-update', {
            actions: buffer.actions,
            maxSlots: buffer.maxSlots,
            isExecuting: buffer.isExecuting,
            isBuilding: buffer.isBuilding
        });
    },
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'dash',
    aliases: [],
    description: 'Dash or add DASH to buffer',
    execute: (ctx) => handleBufferAction(ctx, CombatActionType.DASH)
});

commandRegistry.register({
    name: 'slash',
    aliases: [],
    description: 'Slash or add SLASH to buffer',
    execute: (ctx) => handleBufferAction(ctx, CombatActionType.SLASH)
});

commandRegistry.register({
    name: 'parry',
    aliases: [],
    description: 'Parry or add PARRY to buffer',
    execute: (ctx) => handleBufferAction(ctx, CombatActionType.PARRY)
});

commandRegistry.register({
    name: 'thrust',
    aliases: [],
    description: 'Thrust or add THRUST to buffer',
    execute: (ctx) => handleBufferAction(ctx, CombatActionType.THRUST)
});

commandRegistry.register({
    name: 'upload',
    aliases: ['execute', 'run'],
    description: 'Execute the combat buffer',
    execute: (ctx) => {
        const player = ctx.engine.getEntity(ctx.socketId);
        if (!player) return;

        const buffer = player.getComponent(CombatBuffer);
        if (!buffer || buffer.actions.length === 0) {
            ctx.messageService.error(ctx.socketId, "Buffer is empty.");
            return;
        }

        if (buffer.isExecuting) {
            ctx.messageService.error(ctx.socketId, "Buffer is already executing.");
            return;
        }

        ctx.systems.combat.executeBuffer(ctx.socketId, ctx.engine);
    }
});

commandRegistry.register({
    name: 'turn',
    aliases: ['rotate'],
    description: 'Turn an object (Usage: turn <object> <direction>)',
    execute: (ctx) => {
        const args = ctx.args;
        if (args.length < 2) {
            ctx.io.to(ctx.socketId).emit('message', 'Usage: turn <object> <direction>');
            return;
        }
        const direction = args.pop(); // Last arg is direction
        if (!direction) {
            ctx.io.to(ctx.socketId).emit('message', 'Usage: turn <object> <direction>');
            return;
        }
        const targetName = args.join(' '); // Rest is object name
        ctx.systems.interaction.handleTurn(ctx.socketId, ctx.engine, targetName, direction);
    }
});

commandRegistry.register({
    name: 'maneuver',
    aliases: ['man'],
    description: 'Change engagement tier (Usage: maneuver close/withdraw)',
    execute: (ctx) => {
        const dir = ctx.args[0]?.toUpperCase();
        const target = ctx.args.slice(1).join(' '); // Get target name if present
        if (dir === 'CLOSE' || dir === 'WITHDRAW') {
            ctx.systems.combat.handleManeuver(ctx.socketId, dir, ctx.engine, target);
        } else {
            ctx.messageService.info(ctx.socketId, 'Usage: maneuver close/withdraw [target]');
        }
    }
});



commandRegistry.register({
    name: 'advance',
    aliases: ['approach', 'adv'],
    description: 'Automatically advance on a target until close range',
    execute: (ctx) => {
        const target = ctx.args.join(' ');
        ctx.systems.combat.handleAdvance(ctx.socketId, target, ctx.engine);
    }
});

commandRegistry.register({
    name: 'retreat',
    aliases: [],
    description: 'Automatically retreat from a target',
    execute: (ctx) => {
        const target = ctx.args.join(' ');
        ctx.systems.combat.handleRetreat(ctx.socketId, target, ctx.engine);
    }
});

commandRegistry.register({
    name: 'stop',
    aliases: [],
    description: 'Stop any automated actions',
    execute: (ctx) => {
        ctx.systems.combat.handleStop(ctx.socketId, ctx.engine);
    },
    ignoresRoundtime: true
});

commandRegistry.register({
    name: 'hangback',
    aliases: [],
    description: 'Toggle hangback mode to counter enemy advances',
    execute: (ctx) => {
        ctx.systems.combat.handleHangback(ctx.socketId, ctx.engine);
    }
});

commandRegistry.register({
    name: 'flee',
    aliases: [],
    description: 'Attempt to flee from combat (Usage: flee [direction])',
    execute: (ctx) => {
        const direction = ctx.args[0]?.toUpperCase();
        ctx.systems.combat.handleFlee(ctx.socketId, direction, ctx.engine);
    }
});

commandRegistry.register({
    name: 'assess',
    aliases: [],
    description: 'Assess the combat situation',
    execute: (ctx) => {
        ctx.systems.combat.handleAssess(ctx.socketId, ctx.engine);
    }
});

commandRegistry.register({
    name: 'target',
    aliases: [],
    description: 'Set targeting bias (Usage: target <body_part>)',
    execute: (ctx) => {
        const part = ctx.args[0];
        if (part) {
            ctx.systems.combat.handleTarget(ctx.socketId, part, ctx.engine);
        } else {
            ctx.messageService.info(ctx.socketId, 'Usage: target <body_part>');
        }
    }
});

commandRegistry.register({
    name: 'stance',
    aliases: [],
    description: 'Set combat stance (Usage: stance <evasion|parry|shield|offensive|defensive|neutral|custom>)',
    execute: (ctx) => {
        ctx.systems.combat.handleStance(ctx.socketId, ctx.args, ctx.engine);
    }
});

commandRegistry.register({
    name: 'appraise',
    aliases: ['app'],
    description: 'Appraise a target\'s condition (Usage: appraise <target>)',
    execute: (ctx) => {
        const target = ctx.args.join(' ');
        if (target) {
            ctx.systems.combat.handleAppraise(ctx.socketId, target, ctx.engine);
        } else {
            ctx.messageService.info(ctx.socketId, 'Usage: appraise <target>');
        }
    }
});

commandRegistry.register({
    name: 'god',
    aliases: ['admin'],
    description: 'Admin commands (Usage: god <spawn|set-stat|set-skill|view|reset|weather|pacify|registry>)',
    execute: (ctx) => {
        const subCommand = ctx.args[0];
        if (!subCommand) {
            ctx.messageService.info(ctx.socketId, 'Usage: god <spawn> <type>');
            return;
        }

        if (subCommand === 'spawn') {
            const name = ctx.args.slice(1).join(' ');
            if (!name) {
                ctx.messageService.info(ctx.socketId, 'Usage: god spawn <item name | npc name>');
                return;
            }

            // Get player position
            const player = ctx.engine.getEntity(ctx.socketId);
            if (!player) return;
            const pos = player.getComponent(Position);
            if (!pos) return;

            // Try to spawn NPC
            let entity = PrefabFactory.createNPC(name);
            if (entity) {
                entity.addComponent(new Position(pos.x, pos.y));
                ctx.engine.addEntity(entity);
                PrefabFactory.equipNPC(entity, ctx.engine);

                // Immediately detect nearby players for aggressive NPCs
                ctx.systems.npc.onNPCSpawned(entity, ctx.engine);

                ctx.messageService.success(ctx.socketId, `Spawned NPC: ${name}`);

                // Refresh autocomplete for the player
                ctx.systems.observation.refreshAutocomplete(ctx.socketId, ctx.engine);
                return;
            }

            // Try to spawn Item
            entity = PrefabFactory.createItem(name);
            if (entity) {
                entity.addComponent(new Position(pos.x, pos.y));
                ctx.engine.addEntity(entity);
                ctx.messageService.success(ctx.socketId, `Spawned Item: ${name}`);

                // Refresh autocomplete for the player
                ctx.systems.observation.refreshAutocomplete(ctx.socketId, ctx.engine);
                return;
            }

            ctx.messageService.error(ctx.socketId, `Unknown entity: ${name}`);
        } else if (subCommand === 'money' || subCommand === 'credits') {
            if (ctx.args.length < 2) {
                ctx.messageService.info(ctx.socketId, 'Usage: god money <amount> [target]');
                return;
            }

            const amount = parseInt(ctx.args[1]);
            if (isNaN(amount)) {
                ctx.messageService.info(ctx.socketId, 'Usage: god money <amount> [target]');
                return;
            }

            const targetName = ctx.args.slice(2).join(' ') || 'me';
            const target = findTarget(ctx, targetName);

            if (!target) {
                ctx.messageService.error(ctx.socketId, `Target not found: ${targetName}`);
                return;
            }

            const creditsComp = target.getComponent(Credits);
            if (creditsComp) {
                creditsComp.credits += amount;
                ctx.messageService.success(ctx.socketId, `Added ${amount} credits to ${targetName}. New balance: ${creditsComp.credits}`);
            } else {
                target.addComponent(new Credits(0, amount));
                ctx.messageService.success(ctx.socketId, `Added Credits component and ${amount} credits to ${targetName}.`);
            }
        } else if (subCommand === 'set-stat') {
            if (ctx.args.length < 3) {
                ctx.messageService.info(ctx.socketId, 'Usage: god set-stat [target] <stat> <value>');
                return;
            }

            const value = parseInt(ctx.args[ctx.args.length - 1]);
            const statName = ctx.args[ctx.args.length - 2].toUpperCase();
            let targetName = ctx.args.slice(1, ctx.args.length - 2).join(' ');

            if (!targetName) targetName = 'me';

            if (isNaN(value)) {
                ctx.messageService.info(ctx.socketId, 'Usage: god set-stat [target] <stat> <value>');
                return;
            }

            const target = findTarget(ctx, targetName);
            if (!target) {
                ctx.messageService.error(ctx.socketId, `Target not found: ${targetName}`);
                return;
            }

            if (statName === 'HP' || statName === 'MAXHP' || statName === 'ATTACK' || statName === 'DEFENSE') {
                const combatStats = target.getComponent(CombatStats);
                if (combatStats) {
                    if (statName === 'HP') combatStats.hp = value;
                    else if (statName === 'MAXHP') combatStats.maxHp = value;
                    else if (statName === 'ATTACK') {
                        if (!target.hasComponent(NPC)) {
                            ctx.messageService.error(ctx.socketId, "ATTACK can only be set on NPCs.");
                            return;
                        }
                        combatStats.attack = value;
                    }
                    else if (statName === 'DEFENSE') {
                        if (!target.hasComponent(NPC)) {
                            ctx.messageService.error(ctx.socketId, "DEFENSE can only be set on NPCs.");
                            return;
                        }
                        combatStats.defense = value;
                    }
                    ctx.messageService.success(ctx.socketId, `Set ${statName} of ${targetName} to ${value}.`);
                } else {
                    ctx.messageService.error(ctx.socketId, `Target ${targetName} has no combat stats.`);
                }
            } else {
                const stats = target.getComponent(Stats);
                if (stats) {
                    const attr = stats.attributes.get(statName);
                    if (attr) {
                        attr.value = value;
                        ctx.messageService.success(ctx.socketId, `Set ${statName} of ${targetName} to ${value}.`);
                    } else {
                        ctx.messageService.error(ctx.socketId, `Stat not found: ${statName}. Available: ${Array.from(stats.attributes.keys()).join(', ')}`);
                    }
                } else {
                    ctx.messageService.error(ctx.socketId, `Target ${targetName} has no stats.`);
                }
            }
        } else if (subCommand === 'set-skill') {
            if (ctx.args.length < 3) {
                ctx.messageService.info(ctx.socketId, 'Usage: god set-skill [target] <skill> <value>');
                return;
            }

            const value = parseInt(ctx.args[ctx.args.length - 1]);
            if (isNaN(value)) {
                ctx.messageService.info(ctx.socketId, 'Usage: god set-skill [target] <skill> <value>');
                return;
            }

            let targetEntity: Entity | undefined = undefined;
            let targetName = 'me';
            let skillName = '';

            // Try to find a target from the first few words
            for (let i = 1; i < ctx.args.length - 1; i++) {
                const potentialTargetName = ctx.args.slice(1, i + 1).join(' ');
                const found = findTarget(ctx, potentialTargetName);
                if (found) {
                    targetEntity = found;
                    targetName = potentialTargetName;
                    skillName = ctx.args.slice(i + 1, ctx.args.length - 1).join(' ');
                }
            }

            if (!targetEntity) {
                targetEntity = ctx.engine.getEntity(ctx.socketId);
                targetName = 'me';
                skillName = ctx.args.slice(1, ctx.args.length - 1).join(' ');
            }

            if (!targetEntity) {
                ctx.messageService.error(ctx.socketId, `Target not found: ${targetName}`);
                return;
            }

            const stats = targetEntity.getComponent(Stats);
            if (stats) {
                // Try exact match first
                let skill = stats.skills.get(skillName);
                if (!skill) {
                    // Try case-insensitive match
                    const key = Array.from(stats.skills.keys()).find(k => k.toLowerCase() === skillName.toLowerCase());
                    if (key) skill = stats.skills.get(key);
                }

                if (skill) {
                    skill.level = value;
                    skill.uses = 0;
                    skill.maxUses = value * 10;
                    ctx.messageService.success(ctx.socketId, `Set skill ${skill.name} of ${targetName} to level ${value}.`);
                } else {
                    ctx.messageService.error(ctx.socketId, `Skill not found: ${skillName}. Available: ${Array.from(stats.skills.keys()).join(', ')}`);
                }
            } else {
                ctx.messageService.error(ctx.socketId, `Target ${targetName} has no stats.`);
            }
        } else if (subCommand === 'view') {
            const targetName = ctx.args[1] || 'me';
            const target = findTarget(ctx, targetName);
            if (!target) {
                ctx.messageService.error(ctx.socketId, `Target not found: ${targetName}`);
                return;
            }

            const stats = target.getComponent(Stats);
            const combatStats = target.getComponent(CombatStats);
            const npc = target.getComponent(NPC);

            let msg = `<title>[God View: ${npc ? npc.typeName : (target.id === ctx.socketId ? 'You' : 'Player ' + target.id)}]</title>\n`;

            if (combatStats) {
                msg += `<info>HP:</info> <success>${combatStats.hp}/${combatStats.maxHp}</success>\n`;
                msg += `<info>Attack:</info> ${combatStats.attack} | <info>Defense:</info> ${combatStats.defense}\n`;
            }

            if (stats) {
                msg += `<title>-- Attributes --</title>\n`;
                for (const [name, attr] of stats.attributes) {
                    msg += `<info>${name}:</info> ${attr.value}  `;
                }
                msg += `\n<title>-- Skills --</title>\n`;
                for (const [name, skill] of stats.skills) {
                    msg += `<info>${name}:</info> Lvl ${skill.level} (${skill.uses}/${skill.maxUses})\n`;
                }
            }

            ctx.messageService.info(ctx.socketId, msg);
        } else if (subCommand === 'reset') {
            const target = ctx.args[1];
            if (!target) {
                ctx.messageService.info(ctx.socketId, 'Usage: god reset <skills|health>');
                return;
            }

            const player = ctx.engine.getEntity(ctx.socketId);
            if (!player) return;

            if (target === 'skills' || target === 'score') {
                const stats = player.getComponent(Stats);
                if (stats) {
                    for (const [key, skill] of stats.skills) {
                        skill.level = 1;
                        skill.uses = 0;
                        skill.maxUses = 10;
                    }
                    ctx.messageService.success(ctx.socketId, 'Skills reset to Level 1.');
                }
            } else if (target === 'health' || target === 'hp') {
                const combatStats = player.getComponent(CombatStats);
                if (combatStats) {
                    combatStats.hp = combatStats.maxHp;
                    ctx.messageService.success(ctx.socketId, 'Health restored to full.');
                }
            } else {
                ctx.messageService.error(ctx.socketId, `Unknown reset target: ${target}`);
            }
        } else if (subCommand === 'weather') {
            ctx.systems.atmosphere.triggerWeatherChange(ctx.engine);
            ctx.messageService.success(ctx.socketId, 'Weather change triggered.');
        } else if (subCommand === 'pacify') {
            const targetName = ctx.args.slice(1).join(' ');
            const player = ctx.engine.getEntity(ctx.socketId);
            const pos = player?.getComponent(Position);
            if (!pos) return;

            if (targetName) {
                const target = findTarget(ctx, targetName);
                const combatStats = target?.getComponent(CombatStats);
                if (combatStats) {
                    combatStats.isHostile = false;
                    combatStats.engagementTier = EngagementTier.DISENGAGED;
                    ctx.messageService.success(ctx.socketId, `Pacified ${targetName}.`);
                } else {
                    ctx.messageService.error(ctx.socketId, `Target ${targetName} not found or has no combat stats.`);
                }
            } else {
                // Pacify all in room
                const npcs = WorldQuery.findNPCsAt(ctx.engine, pos.x, pos.y);
                npcs.forEach(npc => {
                    const combatStats = npc.getComponent(CombatStats);
                    if (combatStats) {
                        combatStats.isHostile = false;
                        combatStats.engagementTier = EngagementTier.DISENGAGED;
                    }
                });
                ctx.messageService.success(ctx.socketId, `Pacified all NPCs in the room.`);
            }
        } else if (subCommand === 'registry') {
            const items = ItemRegistry.getInstance().getAllItems();
            const uniqueItems = Array.from(new Set(items));
            let msg = `<title>[Item Registry - ${uniqueItems.length} unique items]</title>\n`;
            uniqueItems.slice(0, 50).forEach(item => {
                msg += `<info>${item.id}</info>: <cmd>${item.name}</cmd> | <success>${item.shortName}</success>\n`;
            });
            ctx.messageService.info(ctx.socketId, msg);
        } else if (subCommand === 'find') {
            const targetName = ctx.args.slice(1).join(' ');
            if (!targetName) {
                ctx.messageService.info(ctx.socketId, 'Usage: god find <name>');
                return;
            }

            let found = false;
            let msg = `<title>[Search Results for: ${targetName}]</title>\n`;

            for (const [id, entity] of ctx.engine.getEntities()) {
                const desc = entity.getComponent(Description);
                const pos = entity.getComponent(Position);
                const npc = entity.getComponent(NPC);
                const item = entity.getComponent(Item);

                const name = npc?.typeName || item?.name || desc?.title || id;

                if (name.toLowerCase().includes(targetName.toLowerCase())) {
                    found = true;
                    const posStr = pos ? `(${pos.x}, ${pos.y})` : 'No Position';
                    msg += `<info>${name}</info> [${id}] at ${posStr}\n`;
                }
            }

            if (!found) {
                ctx.messageService.error(ctx.socketId, `No entities found matching: ${targetName}`);
            } else {
                ctx.messageService.info(ctx.socketId, msg);
            }
        }
    }
});

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
        if (combatStats) {
            const rt = entity.getComponent(Roundtime) as Roundtime | undefined;
            const stats = entity.getComponent(Stats);
            const con = stats?.attributes.get('CON')?.value || 10;

            const inventory = entity.getComponent(Inventory);
            const rightHandItem = inventory?.rightHand ? WorldQuery.getEntityById(engine, inventory.rightHand) : null;
            const weapon = rightHandItem?.getComponent(Weapon);
            const weaponName = weapon?.name.toLowerCase() || '';
            const hasKatana = weaponName.includes('katana') ||
                weaponName.includes('kitana') ||
                weaponName.includes('samurai sword') || false;

            const leftHandItem = inventory?.leftHand ? WorldQuery.getEntityById(engine, inventory.leftHand) : null;
            const leftHandName = leftHandItem?.getComponent(Item)?.name || 'Empty';
            const rightHandName = rightHandItem?.getComponent(Item)?.name || 'Empty';

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
                momentum: entity.getComponent(Momentum)?.current || 0,
                hasKatana,
                leftHand: leftHandName,
                rightHand: rightHandName,
                evasion: combatStats.evasion,
                parry: combatStats.parry,
                shield: combatStats.shield,
                aggression: combatStats.aggression
            });
        }

        // Momentum Management
        const momentum = entity.getComponent(Momentum);
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

    // Create player entity
    const player = new Entity(socket.id);
    player.addComponent(new Position(10, 10)); // Spawn in Central Plaza
    const inventory = new Inventory();
    player.addComponent(inventory);

    // Give player a backpack
    const backpack = new Entity();
    backpack.addComponent(new Item("Backpack", "A sturdy canvas backpack.", 1.0));
    backpack.addComponent(new Container(10.0)); // 10lbs capacity
    engine.addEntity(backpack);

    inventory.equipment.set('back', backpack.id);

    // Add Samurai Sword (Katana) to backpack
    const katana = PrefabFactory.createItem("katana");
    if (katana) {
        engine.addEntity(katana);
        backpack.getComponent(Container)?.items.push(katana.id);
        backpack.getComponent(Container)!.currentWeight += 1.5;
    }

    // Initialize Stats (Street Thug Archetype)
    const stats = new Stats();
    stats.attributes.set('STR', { name: 'STR', value: 12 });
    stats.attributes.set('CON', { name: 'CON', value: 12 });
    stats.attributes.set('AGI', { name: 'AGI', value: 16 }); // High Agility
    stats.attributes.set('CHA', { name: 'CHA', value: 6 });  // Low Charisma

    // Skills
    stats.skills.set('Hacking', { name: 'Hacking', level: 1, uses: 0, maxUses: 10 });
    stats.skills.set('Stealth', { name: 'Stealth', level: 1, uses: 0, maxUses: 10 });
    stats.skills.set('Marksmanship (Light)', { name: 'Marksmanship (Light)', level: 1, uses: 0, maxUses: 10 });
    stats.skills.set('Marksmanship (Medium)', { name: 'Marksmanship (Medium)', level: 1, uses: 0, maxUses: 10 });
    stats.skills.set('Marksmanship (Heavy)', { name: 'Marksmanship (Heavy)', level: 1, uses: 0, maxUses: 10 });

    player.addComponent(stats);
    player.addComponent(new CombatStats(100, 10, 5, false));
    player.addComponent(new CombatBuffer(3));
    player.addComponent(new Stance(StanceType.Standing));
    player.addComponent(new Momentum());
    player.addComponent(new Credits(500, 1000000)); // 500 New Yen, 1,000,000 Credits

    // Create Shirt with pockets
    const shirt = new Entity();
    shirt.addComponent(new Item("Tactical Shirt", "A shirt with reinforced pockets.", 0.8, 1, "Medium", "Legal", "", "shirt", "torso"));
    shirt.addComponent(new Container(3.0)); // 3lbs max
    engine.addEntity(shirt);
    inventory.equipment.set('torso', shirt.id);

    // Create Pants with pockets
    const pants = new Entity();
    pants.addComponent(new Item("Cargo Pants", "Durable tactical pants with many pockets.", 1.5, 1, "Medium", "Legal", "", "pants", "legs"));
    pants.addComponent(new Container(5.0)); // 5lbs max
    engine.addEntity(pants);
    inventory.equipment.set('legs', pants.id);

    // Create Belt
    const belt = new Entity();
    belt.addComponent(new Item("Utility Belt", "A leather belt with pouches.", 0.5, 1, "Small", "Legal", "", "belt", "waist"));
    belt.addComponent(new Container(4.0)); // 4lbs max
    engine.addEntity(belt);
    inventory.equipment.set('waist', belt.id);

    // Create 3 Individual Magazines (in Belt)
    for (let i = 0; i < 3; i++) {
        const mag = new Entity();
        mag.addComponent(new Item("9mm Pistol Magazine", "A standard 10-round magazine.", 0.2));
        mag.addComponent(new Magazine("9mm Pistol Magazine", 10, 10, "9mm"));
        engine.addEntity(mag);
        belt.getComponent(Container)?.items.push(mag.id);
        belt.getComponent(Container)!.currentWeight += 0.2;
    }

    // Create Pistol (in Right Hand)
    const pistol = new Entity();
    pistol.addComponent(new Item("9mm Pistol", "A reliable semi-automatic sidearm.", 2.0));
    pistol.addComponent(new Weapon(
        "9mm Pistol",
        "pistol",
        15,
        10,
        "9mm",
        "9mm Pistol Magazine",
        12,
        { speed: 1.2, zoneSize: 2, jitter: 0.1 },
        EngagementTier.MISSILE,
        EngagementTier.MELEE,
        0.2
    ));
    engine.addEntity(pistol);
    inventory.rightHand = pistol.id;

    // Create Cyberdeck (in Backpack)
    const deck = new Entity();
    deck.addComponent(new Item("Ono-Sendai Cyberspace 7", "A legendary cyberdeck, sleek and powerful.", 1.5, 1, "Small", "Legal", "deck"));
    engine.addEntity(deck);

    const backpackId = inventory.equipment.get('back');
    if (backpackId) {
        const backpack = engine.getEntity(backpackId);
        const container = backpack?.getComponent(Container);
        if (container) {
            container.items.push(deck.id);
        }
    }

    engine.addEntity(player);

    // Send initial autocomplete data
    const roomAuto = AutocompleteAggregator.getRoomAutocomplete(player.getComponent(Position)!, engine);
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

    socket.on('disconnect', () => {
        Logger.info('Network', `User disconnected: ${socket.id}`);
        engine.removeEntity(socket.id);
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    Logger.info('Server', `Server running on port ${PORT}`);
});
