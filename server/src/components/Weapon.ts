import { Component } from '../ecs/Component';

export interface SyncDifficulty {
    speed: number; // Multiplier for cursor speed (1.0 = normal)
    zoneSize: number; // Width of the crit zone (e.g., 2 chars)
    jitter: number; // 0-1, chance to jump randomly
}

export class Weapon extends Component {
    static type = 'Weapon';

    name: string;
    damage: number;
    range: number; // 0 = melee, >0 = ranged
    ammoType: string | null;
    currentAmmo: number;
    magSize: number;
    difficulty: SyncDifficulty;

    constructor(
        name: string,
        damage: number,
        range: number = 0,
        ammoType: string | null = null,
        magSize: number = 0,
        difficulty: SyncDifficulty = { speed: 1.0, zoneSize: 2, jitter: 0 }
    ) {
        super();
        this.name = name;
        this.damage = damage;
        this.range = range;
        this.ammoType = ammoType;
        this.magSize = magSize;
        this.currentAmmo = magSize;
        this.difficulty = difficulty;
    }
}
