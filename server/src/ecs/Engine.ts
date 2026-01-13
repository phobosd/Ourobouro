import { Entity } from './Entity';
import { System } from './System';
import { IEngine } from './IEngine';
import { Logger } from '../utils/Logger';
import { SpatialIndex } from '../utils/SpatialIndex';
import { Position } from '../components/Position';

export class Engine implements IEngine {
    private entities: Map<string, Entity>;
    private systems: System[];
    private componentIndex: Map<string, Set<string>>;
    private spatialIndex: SpatialIndex;
    private queryCache: Map<string, Entity[]>;

    constructor() {
        this.entities = new Map();
        this.systems = [];
        this.componentIndex = new Map();
        this.spatialIndex = new SpatialIndex();
        this.queryCache = new Map();
    }

    addEntity(entity: Entity): void {
        this.entities.set(entity.id, entity);
        // Index existing components
        entity.components.forEach((_, type) => {
            this.addToIndex(type, entity.id);
        });

        // Listen for future component changes
        entity.on('componentAdded', (type: string) => this.addToIndex(type, entity.id));
        entity.on('componentRemoved', (type: string) => this.removeFromIndex(type, entity.id));
    }

    removeEntity(entityId: string): void {
        const entity = this.entities.get(entityId);
        if (entity) {
            entity.components.forEach((_, type) => {
                this.removeFromIndex(type, entityId);
            });
            // Remove listeners
            entity.removeAllListeners('componentAdded');
            entity.removeAllListeners('componentRemoved');
        }
        this.entities.delete(entityId);
    }

    private addToIndex(componentType: string, entityId: string) {
        if (!this.componentIndex.has(componentType)) {
            this.componentIndex.set(componentType, new Set());
        }
        this.componentIndex.get(componentType)!.add(entityId);
        this.queryCache.delete(componentType);
    }

    private removeFromIndex(componentType: string, entityId: string) {
        const set = this.componentIndex.get(componentType);
        if (set) {
            set.delete(entityId);
            if (set.size === 0) {
                this.componentIndex.delete(componentType);
            }
        }
        this.queryCache.delete(componentType);
    }

    getEntitiesWithComponent<T extends any>(componentClass: any): Entity[] {
        const type = componentClass.type;

        if (this.queryCache.has(type)) {
            return this.queryCache.get(type)!;
        }

        const ids = this.componentIndex.get(type);
        if (!ids) return [];

        const entities = Array.from(ids)
            .map(id => this.entities.get(id))
            .filter((e): e is Entity => !!e);

        this.queryCache.set(type, entities);
        return entities;
    }

    getEntity(entityId: string): Entity | undefined {
        return this.entities.get(entityId);
    }

    getEntities(): Map<string, Entity> {
        return this.entities;
    }

    addSystem(system: System): void {
        this.systems.push(system);
    }

    getSystem<T>(systemClass: any): T | undefined {
        return this.systems.find(s => s instanceof systemClass) as T | undefined;
    }

    private reindexSpatial(): void {
        this.spatialIndex.clear();
        const entitiesWithPos = this.getEntitiesWithComponent(Position);
        for (const entity of entitiesWithPos) {
            const pos = entity.getComponent(Position);
            if (pos) {
                this.spatialIndex.add(entity.id, pos.x, pos.y);
            }
        }
    }

    getEntitiesAt(x: number, y: number): Entity[] {
        const ids = this.spatialIndex.getEntitiesAt(x, y);
        return ids
            .map(id => this.entities.get(id))
            .filter((e): e is Entity => !!e);
    }

    update(deltaTime: number): void {
        this.reindexSpatial();
        for (const system of this.systems) {
            try {
                system.update(this, deltaTime);
            } catch (error) {
                Logger.error('Engine', `Error in system ${system.constructor.name}:`, error);
            }
        }
    }
}
