import { Component } from '../ecs/Component';

export class IsICE extends Component {
    static type = 'IsICE';

    iceType: string;

    constructor(iceType: string = 'White ICE') {
        super();
        this.iceType = iceType;
    }
}
