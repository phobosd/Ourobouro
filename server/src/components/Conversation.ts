import { Component } from '../ecs/Component';

export class Conversation extends Component {
    constructor(public partnerId: string) {
        super();
    }
}
