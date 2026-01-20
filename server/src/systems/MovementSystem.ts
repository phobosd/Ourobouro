import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Stance, StanceType } from '../components/Stance';
import { CombatStats } from '../components/CombatStats';
import { EngagementTier } from '../types/CombatTypes';
import { Server } from 'socket.io';
import { ObservationSystem } from './ObservationSystem';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';
import { NPC } from '../components/NPC';
import { Description } from '../components/Description';
import { LogoutTimer } from '../components/LogoutTimer';


import { MessageService } from '../services/MessageService';
import { DungeonService } from '../services/DungeonService';
import { GameEventBus, GameEventType } from '../utils/GameEventBus';

export class MovementSystem extends System {
    private pendingMoves: Map<string, { x: number, y: number }>;
    private io: Server;
    private messageService: MessageService;
    private observationSystem?: ObservationSystem;

    constructor(io: Server, messageService: MessageService) {
        super();
        this.pendingMoves = new Map();
        this.io = io;
        this.messageService = messageService;
    }

    setObservationSystem(system: ObservationSystem) {
        this.observationSystem = system;
    }

    // Method to queue a move command from a player
    queueMove(entityId: string, direction: 'n' | 's' | 'e' | 'w') {
        let dx = 0;
        let dy = 0;

        switch (direction) {
            case 'n': dy = -1; break;
            case 's': dy = 1; break;
            case 'e': dx = 1; break;
            case 'w': dx = -1; break;
        }

        this.pendingMoves.set(entityId, { x: dx, y: dy });
    }

    update(engine: IEngine, deltaTime: number): void {
        // Process all pending moves
        for (const [entityId, move] of this.pendingMoves.entries()) {
            const entity = engine.getEntity(entityId);
            if (!entity) continue;

            const pos = entity.getComponent(Position);
            const stance = entity.getComponent(Stance);
            if (!pos) continue;

            if (stance && stance.current !== StanceType.Standing) {
                // Allow movement in Stasis if we are in the Matrix (Persona)
                const isMatrix = pos.x >= 10000;
                if (stance.current === StanceType.Stasis && isMatrix) {
                    // Allow movement
                } else {
                    this.messageService.info(entityId, `You can't move while ${stance.current}!`);
                    continue;
                }
            }

            const combatStats = entity.getComponent(CombatStats);
            if (combatStats) {
                // Check fatigue for movement
                if (combatStats.fatigue < 1) {
                    this.messageService.info(entityId, "You are too exhausted to move!");
                    continue;
                }

                const roomEntities = engine.getEntitiesWithComponent(Position);

                // Check if any hostile entity in the room is engaged with us at close range
                const hostileEngaged = roomEntities.some(e => {
                    if (e.id === entityId) return false;
                    const ePos = e.getComponent(Position);
                    const eStats = e.getComponent(CombatStats);
                    if (ePos?.x === pos.x && ePos?.y === pos.y && eStats?.isHostile) {
                        // If they are at polearm or closer, they are pinning us
                        return [EngagementTier.MELEE, EngagementTier.CLOSE_QUARTERS, EngagementTier.POLEARM].includes(eStats.engagementTier);
                    }
                    return false;
                });

                const playerIsEngaged = [EngagementTier.MELEE, EngagementTier.CLOSE_QUARTERS, EngagementTier.POLEARM].includes(combatStats.engagementTier);

                if (hostileEngaged) {
                    this.messageService.info(entityId, "You are too closely engaged to move away! Retreat first.");
                    continue;
                } else if (playerIsEngaged) {
                    // Auto-disengage if no hostiles are pinning us
                    combatStats.engagementTier = EngagementTier.DISENGAGED;
                }
            }

            const targetX = pos.x + move.x;
            const targetY = pos.y + move.y;

            // Check if target room exists
            const targetRoom = WorldQuery.findRoomAt(engine, targetX, targetY);

            if (targetRoom) {
                const fromX = pos.x;
                const fromY = pos.y;

                // console.log(`[Movement] Player ${entityId} moved to ${targetX}, ${targetY}`);
                pos.x = targetX;
                pos.y = targetY;

                // Cancel logout if active
                if (entity.hasComponent(LogoutTimer)) {
                    entity.removeComponent(LogoutTimer);
                    this.messageService.info(entityId, "Movement detected. Logout canceled.");
                }

                // --- Presence System: Room Management ---
                const oldRoom = `room:${fromX}:${fromY}`;
                const newRoom = `room:${targetX}:${targetY}`;
                const socket = this.io.sockets.sockets.get(entityId);
                const charName = entity.getComponent(Description)?.title || "Someone";

                if (socket) {
                    socket.leave(oldRoom);
                    socket.join(newRoom);
                }

                // Broadcast departure to old room
                let dirName = "";
                if (move.x === 1) dirName = "east";
                else if (move.x === -1) dirName = "west";
                else if (move.y === 1) dirName = "south";
                else if (move.y === -1) dirName = "north";

                this.io.to(oldRoom).emit('message', {
                    type: 'info',
                    content: `${charName} leaves to the ${dirName}.`
                });

                // Broadcast arrival to new room
                let fromDir = "";
                if (move.x === 1) fromDir = "west";
                else if (move.x === -1) fromDir = "east";
                else if (move.y === 1) fromDir = "north";
                else if (move.y === -1) fromDir = "south";

                this.io.to(newRoom).except(entityId).emit('message', {
                    type: 'info',
                    content: `${charName} arrives from the ${fromDir}.`
                });

                // Emit move event
                GameEventBus.getInstance().emit(GameEventType.PLAYER_MOVED, {
                    playerId: entityId,
                    fromX,
                    fromY,
                    toX: targetX,
                    toY: targetY
                });

                // Reset engagement tier on room change
                if (combatStats) {
                    combatStats.engagementTier = EngagementTier.DISENGAGED;
                    combatStats.fatigue = Math.max(0, combatStats.fatigue - 1); // Consume 1 fatigue per move
                }

                // Trigger look
                if (this.observationSystem) {
                    this.observationSystem.handleLook(entityId, engine);
                    this.observationSystem.refreshRoomAutocomplete(fromX, fromY, engine);
                    this.observationSystem.refreshRoomAutocomplete(targetX, targetY, engine);
                }

                // Emit position update for mini-map refresh
                this.io.to(entityId).emit('position-update');

                // Check for aggressive NPCs in the new room
                const npcsInRoom = WorldQuery.findNPCsAt(engine, targetX, targetY);
                for (const npc of npcsInRoom) {
                    const npcComp = npc.getComponent(NPC);
                    const npcCombat = npc.getComponent(CombatStats);

                    if (!npcComp || !npcCombat) continue;

                    // Reset engagement tier for ALL NPCs when player enters (ensures fresh encounters)
                    if (npcCombat.targetId === entityId) {
                        // console.log(`[Movement] Resetting ${npcComp.typeName} (${npc.id}) engagement tier for returning player`);
                        npcCombat.engagementTier = EngagementTier.DISENGAGED;
                    }

                    // If NPC is aggressive and doesn't have a target, make it detect the player
                    if (npcComp.isAggressive && !npcCombat.targetId) {
                        npcCombat.isHostile = true;
                        npcCombat.targetId = entityId;
                        npcCombat.engagementTier = EngagementTier.DISENGAGED; // Start at disengaged
                        // console.log(`[Movement] ${npcComp.typeName} (${npc.id}) detected player ${entityId} entering room`);
                        this.messageService.combat(entityId, `<enemy>${npcComp.typeName} notices you and prepares to attack!</enemy>`);
                    }
                }

                // Mark visited for Dungeon Fog of War
                DungeonService.getInstance()?.markVisited(entityId, targetX, targetY);
            } else {
                this.messageService.info(entityId, "You can't go that way.");
            }
        }

        // Clear processed moves
        this.pendingMoves.clear();
    }
}
