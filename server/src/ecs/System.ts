import { Entity } from './Entity';

export abstract class System {
    public abstract update(entities: Set<Entity>, deltaTime: number): void;
}
