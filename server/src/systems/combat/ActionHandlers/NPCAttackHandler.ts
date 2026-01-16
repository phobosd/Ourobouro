import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { Server } from 'socket.io';
import { CombatStats } from '../../../components/CombatStats';
import { Weapon } from '../../../components/Weapon';
import { Inventory } from '../../../components/Inventory';
import { Position } from '../../../components/Position';
import { NPC } from '../../../components/NPC';
import { BodyPart, EngagementTier } from '../../../types/CombatTypes';
import { CombatBuffer, CombatActionType } from '../../../components/CombatBuffer';
import { Momentum } from '../../../components/Momentum';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { CombatUtils } from '../CombatUtils';
import { CombatCalculator } from '../CombatCalculator';
import { CombatLogger } from '../CombatLogger';
import { WoundManager } from '../WoundManager';
import { SequenceHandler } from './SequenceHandler';

export class NPCAttackHandler {
    static handleNPCAttack(npcId: string, targetId: string, engine: IEngine, messageService: MessageService, io: Server): void {
        const npc = WorldQuery.getEntityById(engine, npcId);
        const target = WorldQuery.getEntityById(engine, targetId);
        if (!npc || !target) return;

        const npcComp = npc.getComponent(NPC);
        const npcStats = npc.getComponent(CombatStats);
        const targetStats = target.getComponent(CombatStats);
        const npcPos = npc.getComponent(Position);
        if (!npcStats || !targetStats || !npcPos) return;

        const inventory = npc.getComponent(Inventory);
        let weaponCategory = 'natural';
        let isRanged = false;
        let weaponEntity: Entity | undefined;
        if (inventory && inventory.rightHand) {
            weaponEntity = WorldQuery.getEntityById(engine, inventory.rightHand);
            const weapon = weaponEntity?.getComponent(Weapon);
            if (weapon) {
                weaponCategory = weapon.category;
                isRanged = weapon.range > 0;
            }
        }

        // Auto-update target engagement if they are disengaged
        if (targetStats.engagementTier === EngagementTier.DISENGAGED) {
            targetStats.engagementTier = isRanged ? EngagementTier.MISSILE : EngagementTier.MELEE;
        }

        if (!CombatUtils.checkRoundtime(npc, messageService, true)) return;

        const attackerPower = npcStats.attack + (npcStats.balance * 20) + (Math.random() * 5);
        const defenderPower = CombatCalculator.calculateDefenderPower(target, engine, isRanged ? 'RANGED' : 'MELEE');

        const margin = attackerPower - defenderPower;
        let effectiveHitType = CombatCalculator.determineHitType(margin);

        const targetBuffer = target.getComponent(CombatBuffer);
        if (targetStats.isParrying) {
            if (effectiveHitType === 'crushing') effectiveHitType = 'solid';
            else if (effectiveHitType === 'solid') effectiveHitType = 'marginal';
            else if (effectiveHitType === 'marginal') effectiveHitType = 'miss';

            if (targetBuffer) {
                messageService.success(targetId, `\n[ACTIVE PARRY] You deflected the blow!`);
                SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);
            }
            targetStats.isParrying = false; // Reset after one use
            targetStats.parry = targetStats.baseParry; // Reset to stance value
        }

        let combatLog = `\n<combat><error>${npcComp?.typeName || 'The enemy'}</error> attacks you!\n`;
        let observerLog = `\n<combat><error>${npcComp?.typeName || 'The enemy'}</error> attacks another combatant!\n`;

        const flavor = CombatLogger.getAttackFlavor(weaponCategory, effectiveHitType);

        if (targetBuffer && targetBuffer.isExecuting && (effectiveHitType === 'solid' || effectiveHitType === 'crushing')) {
            if (Math.random() < (effectiveHitType === 'crushing' ? 0.7 : 0.3)) {
                targetBuffer.actions = targetBuffer.actions.map(a => ({ type: CombatActionType.STUMBLE, targetId: a.targetId }));
                combatLog += `\n<error>[SYSTEM SHOCK] Your combat sequence has been SCRAMBLED!</error>`;
            }
        }

        switch (effectiveHitType) {
            case 'crushing':
                const crushingDamage = Math.floor(npcStats.attack * 1.5);
                targetStats.hp -= crushingDamage;
                npcStats.balance = Math.min(1.0, npcStats.balance + 0.1);
                targetStats.balance = Math.max(0.0, targetStats.balance - 0.3);
                combatLog += `<combat-hit>${flavor.hitLabel} ${npcComp?.typeName} ${flavor.npcAction}! You take ${crushingDamage} damage!</combat-hit>\n`;

                const npcName = npcComp?.typeName || 'The enemy';
                combatLog += CombatLogger.getNPCCriticalHitFlavor(npcName);
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                combatLog += WoundManager.applyWoundToTarget(target, BodyPart.Chest, 5);
                break;
            case 'solid':
                const solidDamage = Math.floor(npcStats.attack * 0.8);
                targetStats.hp -= solidDamage;
                npcStats.balance = Math.min(1.0, npcStats.balance + 0.08);
                targetStats.balance = Math.max(0.0, targetStats.balance - 0.15);
                combatLog += `<combat-hit>${flavor.hitLabel} ${npcComp?.typeName} ${flavor.npcAction}! You take ${solidDamage} damage!</combat-hit>\n`;
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                break;
            case 'marginal':
                const marginalDamage = Math.floor(npcStats.attack * 0.3);
                targetStats.hp -= marginalDamage;
                targetStats.balance = Math.max(0.0, targetStats.balance - 0.05);

                if (targetStats.parry > 50 && !isRanged) {
                    combatLog += `<combat-hit>[PARRY] You partially deflect ${npcComp?.typeName}'s attack! You take ${marginalDamage} damage.</combat-hit>\n`;
                    if (targetBuffer) SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);

                    let momentum = target.getComponent(Momentum);
                    if (!momentum && target.getComponent(Inventory)?.rightHand) {
                        const weaponEntity = WorldQuery.getEntityById(engine, target.getComponent(Inventory)!.rightHand!);
                        const weaponName = weaponEntity?.getComponent(Weapon)?.name.toLowerCase() || '';
                        if (weaponName.includes('katana') || weaponName.includes('kitana') || weaponName.includes('samurai')) {
                            momentum = new Momentum();
                            target.addComponent(momentum);
                        }
                    }
                    if (momentum) {
                        momentum.add(5);
                        combatLog += `\n<success>[MOMENTUM] Defensive parry builds your flow! (+5)</success>`;
                    }
                    targetStats.balance = Math.min(1.0, targetStats.balance + 0.05);

                } else if (targetStats.shield > 50) {
                    combatLog += `<combat-hit>[BLOCK] You catch most of ${npcComp?.typeName}'s attack on your shield! You take ${marginalDamage} damage.</combat-hit>\n`;
                    if (targetBuffer) SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);

                    const momentum = target.getComponent(Momentum);
                    if (momentum) {
                        momentum.add(2);
                        combatLog += `\n<success>[MOMENTUM] Shield block maintains your presence. (+2)</success>`;
                    }
                    targetStats.balance = Math.min(1.0, targetStats.balance + 0.05);
                } else {
                    combatLog += `<combat-hit>${flavor.hitLabel} ${npcComp?.typeName} ${flavor.npcAction}. You take ${marginalDamage} damage.</combat-hit>\n`;
                }
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                break;
            case 'miss':
                if (targetStats.parry > 50 && !isRanged) {
                    combatLog += `<combat-miss>[PARRY] You parry ${npcComp?.typeName}'s attack with your weapon!</combat-miss>\n`;
                    if (targetBuffer) SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);

                    let momentum = target.getComponent(Momentum);
                    if (!momentum && target.getComponent(Inventory)?.rightHand) {
                        const weaponEntity = WorldQuery.getEntityById(engine, target.getComponent(Inventory)!.rightHand!);
                        const weaponName = weaponEntity?.getComponent(Weapon)?.name.toLowerCase() || '';
                        if (weaponName.includes('katana') || weaponName.includes('kitana') || weaponName.includes('samurai')) {
                            momentum = new Momentum();
                            target.addComponent(momentum);
                        }
                    }
                    if (momentum) {
                        momentum.add(10);
                        combatLog += `\n<success>[MOMENTUM] Perfect parry! Your flow surges! (+10)</success>`;
                    }
                    targetStats.balance = Math.min(1.0, targetStats.balance + 0.05);

                } else if (targetStats.evasion > 50) {
                    combatLog += `<combat-miss>[EVADE] You skillfully dodge ${npcComp?.typeName}'s attack!</combat-miss>\n`;
                    if (targetBuffer) SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);

                    const momentum = target.getComponent(Momentum);
                    if (momentum) {
                        momentum.add(5);
                        combatLog += `\n<success>[MOMENTUM] Evasion keeps you in the flow. (+5)</success>`;
                    }
                    targetStats.balance = Math.min(1.0, targetStats.balance + 0.05);

                } else if (targetStats.shield > 50) {
                    combatLog += `<combat-miss>[BLOCK] You block ${npcComp?.typeName}'s attack with your shield!</combat-miss>\n`;
                    if (targetBuffer) SequenceHandler.gainFlow(targetId, targetBuffer, messageService, io);

                    const momentum = target.getComponent(Momentum);
                    if (momentum) {
                        momentum.add(5);
                        combatLog += `\n<success>[MOMENTUM] Solid block! (+5)</success>`;
                    }
                    targetStats.balance = Math.min(1.0, targetStats.balance + 0.05);

                } else {
                    combatLog += `<combat-miss>${flavor.hitLabel} ${npcComp?.typeName} ${flavor.npcAction}!</combat-miss>\n`;
                }
                observerLog += `<combat-miss>${flavor.obsLabel}</combat-miss>\n`;
                npcStats.balance = Math.max(0.0, npcStats.balance - 0.1);
                break;
        }

        combatLog += `</combat>`;
        observerLog += `</combat>`;
        messageService.combat(targetId, combatLog);

        const playersInRoom = engine.getEntitiesWithComponent(Position).filter(e => {
            const ePos = e.getComponent(Position);
            return e.hasComponent(CombatStats) && !e.hasComponent(NPC) && ePos?.x === npcPos.x && ePos?.y === npcPos.y && e.id !== targetId;
        });
        for (const observer of playersInRoom) messageService.combat(observer.id, observerLog);

        CombatUtils.applyRoundtime(npc, 4);
    }
}
