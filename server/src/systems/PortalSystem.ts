import { System } from '../ecs/System';
import { Position } from '../components/Position';
import { Portal } from '../components/Portal';
import { Description } from '../components/Description';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';
import { MessageService } from '../services/MessageService';
import { DungeonService } from '../services/DungeonService';
import { Server } from 'socket.io';

export class PortalSystem extends System {
    private messageService: MessageService;

    constructor(private io: Server) {
        super();
        this.messageService = new MessageService(io);
    }

    update(engine: IEngine, deltaTime: number): void {
        // Portal logic could go here
    }

    handleEnter(entityId: string, engine: IEngine, targetName: string) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // Find portal at player position
        let portalEntity = engine.getEntitiesWithComponent(Portal).find(e => {
            const pos = e.getComponent(Position);
            const desc = e.getComponent(Description);
            return pos && pos.x === playerPos.x && pos.y === playerPos.y &&
                (targetName === '' || (desc && desc.title.toLowerCase().includes(targetName.toLowerCase())));
        });

        // Fallback: If target is "door" and we didn't find one, but there is A portal, take it.
        if (!portalEntity && targetName.toLowerCase() === 'door') {
            portalEntity = engine.getEntitiesWithComponent(Portal).find(e => {
                const pos = e.getComponent(Position);
                return pos && pos.x === playerPos.x && pos.y === playerPos.y;
            });
        }

        if (!portalEntity) {
            this.messageService.info(entityId, "You don't see anything to enter here.");
            return;
        }

        const portal = portalEntity.getComponent(Portal);
        if (!portal) return;

        if (portal.destinationType === 'dungeon') {
            console.log(`[PortalSystem] Entering dungeon for ${entityId}`);
            DungeonService.getInstance(engine, this.messageService)?.enterDungeon(entityId);
        } else if (portal.destinationType === 'room') {
            // Check if player is currently in dungeon
            if (playerPos.x >= 2000) {
                // Leaving dungeon
                DungeonService.getInstance(engine, this.messageService)?.leaveDungeon(entityId);
            } else {
                // Regular door - just a flavor message
                this.messageService.info(entityId, "You step through the doorway...");
            }
        }
    }
}
