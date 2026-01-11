import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { NPC } from '../components/NPC';
import { Server } from 'socket.io';

export class NPCSystem extends System {
    private io: Server;
    private lastBarkTime: Map<string, number> = new Map();
    private lastMoveTime: Map<string, number> = new Map();

    constructor(io: Server) {
        super();
        this.io = io;
    }

    update(entities: Set<Entity>, deltaTime: number): void {
        const now = Date.now();

        for (const entity of entities) {
            if (entity.hasComponent(NPC)) {
                this.handleNPCBehavior(entity, now, entities);
            }
        }
    }

    private handleNPCBehavior(npc: Entity, now: number, entities: Set<Entity>) {
        const npcComp = npc.getComponent(NPC);
        const pos = npc.getComponent(Position);

        if (!npcComp || !pos) return;

        // 1. Random Movement (every 5-10 seconds)
        if (!this.lastMoveTime.has(npc.id)) this.lastMoveTime.set(npc.id, now);
        if (now - this.lastMoveTime.get(npc.id)! > 5000 + Math.random() * 5000) {
            this.moveRandomly(npc, pos, entities);
            this.lastMoveTime.set(npc.id, now);
        }

        // 2. Random Barks (every 10-20 seconds)
        if (!this.lastBarkTime.has(npc.id)) this.lastBarkTime.set(npc.id, now);
        if (now - this.lastBarkTime.get(npc.id)! > 10000 + Math.random() * 10000) {
            this.bark(npc, npcComp, pos, entities);
            this.lastBarkTime.set(npc.id, now);
        }
    }

    private moveRandomly(npc: Entity, pos: Position, entities: Set<Entity>) {
        const npcComp = npc.getComponent(NPC);

        // Don't move Giant Rats - they stay in place
        if (npcComp && npcComp.typeName === 'Giant Rat') {
            return;
        }

        const directions = [
            { x: 0, y: -1, name: 'north', reverse: 'south' },
            { x: 0, y: 1, name: 'south', reverse: 'north' },
            { x: 1, y: 0, name: 'east', reverse: 'west' },
            { x: -1, y: 0, name: 'west', reverse: 'east' }
        ];
        const move = directions[Math.floor(Math.random() * directions.length)];

        const newX = pos.x + move.x;
        const newY = pos.y + move.y;

        // Check if the new position is a valid room
        const targetRoom = this.findRoomAt(entities, newX, newY);

        if (targetRoom) {
            const name = npcComp ? npcComp.typeName : 'Something';

            // Broadcast leaving message to old room
            this.broadcastToRoom(entities, pos.x, pos.y, `<movement>${name} has left to the ${move.name}.</movement>`);

            pos.x = newX;
            pos.y = newY;

            // Broadcast entering message to new room
            this.broadcastToRoom(entities, pos.x, pos.y, `<movement>${name} has entered from the ${move.reverse}.</movement>`);
        }
    }

    private findRoomAt(entities: Set<Entity>, x: number, y: number): Entity | undefined {
        for (const entity of entities) {
            // Check for IsRoom component (assuming we import it or check existence)
            // Since IsRoom is a component, we need to check if entity has it.
            // However, IsRoom is not imported in this file yet.
            // We can check by component type name if we don't want to add import,
            // or better, add the import.
            // Let's rely on the fact that rooms have Description and Position.
            // But checking IsRoom is safer.
            // Let's assume we will add the import.
            if (entity.constructor.name === 'Entity' && entity.components.has('IsRoom')) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    return entity;
                }
            }
        }
        return undefined;
    }

    private broadcastToRoom(entities: Set<Entity>, x: number, y: number, message: string) {
        for (const entity of entities) {
            if (!entity.hasComponent(NPC)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    this.io.to(entity.id).emit('message', message);
                }
            }
        }
    }

    private bark(npc: Entity, npcComp: NPC, pos: Position, entities: Set<Entity>) {
        const bark = npcComp.barks[Math.floor(Math.random() * npcComp.barks.length)];
        const message = `<speech>[${npcComp.typeName}] says: "${bark}"</speech>`;

        // Broadcast to players in the same room
        for (const entity of entities) {
            // Check if entity is a player (has socket ID as ID usually)
            // For now, we assume entities with no NPC component are players
            if (entity.hasComponent(NPC)) continue;

            const entityPos = entity.getComponent(Position);
            if (entityPos) {
                // Exact match check
                if (entityPos.x === pos.x && entityPos.y === pos.y) {
                    this.io.to(entity.id).emit('message', message);
                }
            }
        }
    }
}
