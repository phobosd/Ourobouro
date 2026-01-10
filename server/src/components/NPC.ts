import { Component } from '../ecs/Component';

export class NPC extends Component {
    static type = 'NPC';

    constructor(
        public typeName: string,
        public barks: string[],
        public description: string,
        public asciiPortrait: string
    ) {
        super();
    }
}
