import { Entity } from '../../ecs/Entity';
import { IEngine } from '../../ecs/IEngine';
import { Position } from '../../components/Position';
import { NPC } from '../../components/NPC';
import { CombatStats } from '../../components/CombatStats';
import { EngagementTier } from '../../types/CombatTypes';
import { WorldQuery } from '../../utils/WorldQuery';
import { MessageService } from '../../services/MessageService';
import { NPCUtils } from './NPCUtils';
import { Conversation } from '../../components/Conversation';

export class NPCMovementHandler {
    static moveRandomly(npc: Entity, pos: Position, engine: IEngine, messageService: MessageService) {
        const npcComp = npc.getComponent(NPC);

        // Check if NPC is allowed to move
        if (npcComp && !npcComp.canMove) {
            return;
        }

        // Check if NPC is in a conversation
        if (npc.hasComponent(Conversation)) {
            return;
        }

        // Check if NPC is engaged in combat
        const combatStats = npc.getComponent(CombatStats);
        if (combatStats) {
            // Don't move if hostile and has a target (actively pursuing/fighting)
            if (combatStats.isHostile && combatStats.targetId) {
                return; // Cannot move while pursuing/engaged with target
            }
            // Also don't move at close combat ranges
            if ([EngagementTier.MELEE, EngagementTier.CLOSE_QUARTERS, EngagementTier.POLEARM].includes(combatStats.engagementTier)) {
                return; // Cannot move while engaged
            }
        }

        const directions = [
            { x: 0, y: -1, name: 'north', reverse: 'south' },
            { x: 0, y: 1, name: 'south', reverse: 'north' },
            { x: 1, y: 0, name: 'east', reverse: 'west' },
            { x: -1, y: 0, name: 'west', reverse: 'east' }
        ];
        const move = directions[Math.floor(Math.random() * directions.length)];

        const newX = pos.x + move.x;
        const newY = pos.y + move.y;

        // Check if the new position is a valid room
        const targetRoom = WorldQuery.findRoomAt(engine, newX, newY);

        if (targetRoom) {
            const name = npcComp ? npcComp.typeName : 'Something';

            // Broadcast leaving message to old room
            NPCUtils.broadcastToRoom(engine, pos.x, pos.y, `<movement>${name} has left to the ${move.name}.</movement>`, messageService);

            pos.x = newX;
            pos.y = newY;

            // Reset engagement tier on room change
            if (combatStats) {
                combatStats.engagementTier = EngagementTier.DISENGAGED;
            }

            // Broadcast entering message to new room
            if (npcComp && npcComp.tag === 'turing') {
                NPCUtils.broadcastToRoom(engine, pos.x, pos.y, `<movement>The air grows cold as a man in a sharp charcoal suit enters, his eyes shielded by mirrored Steiner-Optics.</movement>`, messageService);
            } else {
                NPCUtils.broadcastToRoom(engine, pos.x, pos.y, `<movement>${name} has entered from the ${move.reverse}.</movement>`, messageService);
            }
        }
    }
}
