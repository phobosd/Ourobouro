import { Component } from '../ecs/Component';

export class Visuals extends Component {
    static type = 'Visuals';

    constructor(
        public char: string,
        public color: string,
        public glitchRate: number = 0,
        public portrait: string = ""
    ) {
        super();
    }
}
