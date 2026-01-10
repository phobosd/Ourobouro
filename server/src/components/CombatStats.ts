import { Component } from '../ecs/Component';

export class CombatStats extends Component {
    static type = 'CombatStats';

    hp: number;
    maxHp: number;
    attack: number;
    defense: number;

    constructor(maxHp: number = 100, attack: number = 10, defense: number = 0) {
        super();
        this.hp = maxHp;
        this.maxHp = maxHp;
        this.attack = attack;
        this.defense = defense;
    }
}
