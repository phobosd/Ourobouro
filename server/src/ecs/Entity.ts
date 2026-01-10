import { Component, ComponentClass } from './Component';
import { v4 as uuidv4 } from 'uuid';

export class Entity {
    public id: string;
    public components: Map<string, Component>;

    constructor(id?: string) {
        this.id = id || uuidv4();
        this.components = new Map();
    }

    addComponent(component: Component): void {
        const type = (component.constructor as any).type;
        this.components.set(type, component);
    }

    getComponent<T extends Component>(componentClass: ComponentClass<T>): T | undefined {
        return this.components.get((componentClass as any).type) as T;
    }

    hasComponent<T extends Component>(componentClass: ComponentClass<T>): boolean {
        return this.components.has((componentClass as any).type);
    }

    removeComponent<T extends Component>(componentClass: ComponentClass<T>): void {
        this.components.delete((componentClass as any).type);
    }

    toJSON() {
        const componentsObj: any = {};
        this.components.forEach((component, type) => {
            componentsObj[type] = component;
        });
        return {
            id: this.id,
            components: componentsObj
        };
    }
}
