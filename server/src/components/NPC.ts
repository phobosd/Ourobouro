import { Component } from '../ecs/Component';

export class NPC extends Component {
    static type = 'NPC';

    constructor(
        public typeName: string = "Unknown NPC",
        public barks: string[] = [],
        public description: string = "No description.",
        public canMove: boolean = true,
        public tag: string = '',
        public isAggressive: boolean = false,
        public behavior: 'friendly' | 'neutral' | 'cautious' | 'elusive' | 'aggressive' = 'neutral'
    ) {
        super();
        // Sync behavior with isAggressive for backward compatibility
        if (isAggressive) {
            this.behavior = 'aggressive';
        } else if (this.behavior === 'aggressive') {
            this.isAggressive = true;
        }
    }
}
