import { Component } from '../ecs/Component';

export class IsPersona extends Component {
    static type = 'IsPersona';

    physicalBodyId: string;

    constructor(physicalBodyId: string) {
        super();
        this.physicalBodyId = physicalBodyId;
    }
}
