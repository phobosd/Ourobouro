import { Component } from '../ecs/Component';

export class Item extends Component {
    static type = 'Item';

    constructor(
        public name: string = "Unknown Item",
        public description: string = "No description.",
        public weight: number = 0.1,
        public quantity: number = 1,
        public size: string = "Small",
        public legality: string = "Legal",
        public attributes: string = "",
        public shortName: string = "",
        public slot: string | null = null, // Body slot: head, torso, legs, waist, back, feet, hands, etc.
        public rarity: string = "common",
        public templateId: string | null = null
    ) {
        super();
        if (!this.shortName && this.name) {
            // Default shortName to the last word of the name if not provided (usually the noun)
            this.shortName = this.name.split(' ').pop()?.toLowerCase() || 'item';
        }
    }

    public matches(query: string): boolean {
        const q = query.toLowerCase();
        return this.name.toLowerCase().includes(q) ||
            (!!this.shortName && this.shortName.toLowerCase().includes(q));
    }
}
