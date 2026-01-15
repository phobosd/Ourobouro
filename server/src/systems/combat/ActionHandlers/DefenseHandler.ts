import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { CombatStats } from '../../../components/CombatStats';
import { Position } from '../../../components/Position';
import { NPC } from '../../../components/NPC';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { BodyPart } from '../../../types/CombatTypes';
import { CombatUtils } from '../CombatUtils';

export class DefenseHandler {
    static handleHangback(playerId: string, engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);
        if (stats) {
            stats.isHangingBack = !stats.isHangingBack;
            messageService.info(playerId, `Hangback mode: ${stats.isHangingBack ? 'ENABLED' : 'DISABLED'}`);
        }
    }

    static handleTarget(playerId: string, arg: string, engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);
        if (!stats) return;

        // 1. Check if it's a body part
        const bodyPart = Object.values(BodyPart).find(p => p.toLowerCase() === arg.toLowerCase());
        if (bodyPart) {
            stats.targetLimb = bodyPart as BodyPart;
            messageService.info(playerId, `Targeting bias set to: ${bodyPart}`);
            return;
        }

        // 2. Check if it's an NPC
        const pPos = player?.getComponent(Position);
        if (!pPos) return;

        const { name, ordinal } = CombatUtils.parseTargetName(arg);
        const roomNPCs = engine.getEntitiesWithComponent(NPC).filter(e => {
            const npc = e.getComponent(NPC);
            const pos = e.getComponent(Position);
            return npc && pos && npc.typeName.toLowerCase().includes(name.toLowerCase()) &&
                pos.x === pPos.x && pos.y === pPos.y;
        });

        const target = roomNPCs[ordinal - 1];
        if (target) {
            stats.targetId = target.id;
            const npcComp = target.getComponent(NPC);
            messageService.success(playerId, `You are now targeting ${npcComp?.typeName || 'the target'}.`);
        } else {
            messageService.error(playerId, `Invalid target or body part: ${arg}.`);
        }
    }

    static handleStance(playerId: string, args: string[], engine: IEngine, messageService: MessageService) {
        const player = WorldQuery.getEntityById(engine, playerId);
        const stats = player?.getComponent(CombatStats);
        if (!stats) return;

        const stanceName = args[0]?.toLowerCase();

        if (!stanceName) {
            // Show current stance configuration
            messageService.info(playerId, `Current Stance Configuration:\nEvasion: ${stats.evasion}%\nParry: ${stats.parry}%\nShield: ${stats.shield}%\nAggression: ${Math.round(stats.aggression * 100)}%`);
            return;
        }

        if (stanceName === '?') {
            messageService.info(playerId, "Usage: stance <evasion|parry|shield|offensive|defensive|neutral|custom>");
            return;
        }

        switch (stanceName) {
            case 'offensive':
                stats.evasion = 30; stats.parry = 30; stats.shield = 10; stats.aggression = 0.8;
                break;
            case 'defensive':
                stats.evasion = 40; stats.parry = 40; stats.shield = 20; stats.aggression = 0.2;
                break;
            case 'neutral':
                stats.evasion = 40; stats.parry = 30; stats.shield = 30; stats.aggression = 0.5;
                break;
            case 'evasion':
                stats.evasion = 100; stats.parry = 0; stats.shield = 0; stats.aggression = 0.3;
                break;
            case 'parry':
                stats.evasion = 0; stats.parry = 100; stats.shield = 0; stats.aggression = 0.3;
                break;
            case 'shield':
                stats.evasion = 0; stats.parry = 0; stats.shield = 100; stats.aggression = 0.3;
                break;
            case 'custom':
                const e = parseInt(args[1]);
                const p = parseInt(args[2]);
                const s = parseInt(args[3]);
                if (isNaN(e) || isNaN(p) || isNaN(s) || (e + p + s) > 100) {
                    messageService.error(playerId, "Invalid custom stance. Usage: stance custom <evasion> <parry> <shield> (Sum must be <= 100)");
                    return;
                }
                stats.evasion = e; stats.parry = p; stats.shield = s;
                break;
            default:
                messageService.error(playerId, `Unknown stance: ${stanceName}`);
                return;
        }

        // Update base values for resets
        stats.baseEvasion = stats.evasion;
        stats.baseParry = stats.parry;
        stats.baseShield = stats.shield;

        messageService.success(playerId, `Stance set to ${stanceName.toUpperCase()}. (Evasion: ${stats.evasion}%, Parry: ${stats.parry}%, Shield: ${stats.shield}%)`);
    }
}
