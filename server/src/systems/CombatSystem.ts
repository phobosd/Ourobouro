import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { CombatStats } from '../components/CombatStats';
import { Stats } from '../components/Stats';
import { Weapon } from '../components/Weapon';
import { Position } from '../components/Position';
import { NPC } from '../components/NPC';
import { Inventory } from '../components/Inventory';
import { Item } from '../components/Item';
import { Container } from '../components/Container';
import { Stance, StanceType } from '../components/Stance';
import { Server } from 'socket.io';
import { Engine } from '../ecs/Engine';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../commands/CommandRegistry';
import { PrefabFactory } from '../factories/PrefabFactory';

interface CriticalEffect {
    name: string;
    alert: string;
    description: string;
    apply: (target: Entity, source: Entity, skillLevel: number) => string;
}

import { MessageService } from '../services/MessageService';

export class CombatSystem extends System {
    private engine: IEngine;
    private io: Server;
    private messageService: MessageService;

    constructor(engine: IEngine, io: Server, messageService: MessageService) {
        super();
        this.engine = engine;
        this.io = io;
        this.messageService = messageService;
    }

    private critTable: CriticalEffect[] = [
        {
            name: "Neural Feedback",
            alert: "[!! SYNAPSE FRY !!]",
            description: "Stuns the target, scrambling their neural interface.",
            apply: (target, source, skillLevel) => {
                const duration = 1 + Math.floor(skillLevel / 5);
                return `Target stunned for ${duration} rounds!`;
            }
        },
        {
            name: "Optic Glitch",
            alert: "[!! VISUAL ERROR !!]",
            description: "Corrupts target's visual feed, reducing accuracy.",
            apply: (target, source, skillLevel) => {
                const intensity = 10 + skillLevel * 2;
                return `Target's targeting sensors scrambled! Accuracy -${intensity}%`;
            }
        },
        {
            name: "Armor Shred",
            alert: "[!! HULL BREACH !!]",
            description: "Permanently damages the target's protective plating.",
            apply: (target, source, skillLevel) => {
                const stats = target.getComponent(CombatStats);
                if (stats) {
                    const shred = 2 + Math.floor(skillLevel / 3);
                    stats.defense = Math.max(0, stats.defense - shred);
                    return `Armor stripped! Defense reduced by ${shred}.`;
                }
                return "Target has no armor to shred.";
            }
        },
        {
            name: "Ammo Cook-off",
            alert: "[!! THERMAL CRIT !!]",
            description: "Superheats the target's ammunition or power cells.",
            apply: (target, source, skillLevel) => {
                const damage = 5 + skillLevel;
                const stats = target.getComponent(CombatStats);
                if (stats) {
                    stats.hp -= damage;
                }
                return `Ammo explosion! Target takes ${damage} fire damage.`;
            }
        },
        {
            name: "Actuator Lock",
            alert: "[!! MOTOR SEIZE !!]",
            description: "Jams the target's movement servos.",
            apply: (target, source, skillLevel) => {
                const stats = target.getComponent(Stats);
                if (stats) {
                    const agiAttr = stats.attributes.get('AGI');
                    if (agiAttr) {
                        const reduction = 2 + Math.floor(skillLevel / 4);
                        agiAttr.value = Math.max(1, agiAttr.value - reduction);
                        return `Servos locked! Agility reduced by ${reduction}.`;
                    }
                }
                return "Target's movement systems unaffected.";
            }
        }
    ];

    resolveCrit(target: Entity, source: Entity, weapon: Weapon, skillLevel: number): string {
        const roll = Math.floor(Math.random() * this.critTable.length);
        const effect = this.critTable[roll];

        let log = `\n${effect.alert}\n`;
        log += `CRITICAL OVERLOAD! Your ${weapon.name} pierces the target's defenses.\n`;
        log += effect.apply(target, source, skillLevel);

        return log;
    }

    handleAttack(attackerId: string, targetName: string, engine: IEngine): void {
        const attacker = WorldQuery.getEntityById(engine, attackerId);
        if (!attacker) return;

        const attackerPos = attacker.getComponent(Position);
        const stance = attacker.getComponent(Stance);
        if (!attackerPos) {
            this.messageService.info(attackerId, "You don't have a position.");
            return;
        }

        if (stance && stance.current !== StanceType.Standing) {
            this.messageService.info(attackerId, `You can't attack while ${stance.current}!`);
            return;
        }

        // Find target NPC in the same room
        const target = engine.getEntitiesWithComponent(NPC).find(e => {
            const npc = e.getComponent(NPC);
            const pos = e.getComponent(Position);
            if (!npc || !pos) return false;
            return npc.typeName.toLowerCase().includes(targetName.toLowerCase()) &&
                pos.x === attackerPos.x && pos.y === attackerPos.y;
        });

        if (!target) {
            this.messageService.info(attackerId, `You don't see "${targetName}" here.`);
            return;
        }

        const targetNPC = target.getComponent(NPC);
        const targetCombatStats = target.getComponent(CombatStats);

        if (!targetCombatStats) {
            this.messageService.info(attackerId, `You can't attack ${targetNPC?.typeName || 'that'}.`);
            return;
        }

        // Set NPC to hostile when attacked
        targetCombatStats.isHostile = true;

        // Get attacker's weapon and stats
        const attackerInventory = attacker.getComponent(Inventory);
        const attackerStats = attacker.getComponent(Stats);

        if (!attackerInventory || !attackerStats) {
            this.messageService.info(attackerId, "You're not ready for combat.");
            return;
        }

        // Get weapon from right hand
        let weaponEntity: Entity | undefined;
        let weapon: Weapon | undefined;

        if (attackerInventory.rightHand) {
            weaponEntity = WorldQuery.getEntityById(engine, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon) {
            this.messageService.info(attackerId, "You need a weapon in your right hand to attack!");
            return;
        }

        // Check ammo for ranged weapons and reload if needed
        if (weapon.range > 0 && weapon.currentAmmo <= 0) {
            // Try to find a magazine to reload
            const magEntity = this.findMagazine(attacker, engine, weapon.ammoType || "9mm");

            if (!magEntity) {
                this.messageService.info(attackerId, `Your ${weapon.name} is out of ammo and you have no magazines!`);
                return;
            }

            // Reload from magazine
            const magItem = magEntity.getComponent(Item);
            if (magItem && magItem.quantity > 0) {
                weapon.currentAmmo = weapon.magSize;
                magItem.quantity--;

                // Remove magazine entity if depleted
                if (magItem.quantity <= 0) {
                    this.removeFromContainer(attacker, magEntity.id, engine);
                }

                this.messageService.system(attackerId, `Reloading ${weapon.name}... [${magItem.quantity} mags left]`);
                return; // Reloading consumes the action
            }
        }

        // Calculate sync bar parameters based on weapon and skills
        const agiAttr = attackerStats.attributes.get('AGI');
        const agility = agiAttr?.value || 10;
        const skillLevel = attackerStats.skills.get('Marksmanship (Light)')?.level || 1;

        // Weapon difficulty modifies the sync bar
        const baseSpeed = weapon.difficulty.speed;
        const baseZoneSize = weapon.difficulty.zoneSize;
        const jitter = weapon.difficulty.jitter;

        // AGI makes crit zone wider (easier)
        const critZoneSize = Math.floor(baseZoneSize + (agility - 10) / 5);

        // Skill level slows down cursor speed (easier)
        const cursorSpeed = baseSpeed * (1 - (skillLevel * 0.05));

        // Send sync bar challenge to client
        this.io.to(attackerId).emit('combat-sync', {
            targetId: target.id,
            targetName: targetNPC?.typeName || 'Target',
            weaponName: weapon.name,
            syncBar: {
                speed: cursorSpeed,
                critZoneSize: critZoneSize,
                jitter: jitter,
                barLength: 20
            }
        });
    }

    handleSyncResult(attackerId: string, targetId: string, hitType: 'crit' | 'hit' | 'miss', engine: IEngine): void {
        const attacker = WorldQuery.getEntityById(engine, attackerId);
        const target = WorldQuery.getEntityById(engine, targetId);

        if (!attacker || !target) return;

        const targetNPC = target.getComponent(NPC);
        const targetCombatStats = target.getComponent(CombatStats);
        const attackerInventory = attacker.getComponent(Inventory);
        const attackerStats = attacker.getComponent(Stats);

        if (!targetCombatStats || !attackerInventory || !attackerStats) return;

        // Get weapon
        let weaponEntity: Entity | undefined;
        let weapon: Weapon | undefined;

        if (attackerInventory.rightHand) {
            weaponEntity = WorldQuery.getEntityById(engine, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon) return;

        let combatLog = `\n<combat>You attack ${targetNPC?.typeName || 'the target'} with your ${weapon.name}!</combat>\n`;

        if (hitType === 'crit') {
            // CRITICAL HIT!
            const skillName = 'Marksmanship (Light)'; // Hardcoded for now, should be dynamic based on weapon
            const skill = attackerStats.skills.get(skillName);
            if (skill) {
                skill.uses += 5; // More XP for crits
                this.checkSkillLevelUp(attackerId, skill);
            }

            const skillLevel = skill?.level || 1;
            const critDamage = weapon.damage * 2;
            targetCombatStats.hp -= critDamage;

            combatLog += this.resolveCrit(target, attacker, weapon, skillLevel);
            combatLog += `\n<combat-hit>You deal ${critDamage} CRITICAL damage!</combat-hit>`;
        } else if (hitType === 'hit') {
            // NORMAL HIT
            const skillName = 'Marksmanship (Light)';
            const skill = attackerStats.skills.get(skillName);
            if (skill) {
                skill.uses += 1;
                this.checkSkillLevelUp(attackerId, skill);
            }

            const damage = weapon.damage;
            targetCombatStats.hp -= damage;
            combatLog += `<combat-hit>You hit for ${damage} damage!</combat-hit>`;
        } else {
            // MISS
            // Optional: Small XP for trying?
            combatLog += `<combat-miss>You miss!</combat-miss>`;
        }

        // Consume ammo
        if (weapon.range > 0) {
            weapon.currentAmmo--;
            combatLog += `\n[${weapon.currentAmmo}/${weapon.magSize} rounds remaining]`;
        }

        combatLog += `\n</combat>`;

        // Check if target is dead
        if (targetCombatStats.hp <= 0) {
            combatLog += `\n<combat-death>${targetNPC?.typeName || 'Target'} has been eliminated!</combat-death>`;

            // Bonus XP for kill
            const skillName = 'Marksmanship (Light)';
            const skill = attackerStats.skills.get(skillName);
            if (skill) {
                skill.uses += 10;
                this.checkSkillLevelUp(attackerId, skill);
            }

            this.engine.removeEntity(target.id);
        } else {
            combatLog += `\n<combat>${targetNPC?.typeName || 'Target'}: ${targetCombatStats.hp}/${targetCombatStats.maxHp} HP</combat>`;
        }

        this.messageService.combat(attackerId, combatLog);
    }

    private checkSkillLevelUp(entityId: string, skill: { name: string, level: number, uses: number, maxUses: number }) {
        if (skill.uses >= skill.maxUses) {
            skill.level++;
            skill.uses -= skill.maxUses;
            skill.maxUses = Math.floor(skill.maxUses * 1.5); // Increase difficulty
            this.messageService.success(entityId, `*** Your ${skill.name} skill has increased to level ${skill.level}! ***`);
        }
    }


    private findMagazine(attacker: Entity, engine: IEngine, ammoType: string): Entity | null {
        const inventory = attacker.getComponent(Inventory);
        if (!inventory) return null;

        // Search through all equipment containers
        for (const [slot, equipId] of inventory.equipment) {
            const equip = WorldQuery.getEntityById(engine, equipId);
            const container = equip?.getComponent(Container);

            if (container) {
                for (const itemId of container.items) {
                    const item = WorldQuery.getEntityById(engine, itemId);
                    const itemComp = item?.getComponent(Item);

                    // Check if this is a magazine (contains "Mag" and the ammo type)
                    if (itemComp && itemComp.name.includes("Mag") && itemComp.quantity > 0) {
                        return item || null;
                    }
                }
            }
        }

        return null;
    }

    private removeFromContainer(attacker: Entity, itemId: string, engine: IEngine): void {
        const inventory = attacker.getComponent(Inventory);
        if (!inventory) return;

        // Find and remove from container
        for (const [slot, equipId] of inventory.equipment) {
            const equip = WorldQuery.getEntityById(engine, equipId);
            const container = equip?.getComponent(Container);

            if (container) {
                const index = container.items.indexOf(itemId);
                if (index > -1) {
                    container.items.splice(index, 1);
                    const item = WorldQuery.getEntityById(engine, itemId)?.getComponent(Item);
                    if (item) {
                        container.currentWeight -= item.weight;
                    }
                    this.engine.removeEntity(itemId);
                    return;
                }
            }
        }
    }

    update(engine: IEngine, deltaTime: number): void {
        // Combat loop logic will go here
    }
}
