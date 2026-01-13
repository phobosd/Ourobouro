import { Component } from '../ecs/Component';
import { EngagementTier } from '../types/CombatTypes';

export interface SyncDifficulty {
    speed: number; // Multiplier for cursor speed (1.0 = normal)
    zoneSize: number; // Width of the crit zone (e.g., 2 chars)
    jitter: number; // 0-1, chance to jump randomly
}

export class Weapon extends Component {
    static type = 'Weapon';

    name: string;
    category: string;
    damage: number;
    range: number; // 0 = melee, >0 = ranged
    ammoType: string | null;
    magazineType: string | null;
    currentAmmo: number;
    magSize: number;
    difficulty: SyncDifficulty;

    // Momentum-based combat variables
    minTier: EngagementTier;
    maxTier: EngagementTier;
    momentumImpact: number; // How much this weapon affects balance on hit/use
    roundtime: number; // Base roundtime in seconds

    constructor(
        name: string,
        category: string,
        damage: number,
        range: number = 0,
        ammoType: string | null = null,
        magazineType: string | null = null,
        magSize: number = 0,
        difficulty: SyncDifficulty = { speed: 1.0, zoneSize: 2, jitter: 0 },
        minTier: EngagementTier = EngagementTier.MELEE,
        maxTier: EngagementTier = EngagementTier.MELEE,
        momentumImpact: number = 0.1,
        roundtime: number = 3
    ) {
        super();
        this.name = name;
        this.category = category;
        this.damage = damage;
        this.range = range;
        this.ammoType = ammoType;
        this.magazineType = magazineType;
        this.magSize = magSize;
        this.currentAmmo = magSize;
        this.difficulty = difficulty;
        this.minTier = minTier;
        this.maxTier = maxTier;
        this.momentumImpact = momentumImpact;
        this.roundtime = roundtime;
    }
}
