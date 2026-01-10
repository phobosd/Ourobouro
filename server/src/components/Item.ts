import { Component } from '../ecs/Component';

export class Item extends Component {
    static type = 'Item';

    constructor(
        public name: string,
        public description: string,
        public weight: number = 0.1,
        public quantity: number = 1
    ) {
        super();
    }
}
