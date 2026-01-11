import { Component } from '../ecs/Component';

export class Credits extends Component {
    static type = 'Credits';

    newYen: number;
    credits: number;

    constructor(newYen: number = 0, credits: number = 0) {
        super();
        this.newYen = newYen;
        this.credits = credits;
    }

    // For backward compatibility if needed, though we should migrate
    get amount() { return this.credits; }
    set amount(val: number) { this.credits = val; }
}
