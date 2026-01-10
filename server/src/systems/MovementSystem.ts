import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Server } from 'socket.io';

export class MovementSystem extends System {
    private pendingMoves: Map<string, { x: number, y: number }>;
    private io: Server;

    constructor(io: Server) {
        super();
        this.pendingMoves = new Map();
        this.io = io;
    }

    // Method to queue a move command from a player
    queueMove(entityId: string, direction: 'n' | 's' | 'e' | 'w') {
        let dx = 0;
        let dy = 0;

        switch (direction) {
            case 'n': dy = -1; break;
            case 's': dy = 1; break;
            case 'e': dx = 1; break;
            case 'w': dx = -1; break;
        }

        this.pendingMoves.set(entityId, { x: dx, y: dy });
    }

    update(entities: Set<Entity>, deltaTime: number): void {
        // Process all pending moves
        for (const [entityId, move] of this.pendingMoves.entries()) {
            const entity = Array.from(entities).find(e => e.id === entityId);
            if (!entity) continue;

            const pos = entity.getComponent(Position);
            if (!pos) continue;

            const targetX = pos.x + move.x;
            const targetY = pos.y + move.y;

            // Check if target room exists
            const targetRoom = this.findRoomAt(entities, targetX, targetY);

            if (targetRoom) {
                pos.x = targetX;
                pos.y = targetY;
                // Optional: Emit event that player moved?
            } else {
                this.io.to(entityId).emit('message', "You can't go that way.");
            }
        }

        // Clear processed moves
        this.pendingMoves.clear();
    }

    private findRoomAt(entities: Set<Entity>, x: number, y: number): Entity | undefined {
        for (const entity of entities) {
            if (entity.hasComponent(IsRoom)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    return entity;
                }
            }
        }
        return undefined;
    }
}
