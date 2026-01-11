import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { NPC } from '../components/NPC';
import { Server } from 'socket.io';
import { WorldQuery } from '../utils/WorldQuery';
import { IsRoom } from '../components/IsRoom';
import { IEngine } from '../commands/CommandRegistry';

import { MessageService } from '../services/MessageService';

export class NPCSystem extends System {
    private io: Server;
    private messageService: MessageService;
    private lastBarkTime: Map<string, number> = new Map();
    private lastMoveTime: Map<string, number> = new Map();

    constructor(io: Server, messageService: MessageService) {
        super();
        this.io = io;
        this.messageService = messageService;
    }

    update(engine: IEngine, deltaTime: number): void {
        const now = Date.now();
        const npcs = engine.getEntitiesWithComponent(NPC);

        for (const npc of npcs) {
            this.handleNPCBehavior(npc, now, engine);
        }
    }

    private handleNPCBehavior(npc: Entity, now: number, engine: IEngine) {
        const npcComp = npc.getComponent(NPC);
        const pos = npc.getComponent(Position);

        if (!npcComp || !pos) return;

        // 1. Random Movement (every 5-10 seconds)
        if (!this.lastMoveTime.has(npc.id)) this.lastMoveTime.set(npc.id, now);
        if (now - this.lastMoveTime.get(npc.id)! > 5000 + Math.random() * 5000) {
            this.moveRandomly(npc, pos, engine);
            this.lastMoveTime.set(npc.id, now);
        }

        // 2. Random Barks (every 10-20 seconds)
        if (!this.lastBarkTime.has(npc.id)) this.lastBarkTime.set(npc.id, now);
        if (now - this.lastBarkTime.get(npc.id)! > 10000 + Math.random() * 10000) {
            this.bark(npc, npcComp, pos, engine);
            this.lastBarkTime.set(npc.id, now);
        }
    }

    private moveRandomly(npc: Entity, pos: Position, engine: IEngine) {
        const npcComp = npc.getComponent(NPC);

        // Check if NPC is allowed to move
        if (npcComp && !npcComp.canMove) {
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
        const targetRoom = WorldQuery.findRoomAt(engine, newX, newY);

        if (targetRoom) {
            const name = npcComp ? npcComp.typeName : 'Something';

            // Broadcast leaving message to old room
            this.broadcastToRoom(engine, pos.x, pos.y, `<movement>${name} has left to the ${move.name}.</movement>`);

            pos.x = newX;
            pos.y = newY;

            // Broadcast entering message to new room
            this.broadcastToRoom(engine, pos.x, pos.y, `<movement>${name} has entered from the ${move.reverse}.</movement>`);
        }
    }


    private broadcastToRoom(engine: IEngine, x: number, y: number, message: string) {
        for (const entity of engine.getEntities().values()) {
            if (!entity.hasComponent(NPC)) {
                const pos = entity.getComponent(Position);
                if (pos && pos.x === x && pos.y === y) {
                    this.messageService.info(entity.id, message);
                }
            }
        }
    }

    private bark(npc: Entity, npcComp: NPC, pos: Position, engine: IEngine) {
        const bark = npcComp.barks[Math.floor(Math.random() * npcComp.barks.length)];
        const message = `<speech>[${npcComp.typeName}] says: "${bark}"</speech>`;

        // Broadcast to players in the same room
        for (const entity of engine.getEntities().values()) {
            // Check if entity is a player (has socket ID as ID usually)
            // For now, we assume entities with no NPC component are players
            if (entity.hasComponent(NPC)) continue;

            const entityPos = entity.getComponent(Position);
            if (entityPos) {
                // Exact match check
                if (entityPos.x === pos.x && entityPos.y === pos.y) {
                    this.messageService.info(entity.id, message);
                }
            }
        }
    }
}
