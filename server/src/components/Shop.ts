import { Component } from '../ecs/Component';

export class Shop extends Component {
    static type = 'Shop';

    constructor(
        public name: string,
        public description: string
    ) {
        super();
    }
}
