import { Entity } from './Entity';
import { System } from './System';

export class Engine {
    private entities: Map<string, Entity>;
    private systems: System[];

    constructor() {
        this.entities = new Map();
        this.systems = [];
    }

    addEntity(entity: Entity): void {
        this.entities.set(entity.id, entity);
    }

    removeEntity(entityId: string): void {
        this.entities.delete(entityId);
    }

    getEntity(entityId: string): Entity | undefined {
        return this.entities.get(entityId);
    }

    addSystem(system: System): void {
        this.systems.push(system);
    }

    update(deltaTime: number): void {
        const entitySet = new Set(this.entities.values());
        for (const system of this.systems) {
            system.update(entitySet, deltaTime);
        }
    }
}
