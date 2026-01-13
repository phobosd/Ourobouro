import { System } from '../ecs/System';
import { Description } from '../components/Description';
import { Terminal } from '../components/Terminal';
import { Server } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';
import { PuzzleManager } from '../services/PuzzleManager';
import { CommerceSystem } from '../services/CommerceSystem';
import { MessageService } from '../services/MessageService';
import { Position } from '../components/Position';

export class InteractionSystem extends System {
    private io: Server;
    private messageService: MessageService;
    private puzzleManager: PuzzleManager;
    private commerceSystem: CommerceSystem;

    constructor(io: Server) {
        super();
        this.io = io;
        this.messageService = new MessageService(io);
        this.puzzleManager = new PuzzleManager(io, this.messageService);
        this.commerceSystem = new CommerceSystem(io, this.messageService);
    }

    update(engine: IEngine, deltaTime: number): void {
        // Interacting with objects
    }

    handleRead(entityId: string, engine: IEngine, targetName: string) {
        if (targetName.toLowerCase() === 'guide') {
            try {
                const guidePath = path.join(process.cwd(), '../docs/USERS_GUIDE.md');
                const guideContent = fs.readFileSync(guidePath, 'utf-8');
                this.io.to(entityId).emit('open-guide', { content: guideContent });
                this.messageService.system(entityId, "Opening User's Guide...");
            } catch (err) {
                console.error("Error reading guide:", err);
                this.messageService.error(entityId, "Failed to load User's Guide.");
            }
            return;
        }

        if (targetName.toLowerCase() === 'compendium') {
            try {
                const compendiumPath = path.join(process.cwd(), '../docs/COMPENDIUM.md');
                const content = fs.readFileSync(compendiumPath, 'utf-8');
                this.io.to(entityId).emit('open-guide', { content: content });
                this.messageService.system(entityId, "Opening Compendium...");
            } catch (err) {
                console.error("Error reading compendium:", err);
                this.messageService.error(entityId, "Failed to load Compendium.");
            }
            return;
        }

        if (targetName.toLowerCase() === 'areas' || targetName.toLowerCase() === 'map_guide') {
            try {
                const areasPath = path.join(process.cwd(), '../AREAS.md');
                const content = fs.readFileSync(areasPath, 'utf-8');
                this.io.to(entityId).emit('open-guide', { content: content });
                this.messageService.system(entityId, "Opening Area Guide...");
            } catch (err) {
                console.error("Error reading areas:", err);
                this.messageService.error(entityId, "Failed to load Area Guide.");
            }
            return;
        }

        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const playerPos = player.getComponent(Position);
        if (!playerPos) return;

        // Find items/objects at player position
        const targetEntity = engine.getEntitiesAt(playerPos.x, playerPos.y).find(e => {
            const desc = e.getComponent(Description);
            return desc && desc.title.toLowerCase().includes(targetName.toLowerCase());
        });

        if (!targetEntity) {
            this.messageService.info(entityId, `You don't see '${targetName}' here.`);
            return;
        }

        const terminal = targetEntity.getComponent(Terminal);
        if (terminal) {
            this.commerceSystem.handleTerminalRead(entityId, engine, targetEntity);
        } else {
            const desc = targetEntity.getComponent(Description);
            if (desc) {
                this.messageService.info(entityId, desc.description);
            } else {
                this.messageService.info(entityId, "There's nothing to read on that.");
            }
        }
    }

    handleTerminalBuy(entityId: string, engine: IEngine, itemName: string, cost: number) {
        return this.commerceSystem.handleTerminalBuy(entityId, engine, itemName, cost);
    }

    handleTurn(entityId: string, engine: IEngine, targetName: string, direction: string) {
        this.puzzleManager.handleTurn(entityId, engine, targetName, direction);
    }
}
