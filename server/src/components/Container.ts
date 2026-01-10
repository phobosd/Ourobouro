import { Component } from '../ecs/Component';

export class Container extends Component {
    static type = 'Container';

    public items: string[] = [];

    constructor(public maxWeight: number, public currentWeight: number = 0) {
        super();
    }
}
