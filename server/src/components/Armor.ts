import { Component } from '../ecs/Component';

export class Armor extends Component {
    static type = 'Armor';

    constructor(
        public defense: number = 0,
        public penalty: number = 0 // Agility/Movement penalty
    ) {
        super();
    }
}
