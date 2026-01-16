import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { NPC } from '../components/NPC';
import { Server } from 'socket.io';
import { IEngine } from '../ecs/IEngine';
import { MessageService } from '../services/MessageService';
import { GameEventBus, GameEventType } from '../utils/GameEventBus';

import { LLMService } from '../generation/llm/LLMService';
import { NPCMovementHandler } from './npc/NPCMovementHandler';
import { NPCBehaviorHandler } from './npc/NPCBehaviorHandler';
import { NPCCombatHandler } from './npc/NPCCombatHandler';

export class NPCSystem extends System {
    private io: Server;
    private messageService: MessageService;
    private lastBarkTime: Map<string, number> = new Map();
    private lastMoveTime: Map<string, number> = new Map();
    private combatSystem: any;
    private engine?: IEngine;
    private llm?: LLMService;

    constructor(io: Server, messageService: MessageService, llm?: LLMService) {
        super();
        this.io = io;
        this.messageService = messageService;
        this.llm = llm;

        // Subscribe to player movement
        GameEventBus.getInstance().subscribe(GameEventType.PLAYER_MOVED, (payload) => {
            if (this.engine) {
                this.onPlayerMoved(payload.playerId, payload.toX, payload.toY, this.engine);
            }
        });
    }

    setCombatSystem(combatSystem: any) {
        this.combatSystem = combatSystem;
    }

    update(engine: IEngine, deltaTime: number): void {
        this.engine = engine;
        const now = Date.now();
        const npcs = engine.getEntitiesWithComponent(NPC);

        for (const npc of npcs) {
            this.handleNPCBehavior(npc, now, engine);
        }
    }

    public onPlayerMoved(playerId: string, x: number, y: number, engine: IEngine): void {
        NPCCombatHandler.onPlayerMoved(playerId, x, y, engine, this.messageService);
    }

    // Called when an NPC is spawned to immediately detect nearby players
    public onNPCSpawned(npc: Entity, engine: IEngine): void {
        NPCCombatHandler.onNPCSpawned(npc, engine, this.messageService);
    }

    private handleNPCBehavior(npc: Entity, now: number, engine: IEngine) {
        const npcComp = npc.getComponent(NPC);
        const pos = npc.getComponent(Position);

        if (!npcComp || !pos) return;

        // 1. Random Movement (every 15-30 seconds)
        if (!this.lastMoveTime.has(npc.id)) this.lastMoveTime.set(npc.id, now);
        if (now - this.lastMoveTime.get(npc.id)! > 15000 + Math.random() * 15000) {
            NPCMovementHandler.moveRandomly(npc, pos, engine, this.messageService);
            this.lastMoveTime.set(npc.id, now);
        }

        // 2. Random Barks (every 10-20 seconds)
        if (!this.lastBarkTime.has(npc.id)) this.lastBarkTime.set(npc.id, now);
        if (now - this.lastBarkTime.get(npc.id)! > 10000 + Math.random() * 10000) {
            NPCBehaviorHandler.bark(npc, npcComp, pos, engine, this.messageService, this.llm);
            this.lastBarkTime.set(npc.id, now);
        }

        // 3. Combat Behavior
        if (this.combatSystem) {
            NPCCombatHandler.handleNPCCombat(npc, npcComp, pos, engine, this.messageService, this.combatSystem);
        }
    }
}
