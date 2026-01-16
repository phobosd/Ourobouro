import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { Server } from 'socket.io';
import { CombatStats } from '../../../components/CombatStats';
import { Stats } from '../../../components/Stats';
import { Weapon } from '../../../components/Weapon';
import { Inventory } from '../../../components/Inventory';
import { Momentum } from '../../../components/Momentum';
import { Position } from '../../../components/Position';
import { NPC } from '../../../components/NPC';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { CombatUtils } from '../CombatUtils';
import { PlayerAttackHandler } from './PlayerAttackHandler';

export class SpecialHandler {
    static handleIaijutsu(playerId: string, targetName: string, engine: IEngine, messageService: MessageService, io: Server): void {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        if (!CombatUtils.checkRoundtime(player, messageService)) return;

        const inventory = player.getComponent(Inventory);
        const stats = player.getComponent(Stats);
        const combatStats = player.getComponent(CombatStats);
        const pos = player.getComponent(Position);

        if (!inventory || !stats || !combatStats || !pos) return;

        // Check if holding a katana
        let weapon: Weapon | undefined;
        if (inventory.rightHand) {
            const weaponEntity = WorldQuery.getEntityById(engine, inventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon || !weapon.name.toLowerCase().includes('katana')) {
            messageService.info(playerId, "Iaijutsu requires a katana.");
            return;
        }

        // Check Momentum
        let momentum = player.getComponent(Momentum);
        if (!momentum || momentum.current < 50) {
            messageService.info(playerId, `You need at least 50 momentum to perform Iaijutsu! (Current: ${momentum?.current || 0})`);
            return;
        }

        // Find target
        let target: Entity | undefined;
        if (!targetName) {
            if (combatStats.targetId) {
                target = WorldQuery.getEntityById(engine, combatStats.targetId);
            }
            if (!target) {
                const roomNPCs = WorldQuery.findNPCsAt(engine, pos.x, pos.y);
                if (roomNPCs.length === 1) target = roomNPCs[0];
            }
        } else {
            const { name: parsedName, ordinal } = CombatUtils.parseTargetName(targetName);
            const roomNPCs = engine.getEntitiesWithComponent(NPC).filter(e => {
                const npc = e.getComponent(NPC);
                const nPos = e.getComponent(Position);
                return npc && nPos && npc.typeName.toLowerCase().includes(parsedName.toLowerCase()) &&
                    nPos.x === pos.x && nPos.y === pos.y;
            });
            target = roomNPCs[ordinal - 1];
        }

        if (!target) {
            messageService.info(playerId, "You don't see them here.");
            return;
        }

        messageService.combat(playerId, "\n[IAIJUTSU] You center your spirit, your hand a blur as you draw and strike in one motion!");
        momentum.consume(50);

        // Execute a powerful attack
        PlayerAttackHandler.handleSyncResult(playerId, target.id, 'crit', engine, messageService, io, 2.5, 'iaijutsu');
        CombatUtils.applyRoundtime(player, 4);
    }
}
