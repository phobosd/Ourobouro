import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { Engine } from './ecs/Engine';
import { Entity } from './ecs/Entity';
import { Position } from './components/Position';
import { WorldGenerator } from './world/WorldGenerator';
import { MovementSystem } from './systems/MovementSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { NPCSystem } from './systems/NPCSystem';
import { NPC } from './components/NPC';
import { CombatSystem } from './systems/CombatSystem';
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
import { PrefabFactory } from './factories/PrefabFactory';
import { ItemRegistry } from './services/ItemRegistry';

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

// ECS Setup
const engine = new Engine();
const movementSystem = new MovementSystem(io);
const interactionSystem = new InteractionSystem(io);
const npcSystem = new NPCSystem(io);

engine.addSystem(movementSystem);
engine.addSystem(interactionSystem);
engine.addSystem(npcSystem);

movementSystem.setInteractionSystem(interactionSystem);

// Command Registry Setup
const commandRegistry = new CommandRegistry();

const moveAndLook = (ctx: any, dir: 'n' | 's' | 'e' | 'w') => {
    const player = (ctx.engine as any).getEntity(ctx.socketId);
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
    execute: (ctx) => ctx.systems.interaction.handleLook(ctx.socketId, new Set((ctx.engine as any)['entities'].values()), ctx.args.join(' '))
});

commandRegistry.register({
    name: 'get',
    aliases: ['g', 'take'],
    description: 'Pick up an item',
    execute: (ctx) => ctx.systems.interaction.handleGet(ctx.socketId, ctx.args.join(' '), new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'drop',
    aliases: ['d'],
    description: 'Drop an item',
    execute: (ctx) => ctx.systems.interaction.handleDrop(ctx.socketId, ctx.args.join(' '), new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'read',
    aliases: ['scan'],
    description: 'Read a terminal or object',
    execute: (ctx) => ctx.systems.interaction.handleRead(ctx.socketId, new Set((ctx.engine as any)['entities'].values()), ctx.args.join(' '))
});

commandRegistry.register({
    name: 'inventory',
    aliases: ['inv', 'i'],
    description: 'Check your inventory',
    execute: (ctx) => ctx.systems.interaction.handleInventory(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'glance',
    aliases: ['gl'],
    description: 'Glance at your hands',
    execute: (ctx) => ctx.systems.interaction.handleGlance(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'sit',
    aliases: [],
    description: 'Sit down',
    execute: (ctx) => ctx.systems.interaction.handleStanceChange(ctx.socketId, StanceType.Sitting, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'stand',
    aliases: ['st'],
    description: 'Stand up',
    execute: (ctx) => ctx.systems.interaction.handleStanceChange(ctx.socketId, StanceType.Standing, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'lie',
    aliases: ['rest', 'sleep'],
    description: 'Lie down',
    execute: (ctx) => ctx.systems.interaction.handleStanceChange(ctx.socketId, StanceType.Lying, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'stow',
    aliases: ['put'],
    description: 'Put an item in your backpack (Usage: stow <item>)',
    execute: (ctx) => ctx.systems.interaction.handleStow(ctx.socketId, ctx.args.join(' '), new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'sheet',
    aliases: ['stats'],
    description: 'View your character attributes',
    execute: (ctx) => ctx.systems.interaction.handleSheet(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'score',
    aliases: ['skills'],
    description: 'View your character skills',
    execute: (ctx) => ctx.systems.interaction.handleScore(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'swap',
    aliases: ['switch'],
    description: 'Swap items between your hands',
    execute: (ctx) => ctx.systems.interaction.handleSwap(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
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
        ctx.systems.combat.handleAttack(ctx.socketId, targetName, new Set((ctx.engine as any)['entities'].values()));
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
        const targetName = args.join(' '); // Rest is object name
        ctx.systems.interaction.handleTurn(ctx.socketId, new Set((ctx.engine as any)['entities'].values()), targetName, direction, ctx.engine);
    }
});

commandRegistry.register({
    name: 'map',
    aliases: ['m'],
    description: 'Display the world map',
    execute: (ctx) => ctx.systems.interaction.handleMap(ctx.socketId, new Set((ctx.engine as any)['entities'].values()))
});

commandRegistry.register({
    name: 'god',
    aliases: ['admin'],
    description: 'Admin commands (Usage: god spawn <rat|thug>)',
    execute: (ctx) => {
        const subCommand = ctx.args[0];
        if (!subCommand) {
            ctx.io.to(ctx.socketId).emit('message', 'Usage: god <spawn> <type>');
            return;
        }

        if (subCommand === 'spawn') {
            const name = ctx.args.slice(1).join(' ');
            if (!name) {
                ctx.io.to(ctx.socketId).emit('message', 'Usage: god spawn <item name | npc name>');
                return;
            }

            // Get player position
            const player = (ctx.engine as any).getEntity(ctx.socketId);
            if (!player) return;
            const pos = player.getComponent(Position);
            if (!pos) return;

            // Try to spawn NPC
            let entity = PrefabFactory.createNPC(name);
            if (entity) {
                entity.addComponent(new Position(pos.x, pos.y));
                ctx.engine.addEntity(entity);
                ctx.io.to(ctx.socketId).emit('message', `Spawned NPC: ${name}`);
                return;
            }

            // Try to spawn Item
            entity = PrefabFactory.createItem(name);
            if (entity) {
                entity.addComponent(new Position(pos.x, pos.y));
                ctx.engine.addEntity(entity);
                ctx.io.to(ctx.socketId).emit('message', `Spawned Item: ${name}`);
                return;
            }

            ctx.io.to(ctx.socketId).emit('message', `Unknown entity: ${name}`);
        } else if (subCommand === 'reset') {
            const target = ctx.args[1];
            if (!target) {
                ctx.io.to(ctx.socketId).emit('message', 'Usage: god reset <skills|health>');
                return;
            }

            const player = (ctx.engine as any).getEntity(ctx.socketId);
            if (!player) return;

            if (target === 'skills' || target === 'score') {
                const stats = player.getComponent(Stats);
                if (stats) {
                    for (const [key, skill] of stats.skills) {
                        skill.level = 1;
                        skill.uses = 0;
                        skill.maxUses = 10;
                    }
                    ctx.io.to(ctx.socketId).emit('message', 'Skills reset to Level 1.');
                }
            } else if (target === 'health' || target === 'hp') {
                const combatStats = player.getComponent(CombatStats);
                if (combatStats) {
                    combatStats.hp = combatStats.maxHp;
                    ctx.io.to(ctx.socketId).emit('message', 'Health restored to full.');
                }
            } else {
                ctx.io.to(ctx.socketId).emit('message', `Unknown reset target: ${target}`);
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
        ctx.io.to(ctx.socketId).emit('message', helpText);
    }
});

// Persistence Setup
const persistence = new PersistenceManager();
persistence.connect();

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

    // Send health updates to all connected players
    for (const [id, entity] of (engine as any)['entities']) {
        const combatStats = entity.getComponent(CombatStats);
        const stance = entity.getComponent(Stance);
        if (combatStats) {
            io.to(id).emit('stats-update', {
                hp: combatStats.hp,
                maxHp: combatStats.maxHp,
                stance: stance?.current || 'standing'
            });
        }
    }

    // Auto-save every 30 seconds
    if (Date.now() - lastSaveTime > 30000) {
        persistence.saveWorldState(Array.from((engine as any)['entities'].values()));
        console.log('World saved to Redis');
        lastSaveTime = Date.now();
    }
}, TICK_MS);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send Autocomplete Data
    socket.emit('autocomplete-data', {
        spawnables: [...PrefabFactory.getSpawnableItems(), ...PrefabFactory.getSpawnableNPCs()]
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
    player.addComponent(new CombatStats(100, 10, 5));
    player.addComponent(new Stance(StanceType.Standing));

    // Create Shirt with pockets
    const shirt = new Entity();
    shirt.addComponent(new Item("Tactical Shirt", "A shirt with reinforced pockets.", 0.8));
    shirt.addComponent(new Container(1.0)); // 1lb max
    engine.addEntity(shirt);
    inventory.equipment.set('torso', shirt.id);

    // Create Pants with pockets
    const pants = new Entity();
    pants.addComponent(new Item("Cargo Pants", "Durable tactical pants with many pockets.", 1.5));
    pants.addComponent(new Container(1.0)); // 1lb max
    engine.addEntity(pants);
    inventory.equipment.set('legs', pants.id);

    // Create Belt
    const belt = new Entity();
    belt.addComponent(new Item("Utility Belt", "A leather belt with pouches.", 0.5));
    belt.addComponent(new Container(1.0)); // 1lb max
    engine.addEntity(belt);
    inventory.equipment.set('waist', belt.id);

    // Create 3 Individual Magazines (in Belt)
    for (let i = 0; i < 3; i++) {
        const mag = new Entity();
        mag.addComponent(new Item("9mm Mag", "A standard 10-round magazine.", 0.2));
        mag.addComponent(new Magazine(10, 10, "9mm"));
        engine.addEntity(mag);
        belt.getComponent(Container)?.items.push(mag.id);
        belt.getComponent(Container)!.currentWeight += 0.2;
    }

    // Create Pistol (in Right Hand)
    const pistol = new Entity();
    pistol.addComponent(new Item("9mm Pistol", "A reliable semi-automatic sidearm.", 2.0));
    pistol.addComponent(new Weapon("9mm Pistol", 15, 10, "9mm", 12, { speed: 1.2, zoneSize: 2, jitter: 0.1 }));
    engine.addEntity(pistol);
    inventory.rightHand = pistol.id;

    engine.addEntity(player);

    const combatSystem = new CombatSystem(engine, io);

    socket.on('command', (cmd: string) => {
        commandRegistry.execute(cmd, {
            socketId: socket.id,
            args: [],
            io: io,
            engine: engine,
            systems: {
                movement: movementSystem,
                interaction: interactionSystem,
                npc: npcSystem,
                combat: combatSystem
            }
        });
    });

    socket.on('combat-result', (data: { targetId: string, hitType: 'crit' | 'hit' | 'miss' }) => {
        combatSystem.handleSyncResult(socket.id, data.targetId, data.hitType, new Set((engine as any)['entities'].values()));
    });

    socket.on('terminal-buy', (data: { itemName: string, cost: number }) => {
        const createdItem = interactionSystem.handleTerminalBuy(socket.id, new Set((engine as any)['entities'].values()), data.itemName, data.cost);
        if (createdItem) {
            engine.addEntity(createdItem);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        engine.removeEntity(socket.id);
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
