import { Component } from '../ecs/Component';

export class Inventory extends Component {
    static type = 'Inventory';

    public leftHand: string | null = null;
    public rightHand: string | null = null;
    public equipment: Map<string, string> = new Map(); // slot -> entityId

    constructor() {
        super();
    }
}
