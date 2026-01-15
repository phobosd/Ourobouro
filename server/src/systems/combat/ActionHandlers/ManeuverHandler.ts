import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { CombatStats } from '../../../components/CombatStats';
import { Stats } from '../../../components/Stats';
import { Stance, StanceType } from '../../../components/Stance';
import { IsPersona } from '../../../components/IsPersona';
import { NPC } from '../../../components/NPC';
import { Position } from '../../../components/Position';
import { EngagementTier } from '../../../types/CombatTypes';
import { AutomatedAction } from '../../../components/AutomatedAction';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { CombatUtils } from '../CombatUtils';
import { Server } from 'socket.io';
import { CombatLogger } from '../CombatLogger';

export class ManeuverHandler {
    static handleManeuver(playerId: string, direction: 'CLOSE' | 'WITHDRAW', engine: IEngine, messageService: MessageService, io: Server, targetName?: string): void {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        if (!CombatUtils.checkRoundtime(player, messageService)) return;

        // Find target logic
        const roomEntities = engine.getEntitiesWithComponent(NPC);
        let target: Entity | undefined;

        if (targetName) {
            target = roomEntities.find(e => {
                const pos = e.getComponent(Position);
                const pPos = player.getComponent(Position);
                const npc = e.getComponent(NPC);
                return pos?.x === pPos?.x && pos?.y === pPos?.y &&
                    npc?.typeName.toLowerCase().includes(targetName.toLowerCase());
            });
        } else {
            const stats = player.getComponent(CombatStats);
            target = roomEntities.find(e => {
                const pos = e.getComponent(Position);
                const pPos = player.getComponent(Position);
                const tStats = e.getComponent(CombatStats);
                return pos?.x === pPos?.x && pos?.y === pPos?.y && tStats?.engagementTier === stats?.engagementTier && stats?.engagementTier !== EngagementTier.DISENGAGED;
            });
            if (!target) {
                target = roomEntities.find(e => {
                    const pos = e.getComponent(Position);
                    const pPos = player.getComponent(Position);
                    return pos?.x === pPos?.x && pos?.y === pPos?.y;
                });
            }
        }

        if (!target) {
            messageService.info(playerId, "There is no one to maneuver against!");
            return;
        }

        this.performManeuver(player, target, direction, engine, messageService, io);
    }

    static performManeuver(player: Entity, target: Entity, direction: 'CLOSE' | 'WITHDRAW', engine: IEngine, messageService: MessageService, io: Server): 'SUCCESS' | 'FAILURE' | 'MAX_RANGE' | 'FAIL_STOP' {
        const stats = player.getComponent(CombatStats);
        const playerStats = player.getComponent(Stats);
        const stance = player.getComponent(Stance);
        const playerId = player.id;

        if (!stats || !playerStats) return 'FAIL_STOP';

        if (stance && stance.current !== StanceType.Standing) {
            const isPersona = player.hasComponent(IsPersona);
            if (!(stance.current === StanceType.Stasis && isPersona)) {
                messageService.info(playerId, `You must be standing to maneuver!`);
                return 'FAIL_STOP';
            }
        }

        if (stats.fatigue < 10) {
            messageService.info(playerId, "You are too exhausted to maneuver!");
            return 'FAIL_STOP';
        }

        const tiers = Object.values(EngagementTier);
        const targetCombatStats = target.getComponent(CombatStats);
        const playerTierIndex = tiers.indexOf(stats.engagementTier);
        const targetTierIndex = targetCombatStats ? tiers.indexOf(targetCombatStats.engagementTier) : 0;
        const effectiveTierIndex = Math.max(playerTierIndex, targetTierIndex);

        if (direction === 'CLOSE') {
            if (effectiveTierIndex >= tiers.length - 1) {
                messageService.info(playerId, "You are already as close as possible!");
                return 'MAX_RANGE';
            }
        } else {
            if (effectiveTierIndex <= 0) {
                messageService.info(playerId, "You cannot withdraw any further!");
                return 'MAX_RANGE';
            }
        }

        stats.fatigue -= 10;

        const targetStats = target.getComponent(Stats);
        const playerAgility = playerStats.attributes.get('AGI')?.value || 10;
        const targetAgility = targetStats?.attributes?.get('AGI')?.value || 10;

        const roomEntities = engine.getEntitiesWithComponent(NPC);
        const enemyCount = roomEntities.filter(e => {
            const ePos = e.getComponent(Position);
            const pPos = player.getComponent(Position);
            return ePos?.x === pPos?.x && ePos?.y === pPos?.y;
        }).length;

        const multiEnemyPenalty = Math.max(0, (enemyCount - 1) * 15);
        const playerRoll = playerAgility + Math.random() * 100 - multiEnemyPenalty;
        const targetRoll = targetAgility + Math.random() * 100;

        if (direction === 'CLOSE' && targetCombatStats?.isHangingBack) {
            messageService.info(playerId, `${target.getComponent(NPC)?.typeName} is hanging back, trying to keep distance!`);
        }

        if (playerRoll > targetRoll) {
            if (direction === 'CLOSE') {
                if (effectiveTierIndex < tiers.length - 1) {
                    stats.engagementTier = tiers[effectiveTierIndex + 1];
                    if (targetCombatStats) targetCombatStats.engagementTier = stats.engagementTier;
                    messageService.info(playerId, `You rush forward, weaving past ${target.getComponent(NPC)?.typeName}'s guard! Engagement: <range>${stats.engagementTier}</range>`);
                    messageService.combat(target.id, `${player.id} rushes at you! Engagement: <range>${stats.engagementTier}</range>`);

                    // Notify observers
                    const playerPos = player.getComponent(Position);
                    if (playerPos) {
                        const playersInRoom = engine.getEntitiesWithComponent(Position).filter(e => {
                            const ePos = e.getComponent(Position);
                            return e.hasComponent(CombatStats) && !e.hasComponent(NPC) &&
                                ePos?.x === playerPos.x && ePos?.y === playerPos.y && e.id !== playerId && e.id !== target.id;
                        });

                        for (const observer of playersInRoom) {
                            messageService.combat(observer.id, `<advance>A combatant rushes at ${target.getComponent(NPC)?.typeName}! (Range: <range>${stats.engagementTier}</range>)</advance>`);
                        }
                    }

                    // Force UI update
                    if (!player.hasComponent(NPC)) CombatLogger.sendCombatState(player.id, engine, io);
                    if (!target.hasComponent(NPC)) CombatLogger.sendCombatState(target.id, engine, io);

                    CombatUtils.applyRoundtime(player, 1);
                    if (effectiveTierIndex + 1 === tiers.length - 1) return 'MAX_RANGE';
                    return 'SUCCESS';
                }
            } else {
                if (effectiveTierIndex > 0) {
                    stats.engagementTier = tiers[effectiveTierIndex - 1];
                    if (targetCombatStats) targetCombatStats.engagementTier = stats.engagementTier;
                    messageService.info(playerId, `You scramble back, putting distance between you and ${target.getComponent(NPC)?.typeName}. Engagement: <range>${stats.engagementTier}</range>`);
                    messageService.combat(target.id, `${player.id} retreats! Engagement: <range>${stats.engagementTier}</range>`);

                    // Notify observers
                    const playerPos = player.getComponent(Position);
                    if (playerPos) {
                        const playersInRoom = engine.getEntitiesWithComponent(Position).filter(e => {
                            const ePos = e.getComponent(Position);
                            return e.hasComponent(CombatStats) && !e.hasComponent(NPC) &&
                                ePos?.x === playerPos.x && ePos?.y === playerPos.y && e.id !== playerId && e.id !== target.id;
                        });

                        for (const observer of playersInRoom) {
                            messageService.combat(observer.id, `<advance>A combatant retreats from ${target.getComponent(NPC)?.typeName}! (Range: <range>${stats.engagementTier}</range>)</advance>`);
                        }
                    }

                    // Force UI update
                    if (!player.hasComponent(NPC)) CombatLogger.sendCombatState(player.id, engine, io);
                    if (!target.hasComponent(NPC)) CombatLogger.sendCombatState(target.id, engine, io);

                    CombatUtils.applyRoundtime(player, 1);
                    if (effectiveTierIndex - 1 === 0) return 'MAX_RANGE';
                    return 'SUCCESS';
                }
            }
        } else {
            if (direction === 'CLOSE' && targetCombatStats?.isHangingBack) {
                messageService.info(playerId, `${target.getComponent(NPC)?.typeName} successfully hangs back, preventing you from closing!`);
            } else {
                messageService.info(playerId, `You try to maneuver, but ${target.getComponent(NPC)?.typeName} keeps you at bay!`);
            }
            CombatUtils.applyRoundtime(player, 1);
            return 'FAILURE';
        }
        return 'FAILURE';
    }

    static handleAdvance(playerId: string, targetName: string, engine: IEngine, messageService: MessageService, io: Server) {
        this.initiateAutomatedManeuver(playerId, targetName, 'ADVANCE', engine, messageService, io);
    }

    static handleRetreat(playerId: string, targetName: string, engine: IEngine, messageService: MessageService, io: Server) {
        this.initiateAutomatedManeuver(playerId, targetName, 'RETREAT', engine, messageService, io);
    }

    static handleFlee(playerId: string, direction: string | undefined, engine: IEngine, messageService: MessageService): void {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        const stats = player.getComponent(CombatStats);
        if (!stats) return;

        // Reset engagement to allow movement
        stats.engagementTier = EngagementTier.DISENGAGED;
        stats.targetId = null;

        if (direction) {
            messageService.info(playerId, `You turn and flee to the ${direction}!`);
        } else {
            messageService.info(playerId, "You turn and flee from the combat!");
        }
    }

    private static initiateAutomatedManeuver(playerId: string, targetName: string, type: 'ADVANCE' | 'RETREAT', engine: IEngine, messageService: MessageService, io: Server) {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        const roomEntities = engine.getEntitiesWithComponent(NPC);
        let target: Entity | undefined;

        if (targetName) {
            const { name: parsedName, ordinal } = CombatUtils.parseTargetName(targetName);
            const matchingNPCs = roomEntities.filter(e => {
                const pos = e.getComponent(Position);
                const pPos = player.getComponent(Position);
                const npc = e.getComponent(NPC);
                return pos?.x === pPos?.x && pos?.y === pPos?.y &&
                    npc?.typeName.toLowerCase().includes(parsedName.toLowerCase());
            });
            target = matchingNPCs[ordinal - 1];
        } else {
            const stats = player.getComponent(CombatStats);
            const tiers = Object.values(EngagementTier);

            const nearbyEnemies = roomEntities.filter(e => {
                const pos = e.getComponent(Position);
                const pPos = player.getComponent(Position);
                return pos?.x === pPos?.x && pos?.y === pPos?.y;
            }).sort((a, b) => {
                const aTier = a.getComponent(CombatStats)?.engagementTier || EngagementTier.DISENGAGED;
                const bTier = b.getComponent(CombatStats)?.engagementTier || EngagementTier.DISENGAGED;
                return tiers.indexOf(bTier) - tiers.indexOf(aTier);
            });

            if (type === 'RETREAT') {
                target = nearbyEnemies[0];
            } else {
                target = nearbyEnemies.find(e => {
                    const tStats = e.getComponent(CombatStats);
                    return tStats?.engagementTier === stats?.engagementTier && stats?.engagementTier !== EngagementTier.DISENGAGED;
                }) || nearbyEnemies[0];
            }
        }

        if (!target) {
            messageService.info(playerId, "You don't see them here.");
            return;
        }

        player.addComponent(new AutomatedAction(type, target.id));
        messageService.info(playerId, `You begin to ${type.toLowerCase()} on ${target.getComponent(NPC)?.typeName}...`);

        if (CombatUtils.checkRoundtime(player, messageService, true)) {
            const result = this.performManeuver(player, target, type === 'ADVANCE' ? 'CLOSE' : 'WITHDRAW', engine, messageService, io);

            // If we just reached MELEE range via ADVANCE, stop there
            const stats = player.getComponent(CombatStats);
            if (type === 'ADVANCE' && stats?.engagementTier === EngagementTier.MELEE) {
                player.removeComponent(AutomatedAction);
                messageService.info(playerId, "You reach melee range and stop advancing.");
                return;
            }

            if (result === 'MAX_RANGE' || result === 'FAIL_STOP') {
                player.removeComponent(AutomatedAction);
            }
        }
    }
}
