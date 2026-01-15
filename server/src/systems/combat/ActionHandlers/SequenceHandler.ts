import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { Server } from 'socket.io';
import { CombatBuffer, CombatAction, CombatActionType } from '../../../components/CombatBuffer';
import { CombatStats } from '../../../components/CombatStats';
import { Position } from '../../../components/Position';
import { NPC } from '../../../components/NPC';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { CombatUtils } from '../CombatUtils';

export class SequenceHandler {
    static executeBuffer(playerId: string, engine: IEngine, messageService: MessageService, io: Server, orchestrator: any): void {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        const buffer = player.getComponent(CombatBuffer);
        if (!buffer || buffer.actions.length === 0) {
            messageService.error(playerId, "Buffer is empty.");
            return;
        }

        if (buffer.isExecuting) {
            messageService.error(playerId, "Buffer is already executing.");
            return;
        }

        buffer.isExecuting = true;
        messageService.system(playerId, `[BUFFER] Executing sequence (${buffer.actions.length} actions)...`);

        // Check for combos
        const combo = this.checkCombos(buffer.actions);
        if (combo) {
            messageService.success(playerId, `\n[!! COMBO DETECTED: ${combo.name} !!]`);
            (buffer as any).activeCombo = combo;
        }

        // Process actions one by one
        this.processNext(playerId, engine, io, messageService, orchestrator);
    }

    static checkCombos(actions: CombatAction[]): { name: string, multiplier: number } | null {
        const types = actions.map(a => a.type);
        const sequence = types.join('->');

        if (sequence === 'DASH->DASH->SLASH') return { name: 'CRITICAL EXECUTION', multiplier: 3.0 };
        if (sequence === 'PARRY->SLASH->THRUST') return { name: 'RIPOSTE', multiplier: 2.5 };
        if (sequence === 'SLASH->SLASH->SLASH') return { name: 'TRIPLE STRIKE', multiplier: 2.0 };

        return null;
    }

    static async processNext(playerId: string, engine: IEngine, io: Server, messageService: MessageService, orchestrator: any): Promise<void> {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        const buffer = player.getComponent(CombatBuffer);
        if (!buffer || buffer.actions.length === 0) {
            if (buffer) {
                buffer.isExecuting = false;
                (buffer as any).activeCombo = null;
                const combatStats = player.getComponent(CombatStats);
                if (combatStats) combatStats.isParrying = false;
                messageService.system(playerId, "[BUFFER] Sequence complete.");
                CombatUtils.emitBufferUpdate(playerId, buffer, io);
            }
            return;
        }

        // Check for malware injection (REBOOT)
        if (buffer.malware.includes('REBOOT')) {
            messageService.error(playerId, "[MALWARE] REBOOT INJECTED. SYSTEM HALTED.");
            buffer.actions = [];
            buffer.malware = buffer.malware.filter(m => m !== 'REBOOT');
            buffer.isExecuting = false;
            CombatUtils.applyRoundtime(player, 5); // 5 second stun
            CombatUtils.emitBufferUpdate(playerId, buffer, io);
            return;
        }

        const action = buffer.actions.shift()!;
        const combatStats = player.getComponent(CombatStats);
        if (combatStats) combatStats.isParrying = false; // Reset parry window

        // Notify client of current action
        CombatUtils.emitBufferUpdate(playerId, buffer, io, action);

        // Execute action
        await this.executeSingleAction(playerId, action, engine, messageService, (buffer as any).activeCombo, orchestrator);

        // Calculate delay based on action type
        let delay = 1500;
        switch (action.type) {
            case CombatActionType.DASH: delay = 1000; break;
            case CombatActionType.SLASH: delay = 1500; break;
            case CombatActionType.THRUST: delay = 2000; break;
            case CombatActionType.PARRY: delay = 1000; break;
            case CombatActionType.SHOOT: delay = 1000; break;
        }

        // Wait for roundtime (simulated)
        setTimeout(() => {
            this.processNext(playerId, engine, io, messageService, orchestrator);
        }, delay);
    }

    static async executeSingleAction(playerId: string, action: CombatAction, engine: IEngine, messageService: MessageService, combo: any, orchestrator: any): Promise<void> {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        const combatStats = player.getComponent(CombatStats);
        if (!combatStats) return;

        // Find a target if not specified
        let targetId = action.targetId;
        if (!targetId) {
            if (combatStats.targetId) {
                targetId = combatStats.targetId;
            } else {
                const pos = player.getComponent(Position);
                if (pos) {
                    const npcs = WorldQuery.findNPCsAt(engine, pos.x, pos.y);
                    const hostile = npcs.find(n => n.getComponent(CombatStats)?.isHostile);
                    if (hostile) {
                        targetId = hostile.id;
                    } else if (npcs.length > 0) {
                        targetId = npcs[0].id;
                    }
                }
            }
        }

        if (!targetId) {
            messageService.info(playerId, `[BUFFER] ${action.type} failed: No target.`);
            return;
        }

        const target = WorldQuery.getEntityById(engine, targetId);
        const targetNPC = target?.getComponent(NPC);
        const targetCombatStats = target?.getComponent(CombatStats);
        const multiplier = combo ? combo.multiplier : 1.0;

        // Perfect Sync Check
        if (targetCombatStats && targetCombatStats.currentTelegraph) {
            let isCountered = false;
            if (action.type === CombatActionType.PARRY && (targetCombatStats.currentTelegraph === 'SLASH' || targetCombatStats.currentTelegraph === 'THRUST')) {
                isCountered = true;
            } else if (action.type === CombatActionType.DASH && targetCombatStats.currentTelegraph === 'DASH') {
                isCountered = true;
            }

            if (isCountered) {
                const buffer = player.getComponent(CombatBuffer);
                if (buffer) {
                    messageService.success(playerId, `\n[PERFECT SYNC] You countered the ${targetCombatStats.currentTelegraph}!`);
                    this.gainFlow(playerId, buffer, messageService, orchestrator.io); // Wait, gainFlow needs io for emit
                }
                targetCombatStats.currentTelegraph = null; // Consume telegraph
            }
        }

        switch (action.type) {
            case CombatActionType.DASH:
                messageService.combat(playerId, `\n[BUFFER] You DASH toward ${targetNPC?.typeName || 'the target'}!`);
                orchestrator.handleManeuver(playerId, 'CLOSE', engine, targetNPC?.typeName);
                break;
            case CombatActionType.SLASH:
                messageService.combat(playerId, `\n[BUFFER] You execute a precise SLASH!`);
                orchestrator.handleSyncResult(playerId, targetId, 'hit', engine, 1.2 * multiplier);
                break;
            case CombatActionType.PARRY:
                messageService.combat(playerId, `\n[BUFFER] You enter a PARRY stance.`);
                combatStats.parry = Math.min(100, combatStats.parry + 20);
                combatStats.isParrying = true; // Open active parry window
                break;
            case CombatActionType.THRUST:
                messageService.combat(playerId, `\n[BUFFER] You deliver a powerful THRUST!`);
                orchestrator.handleSyncResult(playerId, targetId, 'hit', engine, 1.5 * multiplier);
                break;
            case CombatActionType.SHOOT:
                messageService.combat(playerId, `\n[BUFFER] You fire your weapon!`);
                orchestrator.handleSyncResult(playerId, targetId, 'hit', engine, 1.0 * multiplier, 'shoot');
                break;
            case CombatActionType.STUMBLE:
                messageService.combat(playerId, `\n[BUFFER] You STUMBLE blindly!`);
                combatStats.balance = Math.max(0, combatStats.balance - 0.2);
                break;
        }
    }

    static gainFlow(playerId: string, buffer: CombatBuffer, messageService: MessageService, io: Server): void {
        buffer.flow++;
        if (buffer.flow >= 3) {
            buffer.maxSlots = Math.min(6, buffer.maxSlots + 1);
            buffer.flow = 0;
            messageService.success(playerId, `[FLOW STATE] Buffer capacity increased to ${buffer.maxSlots}!`);
        }
        CombatUtils.emitBufferUpdate(playerId, buffer, io);
    }
}
