import { Component } from '../ecs/Component';

export enum StanceType {
    Standing = 'standing',
    Sitting = 'sitting',
    Lying = 'lying',
    Stasis = 'stasis'
}

export class Stance extends Component {
    public current: StanceType = StanceType.Standing;

    constructor(initial: StanceType = StanceType.Standing) {
        super();
        this.current = initial;
    }
}
