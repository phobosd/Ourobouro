export abstract class Component {
    public static type: string;
    constructor() { }
}

export type ComponentClass<T extends Component> = new (...args: any[]) => T;
