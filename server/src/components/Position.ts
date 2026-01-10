import { Component } from '../ecs/Component';

export class Position extends Component {
    static type = 'Position';

    constructor(public x: number, public y: number) {
        super();
    }
}
