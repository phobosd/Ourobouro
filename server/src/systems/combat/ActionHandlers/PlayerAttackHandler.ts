import { Entity } from '../../../ecs/Entity';
import { IEngine } from '../../../ecs/IEngine';
import { Server } from 'socket.io';
import { CombatStats } from '../../../components/CombatStats';
import { Stats } from '../../../components/Stats';
import { Weapon } from '../../../components/Weapon';
import { Inventory } from '../../../components/Inventory';
import { Position } from '../../../components/Position';
import { NPC } from '../../../components/NPC';
import { BodyPart, EngagementTier } from '../../../types/CombatTypes';
import { CombatBuffer, CombatActionType } from '../../../components/CombatBuffer';
import { Momentum } from '../../../components/Momentum';
import { Item } from '../../../components/Item';
import { Loot } from '../../../components/Loot';
import { Stance, StanceType } from '../../../components/Stance';
import { IsPersona } from '../../../components/IsPersona';
import { WorldQuery } from '../../../utils/WorldQuery';
import { MessageService } from '../../../services/MessageService';
import { PrefabFactory } from '../../../factories/PrefabFactory';
import { ItemRegistry } from '../../../services/ItemRegistry';
import { DungeonService } from '../../../services/DungeonService';
import { CombatUtils } from '../CombatUtils';
import { CombatCalculator } from '../CombatCalculator';
import { CombatLogger } from '../CombatLogger';
import { WoundManager } from '../WoundManager';
import { SequenceHandler } from './SequenceHandler';
import { ReloadHandler } from './ReloadHandler';
import { HealthDescriptor } from '../../../utils/HealthDescriptor';

export class PlayerAttackHandler {
    private static ordinalNames = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

    static handleAttack(attackerId: string, targetName: string, engine: IEngine, messageService: MessageService, io: Server, moveType?: string): void {
        const attacker = WorldQuery.getEntityById(engine, attackerId);
        if (!attacker) return;

        if (!CombatUtils.checkRoundtime(attacker, messageService)) return;

        const combatStats = attacker.getComponent(CombatStats);
        if (combatStats) {
            if (combatStats.fatigue < 4) {
                messageService.info(attackerId, "You are too exhausted to attack!");
                return;
            }
            combatStats.fatigue -= 4;
            combatStats.pendingMove = moveType || 'attack';
        }

        // Turing Police Special Ability: Command_Shutdown
        const npcComp = attacker.getComponent(NPC);
        if (npcComp && npcComp.tag === 'turing' && Math.random() < 0.2) {
            const targetEntity = engine.getEntitiesWithComponent(CombatStats).find(e => {
                const pos = e.getComponent(Position);
                const pPos = attacker.getComponent(Position);
                return !e.hasComponent(NPC) && pos?.x === pPos?.x && pos?.y === pPos?.y;
            });

            if (targetEntity) {
                messageService.combat(targetEntity.id, `\n[COMBAT] ${npcComp.typeName} points a device at you and initiates COMMAND_SHUTDOWN!`);
                CombatUtils.applyRoundtime(targetEntity, 10);
                messageService.system(targetEntity.id, "[SYSTEM] MOTOR FUNCTIONS SUSPENDED. REBOOTING...");
                return;
            }
        }

        const attackerPos = attacker.getComponent(Position);
        const stance = attacker.getComponent(Stance);
        if (!attackerPos) {
            messageService.info(attackerId, "You don't have a position.");
            return;
        }

        if (stance && stance.current !== StanceType.Standing) {
            const isPersona = attacker.hasComponent(IsPersona);
            if (!(stance.current === StanceType.Stasis && isPersona)) {
                messageService.info(attackerId, `You can't attack while ${stance.current}!`);
                return;
            }
        }

        let target: Entity | undefined;
        let parsedName = "";
        let ordinal = 1;

        if (!targetName) {
            if (combatStats && combatStats.targetId) {
                const lockedTarget = WorldQuery.getEntityById(engine, combatStats.targetId);
                const lockedPos = lockedTarget?.getComponent(Position);
                if (lockedTarget && lockedPos && lockedPos.x === attackerPos.x && lockedPos.y === attackerPos.y) {
                    target = lockedTarget;
                }
            }

            if (!target) {
                const roomNPCs = WorldQuery.findNPCsAt(engine, attackerPos.x, attackerPos.y);
                if (roomNPCs.length === 1) {
                    target = roomNPCs[0];
                } else if (roomNPCs.length > 1) {
                    messageService.info(attackerId, "There are multiple targets here. Which one do you want to attack?");
                    return;
                }
            }

            if (!target) {
                messageService.info(attackerId, "Attack who?");
                return;
            }
        } else {
            const result = CombatUtils.parseTargetName(targetName);
            parsedName = result.name;
            ordinal = result.ordinal;

            const roomNPCs = engine.getEntitiesWithComponent(NPC).filter(e => {
                const npc = e.getComponent(NPC);
                const pos = e.getComponent(Position);
                return npc && pos && npc.typeName.toLowerCase().includes(parsedName.toLowerCase()) &&
                    pos.x === attackerPos.x && pos.y === attackerPos.y;
            });

            if (roomNPCs.length === 0) {
                messageService.info(attackerId, `You don't see "${targetName}" here.`);
                return;
            }

            target = roomNPCs[ordinal - 1];

            if (!target) {
                messageService.info(attackerId, `There is no ${ordinal > 1 ? this.ordinalNames[ordinal - 1] || ordinal : ''} "${parsedName}" here.`);
                return;
            }
        }

        const targetNPC = target.getComponent(NPC);
        const targetCombatStats = target.getComponent(CombatStats);

        if (!targetCombatStats) {
            messageService.info(attackerId, `You can't attack ${targetNPC?.typeName || 'that'}.`);
            return;
        }

        targetCombatStats.isHostile = true;

        const attackerInventory = attacker.getComponent(Inventory);
        const attackerStats = attacker.getComponent(Stats);

        if (!attackerInventory || !attackerStats || !combatStats) {
            messageService.info(attackerId, "You're not ready for combat.");
            return;
        }

        let weapon: Weapon | undefined;
        if (attackerInventory.rightHand) {
            const weaponEntity = WorldQuery.getEntityById(engine, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (moveType) {
            const move = moveType.toLowerCase();
            if (['punch', 'jab', 'uppercut', 'headbutt'].includes(move)) {
                if (weapon) {
                    messageService.info(attackerId, "You can't brawl while holding a weapon!");
                    return;
                }
                weapon = CombatCalculator.createBrawlingWeapon(move);
            } else if (move === 'slash' || move === 'slice' || move === 'thrust') {
                if (!weapon) {
                    messageService.info(attackerId, `You need a weapon to ${move}!`);
                    return;
                }
                const categories = move === 'thrust' ? ['blade', 'sword', 'katana', 'knife', 'spear', 'dagger'] : ['blade', 'sword', 'katana', 'machete', 'axe', 'knife'];
                const canDoMove = categories.some(t => weapon?.category.includes(t));
                if (!canDoMove) {
                    messageService.info(attackerId, `You can't ${move} with a ${weapon.name}.`);
                    return;
                }
            }
        }

        if (!weapon) {
            messageService.info(attackerId, "You need a weapon in your right hand to attack!");
            return;
        }

        if (weapon.range > 0 && weapon.ammoType && weapon.ammoType !== 'none' && weapon.currentAmmo <= 0) {
            messageService.info(attackerId, `Your ${weapon.name} is out of ammo!`);
            return;
        }

        const agility = attackerStats.attributes.get('AGI')?.value || 10;
        let skillName = 'Melee Combat';
        if (weapon.category === 'brawling') skillName = 'Brawling';
        else if (weapon.name.toLowerCase().includes('katana')) skillName = 'Kenjutsu';
        else if (weapon.range > 0) skillName = 'Marksmanship (Light)';

        const skillLevel = attackerStats.skills.get(skillName)?.level || 1;

        const critZoneSize = Math.floor(weapon.difficulty.zoneSize + (agility - 10) / 5);
        const cursorSpeed = weapon.difficulty.speed * (1 - (skillLevel * 0.05));

        const tiers = Object.values(EngagementTier);

        // Auto-engage for ranged weapons if currently disengaged
        if (combatStats.engagementTier === EngagementTier.DISENGAGED && weapon.range > 0) {
            combatStats.engagementTier = EngagementTier.MISSILE;
            messageService.info(attackerId, `You raise your ${weapon.name} and engage at missile range.`);
        }

        const targetTierIndex = tiers.indexOf(targetCombatStats.engagementTier);
        const attackerTierIndex = tiers.indexOf(combatStats.engagementTier);
        const effectiveTierIndex = Math.max(attackerTierIndex, targetTierIndex);
        const effectiveTier = tiers[effectiveTierIndex];

        const minTierIndex = tiers.indexOf(weapon.minTier);
        const maxTierIndex = tiers.indexOf(weapon.maxTier);

        if (effectiveTierIndex < minTierIndex || effectiveTierIndex > maxTierIndex) {
            messageService.info(attackerId, `Your ${weapon.name} is not effective at ${effectiveTier} range! You need to advance.`);
            return;
        }

        if (effectiveTierIndex > attackerTierIndex) {
            combatStats.engagementTier = effectiveTier;
            messageService.info(attackerId, `You engage the ${targetNPC?.typeName} at ${effectiveTier} range.`);
        }

        io.to(attackerId).emit('combat-sync', {
            targetId: target.id,
            targetName: targetNPC?.typeName || 'Target',
            weaponName: weapon.name,
            syncBar: {
                speed: cursorSpeed,
                critZoneSize: critZoneSize,
                jitter: weapon.difficulty.jitter,
                barLength: 20
            }
        });

        const rt = moveType === 'slice' ? 2 : (weapon.roundtime || 3);
        CombatUtils.applyRoundtime(attacker, rt);
    }

    static handleImmediateParry(playerId: string, engine: IEngine, messageService: MessageService): void {
        const player = WorldQuery.getEntityById(engine, playerId);
        if (!player) return;

        if (!CombatUtils.checkRoundtime(player, messageService)) return;

        const combatStats = player.getComponent(CombatStats);
        if (!combatStats) return;

        // Check if holding a melee weapon
        const inventory = player.getComponent(Inventory);
        if (!inventory || !inventory.rightHand) {
            messageService.info(playerId, "You need a weapon to parry!");
            return;
        }
        const weaponEntity = WorldQuery.getEntityById(engine, inventory.rightHand);
        const weapon = weaponEntity?.getComponent(Weapon);
        if (!weapon || weapon.range > 0) {
            messageService.info(playerId, "You can't parry with that!");
            return;
        }

        combatStats.parry = Math.min(120, combatStats.parry + 20);
        combatStats.isParrying = true; // Open active parry window
        messageService.combat(playerId, "You assume a defensive parrying stance!");
        CombatUtils.applyRoundtime(player, 2); // 2s RT for immediate parry
    }

    static handleSyncResult(attackerId: string, targetId: string, hitType: 'crit' | 'hit' | 'miss', engine: IEngine, messageService: MessageService, io: Server, damageMultiplier: number = 1.0, moveType?: string): void {
        const attacker = WorldQuery.getEntityById(engine, attackerId);
        const target = WorldQuery.getEntityById(engine, targetId);
        if (!attacker || !target) return;

        const targetNPC = target.getComponent(NPC);
        const targetCombatStats = target.getComponent(CombatStats);
        const attackerCombatStats = attacker.getComponent(CombatStats);
        const attackerInventory = attacker.getComponent(Inventory);
        const attackerStats = attacker.getComponent(Stats);

        if (!targetCombatStats || !attackerCombatStats || !attackerInventory || !attackerStats) return;

        const effectiveMoveType = moveType || attackerCombatStats.pendingMove || 'attack';
        attackerCombatStats.pendingMove = null;

        if (!attackerCombatStats.targetId) attackerCombatStats.targetId = targetId;
        if (!targetCombatStats.isHostile) {
            targetCombatStats.isHostile = true;
            targetCombatStats.targetId = attackerId;
            messageService.combat(attackerId, `<error>${targetNPC?.typeName || 'The target'} becomes hostile!</error>`);
        }

        let weapon: Weapon | undefined;
        if (attackerInventory.rightHand) {
            const weaponEntity = WorldQuery.getEntityById(engine, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon) {
            weapon = CombatCalculator.createBrawlingWeapon('punch');
        }

        let skillName = 'Melee Combat';
        if (weapon.category === 'brawling') skillName = 'Brawling';
        else if (weapon.name.toLowerCase().includes('katana')) skillName = 'Kenjutsu';
        else if (weapon.range > 0) skillName = 'Marksmanship (Light)';

        const attackType = weapon.range > 0 ? 'RANGED' : 'MELEE';
        const attackerPower = CombatCalculator.calculateAttackerPower(attacker, weapon, skillName);
        const defenderPower = CombatCalculator.calculateDefenderPower(target, engine, attackType);

        let margin = attackerPower - defenderPower;
        let combatLog = `\n<combat>You attack <error>${targetNPC?.typeName || 'the target'}</error> with your ${weapon.name}!\n`;
        let observerLog = `\n<combat>A combatant attacks ${targetNPC?.typeName || 'the target'} with their ${weapon.name}!\n`;

        let effectiveHitType: any = 'miss';
        if (hitType !== 'miss') {
            if (hitType === 'crit') {
                margin += 15; // Bonus for perfect sync
                combatLog += `\n<success>[PERFECT SYNC] Precision Bonus!</success>`;
            }
            effectiveHitType = CombatCalculator.determineHitType(margin);
        }

        const flavor = CombatLogger.getAttackFlavor(weapon.category, effectiveHitType);

        switch (effectiveHitType) {
            case 'crushing':
                const crushingDamage = Math.floor((weapon.damage * 1.5 + (margin * 0.5)) * damageMultiplier);
                targetCombatStats.hp -= crushingDamage;
                attackerCombatStats.balance = Math.min(1.0, attackerCombatStats.balance + 0.1);
                targetCombatStats.balance = Math.max(0.0, targetCombatStats.balance - 0.2);
                targetCombatStats.balance = Math.max(0.0, targetCombatStats.balance - 0.2);
                const crushSeverity = HealthDescriptor.getDamageDescriptor(crushingDamage);

                const targetName = targetNPC?.typeName || 'the target';
                const critDesc = CombatLogger.getCriticalHitFlavor(weapon.category, targetName);
                combatLog += critDesc;
                // combatLog += `<combat-hit>${flavor.hitLabel} You land a ${crushSeverity} on ${targetNPC?.typeName || 'the target'}!</combat-hit>\n`;
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                combatLog += WoundManager.applyWoundToTarget(target, attackerCombatStats.targetLimb || BodyPart.Chest, 5);
                combatLog += "\n[STUN] Target is reeling!";
                break;
            case 'solid':
                const solidDamage = Math.floor((weapon.damage * 1.0 + (margin * 0.2)) * damageMultiplier);
                targetCombatStats.hp -= solidDamage;
                attackerCombatStats.balance = Math.min(1.0, attackerCombatStats.balance + 0.08);
                targetCombatStats.balance = Math.max(0.0, targetCombatStats.balance - 0.1);
                const solidSeverity = HealthDescriptor.getDamageDescriptor(solidDamage);
                combatLog += `<combat-hit>${flavor.hitLabel} You land a ${solidSeverity} on ${targetNPC?.typeName || 'the target'}!</combat-hit>\n`;
                combatLog += `Target loses balance!`;
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                break;
            case 'marginal':
                const marginalDamage = Math.floor((weapon.damage * 0.5) * damageMultiplier);
                targetCombatStats.hp -= marginalDamage;
                attackerCombatStats.balance = Math.min(1.0, attackerCombatStats.balance + 0.05);
                attackerCombatStats.balance = Math.min(1.0, attackerCombatStats.balance + 0.05);
                const marginalSeverity = HealthDescriptor.getDamageDescriptor(marginalDamage);
                combatLog += `<combat-hit>${flavor.hitLabel} You land a ${marginalSeverity} on ${targetNPC?.typeName || 'the target'}.</combat-hit>\n`;
                combatLog += `You regain some momentum.`;
                observerLog += `<combat-hit>${flavor.obsLabel}</combat-hit>\n`;
                break;
            case 'miss':
                combatLog += `<combat-miss>${flavor.hitLabel} You ${flavor.playerAction}!</combat-miss>\n`;
                observerLog += `<combat-miss>${flavor.obsLabel}</combat-miss>\n`;
                attackerCombatStats.balance = Math.max(0.0, attackerCombatStats.balance - 0.1);
                break;
        }

        if (effectiveMoveType === 'slice' && effectiveHitType !== 'miss') {
            const weaponName = weapon.name.toLowerCase();
            if (weaponName.includes('katana') || weaponName.includes('kitana') || weaponName.includes('samurai sword')) {
                let momentum = attacker.getComponent(Momentum);
                if (!momentum) {
                    momentum = new Momentum();
                    attacker.addComponent(momentum);
                }
                momentum.add(5);
                messageService.combat(attackerId, `<success>[MOMENTUM] Your slice connects, maintaining your flow! (+5)</success>`);
            }
        }

        if (weapon.range > 0 && weapon.ammoType) {
            weapon.currentAmmo--;
            combatLog += `\n[${weapon.currentAmmo}/${weapon.magSize} rounds remaining]`;
        }

        const skill = attackerStats.skills.get(skillName);
        if (skill) {
            skill.uses += effectiveHitType === 'crushing' ? 5 : (effectiveHitType === 'miss' ? 0 : 1);
            if (skill.uses >= skill.maxUses) {
                skill.level++;
                skill.uses -= skill.maxUses;
                skill.maxUses = Math.floor(skill.maxUses * 1.5);
                messageService.success(attackerId, `*** Your ${skill.name} skill has increased to level ${skill.level}! ***`);
            }
        }

        if (targetCombatStats.hp <= 0) {
            combatLog += `\n<combat-death>${targetNPC?.typeName || 'Target'} has been eliminated!</combat-death>`;
            observerLog += `\n<combat-death>${targetNPC?.typeName || 'Target'} has been eliminated!</combat-death>`;

            const targetPos = target.getComponent(Position);
            if (targetPos && targetPos.x >= 2000) {
                const dungeonService = DungeonService.getInstance();
                if (dungeonService) {
                    const remaining = dungeonService.getRemainingEnemiesCount();
                    if (remaining > 0) messageService.system(attackerId, `[DUNGEON] ${remaining} glitch signatures remaining.`);
                    else messageService.success(attackerId, `\n[DUNGEON CLEAR] Reality Rift stabilized!`);
                }
            }

            attackerCombatStats.engagementTier = EngagementTier.DISENGAGED;
            attackerCombatStats.targetId = null;
            attackerCombatStats.isHostile = false;

            // Handle Loot Dropping
            const loot = target.getComponent(Loot);
            const inv = target.getComponent(Inventory);
            const pos = target.getComponent(Position);

            if (pos) {
                const dropItem = (id: string | null) => {
                    if (!id) return;
                    const item = engine.getEntity(id);
                    if (item) {
                        // Special check for Street Samurai Katana drop rate
                        if (targetNPC?.typeName === 'Street Samurai') {
                            const weapon = item.getComponent(Weapon);
                            if (weapon && weapon.name.toLowerCase().includes('katana')) {
                                if (Math.random() > 0.2) { // 80% chance to NOT drop (destroy item)
                                    engine.removeEntity(id);
                                    return;
                                }
                            }
                        }

                        // Remove from any container/hand first (though they are dying, so it's fine)
                        item.addComponent(new Position(pos.x, pos.y));
                    }
                };

                // Drop items from Loot component
                if (loot) {
                    loot.itemEntityIds.forEach(id => dropItem(id));
                    messageService.combat(attackerId, `<success>The ${targetNPC?.typeName || 'target'} dropped some loot!</success>`);
                }

                // Drop items from Inventory
                if (inv) {
                    dropItem(inv.leftHand);
                    dropItem(inv.rightHand);
                    inv.equipment.forEach(id => dropItem(id));
                }
            }

            engine.removeEntity(target.id);
            engine.removeEntity(target.id);
        } else {
            if (target.hasComponent(NPC)) {
                const status = HealthDescriptor.getStatusDescriptor(targetCombatStats.hp, targetCombatStats.maxHp);
                combatLog += `\nStatus: ${targetNPC?.typeName || 'Target'} looks ${status}.`;
            } else {
                combatLog += `\n${targetNPC?.typeName || 'Target'}: ${targetCombatStats.hp}/${targetCombatStats.maxHp} HP | Balance: ${Math.floor(targetCombatStats.balance * 100)}%`;
            }
        }

        combatLog += `\n</combat>`;
        observerLog += `\n</combat>`;
        messageService.combat(attackerId, combatLog);

        const attackerPos = attacker.getComponent(Position);
        if (attackerPos) {
            const playersInRoom = engine.getEntitiesWithComponent(Position).filter(e => {
                const ePos = e.getComponent(Position);
                return e.hasComponent(CombatStats) && !e.hasComponent(NPC) &&
                    ePos?.x === attackerPos.x && ePos?.y === attackerPos.y && e.id !== attackerId;
            });
            for (const observer of playersInRoom) messageService.combat(observer.id, observerLog);
        }
    }
}
