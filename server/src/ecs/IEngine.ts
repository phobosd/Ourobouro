import { Entity } from './Entity';

export interface IEngine {
    addEntity(entity: Entity): void;
    removeEntity(entityId: string): void;
    getEntity(entityId: string): Entity | undefined;
    getEntities(): Map<string, Entity>;
    getEntitiesWithComponent<T extends any>(componentClass: any): Entity[];
    getEntitiesAt(x: number, y: number): Entity[];
    getSystem<T>(systemClass: any): T | undefined;
}
