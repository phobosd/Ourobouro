import { CommandRegistry } from './CommandRegistry';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { NPC } from '../components/NPC';
import { Role } from '../components/Role';
import { Inventory } from '../components/Inventory';
import { Item } from '../components/Item';
import { Container } from '../components/Container';
import { WorldQuery } from '../utils/WorldQuery';
import { Logger } from '../utils/Logger';

export function registerSocialCommands(registry: CommandRegistry) {
    // Say - Room-local chat
    registry.register({
        name: 'say',
        aliases: ["'"],
        description: 'Speak to everyone in the current room',
        execute: (ctx) => {
            const message = ctx.args.join(' ');
            if (!message) {
                ctx.messageService.error(ctx.socketId, 'Say what?');
                return;
            }

            const player = ctx.engine.getEntity(ctx.socketId);
            if (!player) return;

            const pos = player.getComponent(Position);
            if (!pos) return;

            const charName = player.getComponent(Description)?.title || "Someone";

            // Broadcast to room
            const roomName = `room:${pos.x}:${pos.y}`;
            ctx.io.to(roomName).emit('message', {
                type: 'chat',
                sender: 'You',
                content: `You say, "${message}"`
            });

            // Send to others in room (excluding sender)
            ctx.io.to(roomName).except(ctx.socketId).emit('message', {
                type: 'chat',
                sender: charName,
                content: `${charName} says, "${message}"`
            });
        }
    });

    // Link - Global channel (Neural Link)
    registry.register({
        name: 'link',
        aliases: ['gossip', 'gos'],
        description: 'Broadcast a message to the global Neural Link',
        execute: (ctx) => {
            const message = ctx.args.join(' ');
            if (!message) {
                ctx.messageService.error(ctx.socketId, 'Broadcast what?');
                return;
            }

            const player = ctx.engine.getEntity(ctx.socketId);
            const charName = player?.getComponent(Description)?.title || "Someone";

            // Eye-catching global broadcast with glowing cyan styling
            ctx.io.emit('message', {
                type: 'global',
                sender: 'Neural Link',
                content: `<span style="color: #00ffff; font-weight: bold; text-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff;">⟨⟨ NEURAL-LINK ⟩⟩</span> <span style="color: #ffffff; font-weight: bold;">${charName}:</span> <span style="color: #ccffff;">${message}</span>`
            });
        }
    });

    // Emote - Action description
    registry.register({
        name: 'emote',
        aliases: [':', 'me'],
        description: 'Perform an action',
        execute: (ctx) => {
            const action = ctx.args.join(' ');
            if (!action) {
                ctx.messageService.error(ctx.socketId, 'Do what?');
                return;
            }

            const player = ctx.engine.getEntity(ctx.socketId);
            if (!player) return;

            const pos = player.getComponent(Position);
            if (!pos) return;

            const charName = player.getComponent(Description)?.title || "Someone";
            const roomName = `room:${pos.x}:${pos.y}`;
            ctx.io.to(roomName).emit('message', {
                type: 'emote',
                content: `${charName} ${action}`
            });
        }
    });

    // Whisper - Private message
    registry.register({
        name: 'whisper',
        aliases: ['whis'],
        description: 'Send a private message to another player',
        execute: (ctx) => {
            if (ctx.args.length < 2) {
                ctx.messageService.error(ctx.socketId, 'Usage: whisper <player> <message>');
                return;
            }

            const targetName = ctx.args[0].toLowerCase();
            const message = ctx.args.slice(1).join(' ');

            const player = ctx.engine.getEntity(ctx.socketId);
            const charName = player?.getComponent(Description)?.title || "Someone";

            // Find target player
            const allPlayers = ctx.engine.getEntitiesWithComponent(Role);
            const target = allPlayers.find(p => p.getComponent(Description)?.title.toLowerCase() === targetName);

            if (!target) {
                ctx.messageService.error(ctx.socketId, `Player '${targetName}' not found.`);
                return;
            }

            // Send to target
            ctx.io.to(target.id).emit('message', {
                type: 'whisper',
                sender: charName,
                content: `<span style="color: #ffff00">${charName} whispers to you: "${message}"</span>`
            });

            // Send confirmation to sender
            ctx.messageService.info(ctx.socketId, `You whisper to ${target.getComponent(Description)?.title}: "${message}"`);
        }
    });

    // Who - List online players
    registry.register({
        name: 'who',
        aliases: [],
        description: 'List all online players',
        execute: (ctx) => {
            const allPlayers = ctx.engine.getEntitiesWithComponent(Role);

            let output = '<title>[ Online Citizens ]</title>\n';
            allPlayers.forEach(p => {
                const desc = p.getComponent(Description);
                const role = p.getComponent(Role) as Role;
                let line = `- <player>${desc?.title || "Unknown"}</player>`;
                if (role && role.value !== 'user') {
                    line += ` <span style="color: #ff0000">[${role.value.toUpperCase()}]</span>`;
                }
                output += line + '\n';
            });

            output += `\nTotal: ${allPlayers.length} citizen(s) online.`;
            ctx.messageService.info(ctx.socketId, output);
        },
        ignoresRoundtime: true
    });

    // Give - Transfer item to another player
    registry.register({
        name: 'give',
        aliases: [],
        description: 'Give an item to another player',
        execute: (ctx) => {
            // Parse: give <item> to <target>
            const fullArgs = ctx.args.join(' ');
            const toIndex = fullArgs.toLowerCase().indexOf(' to ');

            if (toIndex === -1 || ctx.args.length < 3) {
                ctx.messageService.error(ctx.socketId, 'Usage: give <item> to <player>');
                return;
            }

            const itemName = fullArgs.substring(0, toIndex).trim();
            const targetName = fullArgs.substring(toIndex + 4).trim();

            if (!itemName || !targetName) {
                ctx.messageService.error(ctx.socketId, 'Usage: give <item> to <player>');
                return;
            }

            const player = ctx.engine.getEntity(ctx.socketId);
            if (!player) return;

            const pos = player.getComponent(Position);
            const inventory = player.getComponent(Inventory);
            if (!pos || !inventory) return;

            // Find the item in player's hands
            let itemEntity = null;
            let itemHand: 'left' | 'right' | null = null;

            if (inventory.leftHand) {
                const leftItem = ctx.engine.getEntity(inventory.leftHand);
                const leftItemComp = leftItem?.getComponent(Item);
                if (leftItemComp && leftItemComp.name.toLowerCase() === itemName.toLowerCase()) {
                    itemEntity = leftItem;
                    itemHand = 'left';
                }
            }

            if (!itemEntity && inventory.rightHand) {
                const rightItem = ctx.engine.getEntity(inventory.rightHand);
                const rightItemComp = rightItem?.getComponent(Item);
                if (rightItemComp && rightItemComp.name.toLowerCase() === itemName.toLowerCase()) {
                    itemEntity = rightItem;
                    itemHand = 'right';
                }
            }

            if (!itemEntity) {
                ctx.messageService.error(ctx.socketId, `You are not holding '${itemName}'.`);
                return;
            }

            // Find target player in the same room
            const allPlayers = ctx.engine.getEntitiesWithComponent(Role);
            const target = allPlayers.find(p => {
                const targetPos = p.getComponent(Position);
                const targetDesc = p.getComponent(Description);
                return p.id !== ctx.socketId &&
                    targetPos && targetPos.x === pos.x && targetPos.y === pos.y &&
                    targetDesc && targetDesc.title.toLowerCase() === targetName.toLowerCase();
            });

            if (!target) {
                ctx.messageService.error(ctx.socketId, `You don't see '${targetName}' here.`);
                return;
            }

            const targetInventory = target.getComponent(Inventory);
            if (!targetInventory) {
                ctx.messageService.error(ctx.socketId, `Cannot give items to ${targetName}.`);
                return;
            }

            const itemComp = itemEntity.getComponent(Item);
            const charName = player.getComponent(Description)?.title || 'Someone';
            const targetCharName = target.getComponent(Description)?.title || 'Someone';

            // Remove from giver's hand
            if (itemHand === 'left') {
                inventory.leftHand = null;
            } else {
                inventory.rightHand = null;
            }

            // Try to place in target's hands first, then backpack
            if (!targetInventory.leftHand) {
                targetInventory.leftHand = itemEntity.id;
            } else if (!targetInventory.rightHand) {
                targetInventory.rightHand = itemEntity.id;
            } else {
                // Try to add to backpack
                const backpackId = targetInventory.equipment.get('back');
                if (backpackId) {
                    const backpack = ctx.engine.getEntity(backpackId);
                    const containerComp = backpack?.getComponent(Container);
                    if (containerComp) {
                        containerComp.items.push(itemEntity.id);
                    } else {
                        ctx.messageService.error(ctx.socketId, `${targetName} has no room for the item.`);
                        // Put it back in giver's hand
                        if (itemHand === 'left') {
                            inventory.leftHand = itemEntity.id;
                        } else {
                            inventory.rightHand = itemEntity.id;
                        }
                        return;
                    }
                } else {
                    ctx.messageService.error(ctx.socketId, `${targetName} has no room for the item.`);
                    // Put it back in giver's hand
                    if (itemHand === 'left') {
                        inventory.leftHand = itemEntity.id;
                    } else {
                        inventory.rightHand = itemEntity.id;
                    }
                    return;
                }
            }

            // Send messages
            ctx.messageService.success(ctx.socketId, `You give ${itemComp?.name} to ${targetCharName}.`);
            ctx.messageService.success(target.id, `${charName} gives you ${itemComp?.name}.`);

            // Broadcast to room
            const roomName = `room:${pos.x}:${pos.y}`;
            ctx.io.to(roomName).except([ctx.socketId, target.id]).emit('message', {
                type: 'info',
                content: `${charName} gives ${itemComp?.name} to ${targetCharName}.`
            });
        }
    });
}
