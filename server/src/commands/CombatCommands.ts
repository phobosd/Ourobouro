import { CommandRegistry, CommandContext } from './CommandRegistry';
import { CombatActionType, CombatBuffer } from '../components/CombatBuffer';
import { Inventory } from '../components/Inventory';
import { Weapon } from '../components/Weapon';
import { WorldQuery } from '../utils/WorldQuery';

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
            case CombatActionType.SLICE:
                ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'slice');
                break;
            case CombatActionType.SHOOT:
                ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'shoot');
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

export const registerCombatCommands = (registry: CommandRegistry) => {
    registry.register({
        name: 'attack',
        aliases: ['kill', 'fight'],
        description: 'Attack a target',
        execute: (ctx) => {
            const player = ctx.engine.getEntity(ctx.socketId);
            const buffer = player?.getComponent(CombatBuffer);

            if (buffer && buffer.isBuilding) {
                // Determine appropriate action based on weapon
                const inventory = player?.getComponent(Inventory);
                let actionType = CombatActionType.SLASH; // Default

                if (inventory && inventory.rightHand) {
                    const weaponEntity = WorldQuery.getEntityById(ctx.engine, inventory.rightHand);
                    const weapon = weaponEntity?.getComponent(Weapon);
                    if (weapon && weapon.range > 0) {
                        actionType = CombatActionType.SHOOT;
                    }
                }

                handleBufferAction(ctx, actionType);
            } else {
                const targetName = ctx.args.join(' ');
                ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine);
            }
        }
    });

    registry.register({
        name: 'shoot',
        aliases: ['fire'],
        description: 'Shoot a target or add SHOOT to buffer',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.SHOOT)
    });

    registry.register({
        name: 'punch',
        aliases: [],
        description: 'Punch a target (Brawling)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'punch');
        }
    });

    registry.register({
        name: 'jab',
        aliases: [],
        description: 'Jab a target (Brawling)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'jab');
        }
    });

    registry.register({
        name: 'headbutt',
        aliases: [],
        description: 'Headbutt a target (Brawling)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'headbutt');
        }
    });

    registry.register({
        name: 'uppercut',
        aliases: [],
        description: 'Uppercut a target (Brawling)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleAttack(ctx.socketId, targetName, ctx.engine, 'uppercut');
        }
    });

    registry.register({
        name: 'slice',
        aliases: [],
        description: 'Perform a fast, precision strike (Samurai weapons build momentum)',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.SLICE)
    });

    registry.register({
        name: 'iaijutsu',
        aliases: ['iai'],
        description: 'Perform a devastating instant strike (Requires 30+ Momentum)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleIaijutsu(ctx.socketId, targetName, ctx.engine);
        }
    });

    registry.register({
        name: 'reload',
        aliases: ['rel'],
        description: 'Reload your weapon',
        execute: (ctx) => ctx.systems.combat.handleReload(ctx.socketId, ctx.engine)
    });

    registry.register({
        name: 'ammo',
        aliases: ['checkammo'],
        description: 'Check ammunition in your weapon',
        execute: (ctx) => ctx.systems.combat.handleCheckAmmo(ctx.socketId, ctx.engine),
        ignoresRoundtime: true
    });

    registry.register({
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

    registry.register({
        name: 'dash',
        aliases: [],
        description: 'Dash or add DASH to buffer',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.DASH)
    });

    registry.register({
        name: 'slash',
        aliases: [],
        description: 'Slash or add SLASH to buffer',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.SLASH)
    });

    registry.register({
        name: 'parry',
        aliases: [],
        description: 'Parry or add PARRY to buffer',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.PARRY)
    });

    registry.register({
        name: 'thrust',
        aliases: [],
        description: 'Thrust or add THRUST to buffer',
        execute: (ctx) => handleBufferAction(ctx, CombatActionType.THRUST)
    });

    registry.register({
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

    registry.register({
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

    registry.register({
        name: 'advance',
        aliases: ['approach', 'adv'],
        description: 'Automatically advance on a target until melee range',
        execute: (ctx) => {
            const target = ctx.args.join(' ');
            ctx.systems.combat.handleAdvance(ctx.socketId, target, ctx.engine);
        }
    });

    registry.register({
        name: 'retreat',
        aliases: [],
        description: 'Automatically retreat from a target',
        execute: (ctx) => {
            const target = ctx.args.join(' ');
            ctx.systems.combat.handleRetreat(ctx.socketId, target, ctx.engine);
        }
    });

    registry.register({
        name: 'stop',
        aliases: [],
        description: 'Stop any automated actions',
        execute: (ctx) => {
            ctx.systems.combat.handleStop(ctx.socketId, ctx.engine);
        },
        ignoresRoundtime: true
    });

    registry.register({
        name: 'hangback',
        aliases: [],
        description: 'Toggle hangback mode to counter enemy advances',
        execute: (ctx) => {
            ctx.systems.combat.handleHangback(ctx.socketId, ctx.engine);
        }
    });

    registry.register({
        name: 'flee',
        aliases: [],
        description: 'Attempt to flee from combat (Usage: flee [direction])',
        execute: (ctx) => {
            const direction = ctx.args[0]?.toUpperCase();
            ctx.systems.combat.handleFlee(ctx.socketId, direction, ctx.engine);
        }
    });

    registry.register({
        name: 'assess',
        aliases: [],
        description: 'Assess the combat situation',
        execute: (ctx) => {
            ctx.systems.combat.handleAssess(ctx.socketId, ctx.engine);
        }
    });

    registry.register({
        name: 'target',
        aliases: [],
        description: 'Set targeting bias or switch target (Usage: target <body_part> | <npc_name>)',
        execute: (ctx) => {
            const arg = ctx.args.join(' ');
            if (arg) {
                ctx.systems.combat.handleTarget(ctx.socketId, arg, ctx.engine);
            } else {
                ctx.messageService.info(ctx.socketId, 'Usage: target <body_part> | <npc_name>');
            }
        }
    });

    registry.register({
        name: 'stance',
        aliases: [],
        description: 'Set combat stance (Usage: stance <evasion|parry|shield|offensive|defensive|neutral|custom>)',
        execute: (ctx) => {
            ctx.systems.combat.handleStance(ctx.socketId, ctx.args, ctx.engine);
        }
    });

    registry.register({
        name: 'appraise',
        aliases: ['app'],
        description: 'Appraise a target\'s condition (Usage: appraise <target>)',
        execute: (ctx) => {
            const targetName = ctx.args.join(' ');
            ctx.systems.combat.handleAppraise(ctx.socketId, targetName, ctx.engine);
        }
    });
    registry.register({
        name: 'balance',
        aliases: ['bal'],
        description: 'Check your current balance',
        execute: (ctx) => {
            ctx.systems.combat.handleBalance(ctx.socketId, ctx.engine);
        },
        ignoresRoundtime: true
    });
};
