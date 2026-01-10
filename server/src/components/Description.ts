import { Component } from '../ecs/Component';

export class Description extends Component {
    static type = 'Description';

    constructor(public title: string, public description: string) {
        super();
    }
}
