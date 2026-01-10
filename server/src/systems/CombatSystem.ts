import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { CombatStats } from '../components/CombatStats';
import { Stats } from '../components/Stats';
import { Weapon } from '../components/Weapon';
import { Position } from '../components/Position';
import { NPC } from '../components/NPC';
import { Inventory } from '../components/Inventory';
import { Server } from 'socket.io';
import { Engine } from '../ecs/Engine';

interface CriticalEffect {
    name: string;
    alert: string;
    description: string;
    apply: (target: Entity, source: Entity, skillLevel: number) => string;
}

export class CombatSystem extends System {
    private engine: Engine;
    private io: Server;

    constructor(engine: Engine, io: Server) {
        super();
        this.engine = engine;
        this.io = io;
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

    handleAttack(attackerId: string, targetName: string, entities: Set<Entity>): void {
        const attacker = this.getEntityById(entities, attackerId);
        if (!attacker) return;

        const attackerPos = attacker.getComponent(Position);
        if (!attackerPos) {
            this.io.to(attackerId).emit('message', "You don't have a position.");
            return;
        }

        // Find target NPC in the same room
        const target = Array.from(entities).find(e => {
            const npc = e.getComponent(NPC);
            const pos = e.getComponent(Position);
            if (!npc || !pos) return false;
            return npc.typeName.toLowerCase().includes(targetName.toLowerCase()) &&
                pos.x === attackerPos.x && pos.y === attackerPos.y;
        });

        if (!target) {
            this.io.to(attackerId).emit('message', `You don't see "${targetName}" here.`);
            return;
        }

        const targetNPC = target.getComponent(NPC);
        const targetCombatStats = target.getComponent(CombatStats);

        if (!targetCombatStats) {
            this.io.to(attackerId).emit('message', `You can't attack ${targetNPC?.typeName || 'that'}.`);
            return;
        }

        // Get attacker's weapon and stats
        const attackerInventory = attacker.getComponent(Inventory);
        const attackerStats = attacker.getComponent(Stats);

        if (!attackerInventory || !attackerStats) {
            this.io.to(attackerId).emit('message', "You're not ready for combat.");
            return;
        }

        // Get weapon from right hand
        let weaponEntity: Entity | undefined;
        let weapon: Weapon | undefined;

        if (attackerInventory.rightHand) {
            weaponEntity = this.getEntityById(entities, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon) {
            this.io.to(attackerId).emit('message', "You need a weapon in your right hand to attack!");
            return;
        }

        // Check ammo for ranged weapons
        if (weapon.range > 0 && weapon.currentAmmo <= 0) {
            this.io.to(attackerId).emit('message', `Your ${weapon.name} is out of ammo!`);
            return;
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

    handleSyncResult(attackerId: string, targetId: string, hitType: 'crit' | 'hit' | 'miss', entities: Set<Entity>): void {
        const attacker = this.getEntityById(entities, attackerId);
        const target = this.getEntityById(entities, targetId);

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
            weaponEntity = this.getEntityById(entities, attackerInventory.rightHand);
            weapon = weaponEntity?.getComponent(Weapon);
        }

        if (!weapon) return;

        let combatLog = `\n<combat>You attack ${targetNPC?.typeName || 'the target'} with your ${weapon.name}!\n`;

        if (hitType === 'crit') {
            // CRITICAL HIT!
            const skillLevel = attackerStats.skills.get('Marksmanship (Light)')?.level || 1;
            const critDamage = weapon.damage * 2;
            targetCombatStats.hp -= critDamage;

            combatLog += this.resolveCrit(target, attacker, weapon, skillLevel);
            combatLog += `\nYou deal ${critDamage} CRITICAL damage!`;
        } else if (hitType === 'hit') {
            // NORMAL HIT
            const damage = weapon.damage;
            targetCombatStats.hp -= damage;
            combatLog += `You hit for ${damage} damage!`;
        } else {
            // MISS
            combatLog += `You miss!`;
        }

        // Consume ammo
        if (weapon.range > 0) {
            weapon.currentAmmo--;
            combatLog += `\n[${weapon.currentAmmo}/${weapon.magSize} rounds remaining]`;
        }

        // Check if target is dead
        if (targetCombatStats.hp <= 0) {
            combatLog += `\n\n<combat-death>${targetNPC?.typeName || 'Target'} has been eliminated!</combat-death>`;
            this.engine.removeEntity(target.id);
        } else {
            combatLog += `\n${targetNPC?.typeName || 'Target'}: ${targetCombatStats.hp}/${targetCombatStats.maxHp} HP`;
        }

        combatLog += `</combat>`;
        this.io.to(attackerId).emit('message', combatLog);
    }

    private getEntityById(entities: Set<Entity>, id: string): Entity | undefined {
        return Array.from(entities).find(e => e.id === id);
    }

    update(entities: Set<Entity>, dt: number): void {
        // Combat loop logic will go here
    }
}
