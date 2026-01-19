import { Entity } from '../../ecs/Entity';
import { IEngine } from '../../ecs/IEngine';
import { Position } from '../../components/Position';
import { NPC } from '../../components/NPC';
import { CombatStats } from '../../components/CombatStats';
import { EngagementTier } from '../../types/CombatTypes';
import { WorldQuery } from '../../utils/WorldQuery';
import { MessageService } from '../../services/MessageService';
import { Roundtime } from '../../components/Roundtime';
import { Inventory } from '../../components/Inventory';
import { Weapon } from '../../components/Weapon';
import { Stats } from '../../components/Stats';
import { CombatUtils } from '../combat/CombatUtils';
import { CombatLogger } from '../combat/CombatLogger';

export class NPCCombatHandler {
    static onPlayerMoved(playerId: string, x: number, y: number, engine: IEngine, messageService: MessageService) {
        // Find aggressive NPCs in the new room
        const npcs = WorldQuery.findNPCsAt(engine, x, y);
        for (const npc of npcs) {
            const npcComp = npc.getComponent(NPC);
            const combatStats = npc.getComponent(CombatStats);

            if (npcComp && npcComp.isAggressive && combatStats && !combatStats.targetId) {
                combatStats.isHostile = true;
                combatStats.targetId = playerId;
                combatStats.engagementTier = EngagementTier.DISENGAGED;
                messageService.combat(playerId, `<enemy>${npcComp.typeName} notices you and prepares to attack!</enemy>`);
            }
        }
    }

    static onNPCSpawned(npc: Entity, engine: IEngine, messageService: MessageService) {
        const npcComp = npc.getComponent(NPC);
        const pos = npc.getComponent(Position);
        const combatStats = npc.getComponent(CombatStats);

        if (!npcComp || !pos || !combatStats || !npcComp.isAggressive) return;

        // Immediately detect players in the room
        const players = engine.getEntitiesWithComponent(Position).filter(e => {
            const ePos = e.getComponent(Position);
            return e.hasComponent(CombatStats) && !e.hasComponent(NPC) && ePos?.x === pos.x && ePos?.y === pos.y;
        });

        if (players.length > 0) {
            const target = players[Math.floor(Math.random() * players.length)];
            combatStats.isHostile = true;
            combatStats.targetId = target.id;
            combatStats.engagementTier = EngagementTier.DISENGAGED; // Start at disengaged
            messageService.combat(target.id, `<enemy>${npcComp.typeName} notices you and prepares to attack!</enemy>`);
        }
    }

    static handleNPCCombat(npc: Entity, npcComp: NPC, pos: Position, engine: IEngine, messageService: MessageService, combatSystem: any) {
        const combatStats = npc.getComponent(CombatStats);
        if (!combatStats) return;

        // 1. Detection (if aggressive and no target)
        if (npcComp.isAggressive && !combatStats.targetId) {
            // Find players in the room
            const players = engine.getEntitiesWithComponent(Position).filter(e => {
                const ePos = e.getComponent(Position);
                return e.hasComponent(CombatStats) && !e.hasComponent(NPC) && ePos?.x === pos.x && ePos?.y === pos.y;
            });

            if (players.length > 0) {
                const target = players[Math.floor(Math.random() * players.length)];
                combatStats.isHostile = true;
                combatStats.targetId = target.id;
                combatStats.engagementTier = EngagementTier.DISENGAGED; // Start at disengaged
                messageService.combat(target.id, `<enemy>${npcComp.typeName} notices you and prepares to attack!</enemy>`);
            }
        }

        if (!combatStats.isHostile || !combatStats.targetId) return;

        // 2. Validate Target
        const target = engine.getEntity(combatStats.targetId);
        const targetPos = target?.getComponent(Position);
        if (!target || !targetPos || targetPos.x !== pos.x || targetPos.y !== pos.y) {
            combatStats.isHostile = false;
            combatStats.targetId = null;
            combatStats.engagementTier = EngagementTier.DISENGAGED;
            return;
        }

        // 3. Advancing / Attacking
        const targetCombatStats = target.getComponent(CombatStats);
        if (!targetCombatStats) return;

        // Check if NPC can act (not in Roundtime)
        const rt = npc.getComponent(Roundtime) as any;
        if (rt && rt.secondsRemaining > 0) {
            return;
        }

        // Determine Attack Range based on equipped weapon
        let minAttackTier = EngagementTier.MELEE; // Default: need to be at melee to attack
        const inventory = npc.getComponent(Inventory) as Inventory;
        if (inventory && inventory.rightHand) {
            const weaponEntity = WorldQuery.getEntityById(engine, inventory.rightHand);
            const weapon = weaponEntity?.getComponent(Weapon) as Weapon;
            if (weapon) {
                minAttackTier = weapon.minTier; // Use minTier (closest they need to be)
            }
        }

        const tiers = Object.values(EngagementTier);
        const currentTierIndex = tiers.indexOf(combatStats.engagementTier);
        const minTierIndex = tiers.indexOf(minAttackTier);

        // NPC is at attack range if current tier >= minimum weapon tier
        // AND current tier is not DISENGAGED
        const isAtAttackRange = currentTierIndex >= minTierIndex && combatStats.engagementTier !== EngagementTier.DISENGAGED;

        if (!isAtAttackRange) {
            // Attempt to Advance (15% chance per tick if aggressive)
            if (Math.random() < 0.15) {
                // RNG/Skill Check
                const npcStats = npc.getComponent(Stats) as Stats; // NPCs might not have Stats, fallback to base
                const npcAgility = npcStats?.attributes?.get('AGI')?.value || 10;
                const targetStats = target.getComponent(Stats) as Stats;
                const targetAgility = targetStats?.attributes?.get('AGI')?.value || 10;

                let successChance = 0.5 + (npcAgility - targetAgility) * 0.05;
                if (targetCombatStats.isHangingBack) {
                    successChance -= 0.4; // Hanging back makes it much harder
                }

                if (Math.random() < successChance) {
                    // Advance to next tier
                    const tiers = Object.values(EngagementTier);
                    const currentIndex = tiers.indexOf(combatStats.engagementTier);
                    if (currentIndex < tiers.length - 1) {
                        combatStats.engagementTier = tiers[currentIndex + 1];

                        // Send message to target
                        const targetMsg = `<advance>${npcComp.typeName} advances toward you! (Range: <range>${combatStats.engagementTier}</range>)</advance>`;
                        messageService.combat(target.id, targetMsg);

                        // Send message to other players in the room
                        const playersInRoom = engine.getEntitiesWithComponent(Position).filter(e => {
                            const ePos = e.getComponent(Position);
                            return e.hasComponent(CombatStats) && !e.hasComponent(NPC) &&
                                ePos?.x === pos.x && ePos?.y === pos.y && e.id !== target.id;
                        });

                        for (const observer of playersInRoom) {
                            const observerMsg = `<advance>${npcComp.typeName} advances toward another combatant! (Range: <range>${combatStats.engagementTier}</range>)</advance>`;
                            messageService.combat(observer.id, observerMsg);
                        }

                        // Set mutual engagement for polearm and closer
                        if ([EngagementTier.POLEARM, EngagementTier.MELEE, EngagementTier.CLOSE_QUARTERS].includes(combatStats.engagementTier)) {
                            targetCombatStats.engagementTier = combatStats.engagementTier;
                            messageService.combat(target.id, `<advance>You are now engaged with ${npcComp.typeName} at <range>${combatStats.engagementTier}</range> range!</advance>`);

                            // Trigger combat assessment update
                            CombatLogger.sendCombatState(target.id, engine, combatSystem.io);
                        }

                        // Apply Roundtime for advancing (4 seconds)
                        CombatUtils.applyRoundtime(npc, 4);
                    }
                } else {
                    // Apply Roundtime for failed advance (3 seconds) - prevents spamming
                    CombatUtils.applyRoundtime(npc, 3);

                    if (targetCombatStats.isHangingBack) {
                        messageService.combat(target.id, `<info>You successfully keep ${npcComp.typeName} at bay.</info>`);
                    } else if (Math.random() < 0.1) { // 10% chance to show stalking message if check failed
                        const stalkingMessages = [
                            `${npcComp.typeName} circles you warily, looking for an opening.`,
                            `${npcComp.typeName} crouches low, eyes fixed on you.`,
                            `${npcComp.typeName} inches closer, testing your defenses.`
                        ];
                        const msg = stalkingMessages[Math.floor(Math.random() * stalkingMessages.length)];
                        messageService.combat(target.id, `<advance>${msg}</advance>`);
                    }
                }
            }
        }


        // Attack if at valid attack range for weapon
        if (isAtAttackRange) {
            // Telegraphing logic
            if (!combatStats.currentTelegraph && Math.random() < 0.5) {
                const moves = ['SLASH', 'THRUST', 'DASH'];
                combatStats.currentTelegraph = moves[Math.floor(Math.random() * moves.length)];
                messageService.combat(target.id, `<enemy>${npcComp.typeName} prepares a ${combatStats.currentTelegraph}!</enemy>`);
            }

            if (combatSystem) {
                combatSystem.handleNPCAttack(npc.id, target.id, engine);
            }
        }
    }
}
