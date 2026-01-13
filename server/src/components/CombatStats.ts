import { Component } from '../ecs/Component';
import { EngagementTier, BodyPart } from '../types/CombatTypes';

export class CombatStats extends Component {
    static type = 'CombatStats';

    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    isHostile: boolean;

    // Momentum-based combat variables
    balance: number = 1.0; // 0.0 to 1.0
    fatigue: number = 0;
    engagementTier: EngagementTier = EngagementTier.DISENGAGED;
    // Defense Allocation (Sum should be <= 100)
    evasion: number = 50;
    parry: number = 25;
    shield: number = 25;

    // 0.0 to 1.0 (Offense vs Defense bias) - Keeping for general aggression
    aggression: number = 0.5;
    targetLimb: BodyPart | null = null;
    isHangingBack: boolean = false;
    targetId: string | null = null;
    currentTelegraph: string | null = null;
    isParrying: boolean = false;
    pendingMove: string | null = null;

    constructor(maxHp: number = 100, attack: number = 10, defense: number = 0, isHostile: boolean = false) {
        super();
        this.hp = maxHp;
        this.maxHp = maxHp;
        this.attack = attack;
        this.defense = defense;
        this.isHostile = isHostile;
    }
}
