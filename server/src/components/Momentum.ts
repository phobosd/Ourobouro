import { Component } from '../ecs/Component';

export class Momentum extends Component {
    static type = 'Momentum';

    current: number = 0; // 0 to 100
    max: number = 100;
    decayRate: number = 5; // Points lost per second when not building
    lastUpdate: number = Date.now();

    constructor(max: number = 100) {
        super();
        this.max = max;
    }

    /**
     * Add momentum (from successful parry/evasion)
     */
    add(amount: number): void {
        this.current = Math.min(this.max, this.current + amount);
        this.lastUpdate = Date.now();
    }

    /**
     * Decay momentum over time
     */
    decay(deltaTime: number): void {
        const secondsElapsed = deltaTime / 1000;
        this.current = Math.max(0, this.current - (this.decayRate * secondsElapsed));
    }

    /**
     * Reset momentum to zero
     */
    reset(): void {
        this.current = 0;
        this.lastUpdate = Date.now();
    }

    /**
     * Get momentum state as a string
     */
    getState(): 'empty' | 'building' | 'flowing' | 'peak' {
        if (this.current === 0) return 'empty';
        if (this.current < 15) return 'building';
        if (this.current < 30) return 'flowing';
        return 'peak';
    }

    /**
     * Get ASCII bar representation
     */
    getBar(length: number = 10): string {
        const filled = Math.floor((this.current / this.max) * length);
        const empty = length - filled;
        return '|'.repeat(filled) + '-'.repeat(empty);
    }

    /**
     * Get color for momentum state
     */
    getColor(): string {
        const state = this.getState();
        switch (state) {
            case 'empty': return 'gray';
            case 'building': return 'yellow';
            case 'flowing': return 'cyan';
            case 'peak': return 'magenta';
        }
    }
}
