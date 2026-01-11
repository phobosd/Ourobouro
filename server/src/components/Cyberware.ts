import { Component } from '../ecs/Component';

export class Cyberware extends Component {
    static type = 'Cyberware';

    slot: string;
    modifiers: Map<string, number>;

    constructor(slot: string, modifiers: Map<string, number> = new Map()) {
        super();
        this.slot = slot;
        this.modifiers = modifiers;
    }

    toJSON() {
        return {
            type: Cyberware.type,
            slot: this.slot,
            modifiers: Array.from(this.modifiers.entries())
        };
    }

    static fromJSON(data: any): Cyberware {
        return new Cyberware(data.slot, new Map(data.modifiers));
    }
}
