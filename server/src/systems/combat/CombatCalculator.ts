import { Entity } from '../../ecs/Entity';
import { Stats } from '../../components/Stats';
import { CombatStats } from '../../components/CombatStats';
import { Weapon } from '../../components/Weapon';
import { Inventory } from '../../components/Inventory';
import { Stance, StanceType } from '../../components/Stance';
import { Armor } from '../../components/Armor';
import { IEngine } from '../../ecs/IEngine';
import { WorldQuery } from '../../utils/WorldQuery';
import { EngagementTier } from '../../types/CombatTypes';

export type HitType = 'crushing' | 'solid' | 'marginal' | 'miss';

export class CombatCalculator {
    static calculateAttackerPower(attacker: Entity, weapon: Weapon, skillName: string): number {
        const stats = attacker.getComponent(Stats);
        const combatStats = attacker.getComponent(CombatStats);
        if (!stats || !combatStats) return 0;

        // Use Brawling skill for brawling weapons
        const effectiveSkillName = weapon.category === 'brawling' ? 'Brawling' : skillName;
        const skill = stats.skills.get(effectiveSkillName)?.level || 1;
        const agi = stats.attributes.get('AGI')?.value || 10;
        const balance = combatStats.balance;

        // Attacker_Power = (Skill * 0.6) + (Agility * 0.4) + (Current_Balance * 20)
        // Adjusting balance weight to make the mini-game (balance management) crucial for high power
        const power = (skill * 0.6) + (agi * 0.4) + (balance * 25); // Reduced from 30 to 25 to balance crit rate
        console.log(`[CombatDebug] AttackerPower: Skill(${effectiveSkillName})=${skill}, AGI=${agi}, Bal=${balance} => Power=${power}`);
        return power;
    }

    static calculateDefenderPower(defender: Entity, engine: IEngine, attackType: 'MELEE' | 'RANGED' = 'MELEE'): number {
        const stats = defender.getComponent(Stats);
        const combatStats = defender.getComponent(CombatStats);
        if (!stats || !combatStats) return 0;

        const agi = stats.attributes.get('AGI')?.value || 10;
        const balance = combatStats.balance;

        // Base skills
        const evasionSkill = stats.skills.get('Evasion')?.level || 1;

        // Determine Parry Skill
        let parrySkill = stats.skills.get('Melee Combat')?.level || 1;
        const inventory = defender.getComponent(Inventory);
        if (inventory && inventory.rightHand) {
            const weaponEntity = WorldQuery.getEntityById(engine, inventory.rightHand);
            if (weaponEntity) {
                const weapon = weaponEntity.getComponent(Weapon);
                if (weapon && weapon.name.toLowerCase().includes('katana')) {
                    parrySkill = stats.skills.get('Kenjutsu')?.level || 1;
                }
            }
        }
        const shieldSkill = stats.skills.get('Shield Usage')?.level || 1;

        // Effective Defense = Weighted sum of defenses based on allocation
        let effectiveDefense = 0;

        // Evasion (Always applicable)
        const evasionVal = (evasionSkill * 0.8) + (agi * 0.6);
        effectiveDefense += evasionVal * (combatStats.evasion / 100);

        if (attackType === 'MELEE') {
            // Parry (Only vs Melee)
            const parryVal = (parrySkill * 0.8) + (agi * 0.6);
            effectiveDefense += parryVal * (combatStats.parry / 100);
        }

        // Shield (Applicable vs Both)
        const shieldVal = (shieldSkill * 0.8) + (agi * 0.6);
        effectiveDefense += shieldVal * (combatStats.shield / 100);

        // Balance modifier
        let power = effectiveDefense + (balance * 20);

        // Physical Stance Penalty
        const physicalStance = defender.getComponent(Stance);
        if (physicalStance) {
            if (physicalStance.current === StanceType.Sitting) {
                power *= 0.75; // 25% penalty
            } else if (physicalStance.current === StanceType.Lying) {
                power *= 0.5; // 50% penalty
            }
        }

        // Natural Armor / Base Defense
        power += combatStats.defense;

        // Equipment Armor
        if (inventory) {
            for (const [slot, itemId] of inventory.equipment) {
                const itemEntity = WorldQuery.getEntityById(engine, itemId);
                const armor = itemEntity?.getComponent(Armor);
                if (armor) {
                    power += armor.defense;
                    // Apply penalty to power (representing agility loss)
                    if (armor.penalty > 0) {
                        power -= armor.penalty;
                    }
                }
            }
        }

        return power;
    }

    static determineHitType(margin: number): HitType {
        // Margin is (AttackerPower - DefenderPower)

        // Critical Hit Calculation (Probabilistic)
        // Even with a high margin, a crit is not guaranteed unless overwhelmingly superior.
        if (margin > 30) {
            // Base crit chance starts at 0% at margin 30
            // Increases by 2% for every point of margin above 30
            // Margin 35 -> 10% chance
            // Margin 40 -> 20% chance
            // Margin 55 -> 50% chance
            // Margin 80 -> 100% chance
            const critChance = (margin - 30) * 0.02;

            // Roll for crit
            if (Math.random() < critChance) {
                return 'crushing';
            }
            return 'solid'; // Fallback to solid hit if crit fails
        }

        if (margin > 5) return 'solid';
        if (margin > -10) return 'marginal';
        return 'miss';
    }

    static createBrawlingWeapon(move: string): Weapon {
        const weapon = new Weapon("Fists", "brawling", 5, 0);
        weapon.range = 0;
        weapon.minTier = EngagementTier.CLOSE_QUARTERS;
        weapon.maxTier = EngagementTier.CLOSE_QUARTERS;

        switch (move.toLowerCase()) {
            case 'punch':
                weapon.name = "Fists (Punch)";
                weapon.damage = 5;
                weapon.difficulty = { speed: 1.0, zoneSize: 5, jitter: 0.5 };
                weapon.roundtime = 3;
                break;
            case 'jab':
                weapon.name = "Fists (Jab)";
                weapon.damage = 3;
                weapon.difficulty = { speed: 1.2, zoneSize: 6, jitter: 0.3 };
                weapon.roundtime = 2;
                break;
            case 'uppercut':
                weapon.name = "Fists (Uppercut)";
                weapon.damage = 8;
                weapon.difficulty = { speed: 0.8, zoneSize: 4, jitter: 0.7 };
                weapon.roundtime = 4;
                break;
            case 'headbutt':
                weapon.name = "Headbutt";
                weapon.damage = 10;
                weapon.difficulty = { speed: 0.6, zoneSize: 3, jitter: 1.0 };
                weapon.roundtime = 4;
                break;
        }
        return weapon;
    }
}
