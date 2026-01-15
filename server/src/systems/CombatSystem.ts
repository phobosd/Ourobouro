import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Server } from 'socket.io';
import { IEngine } from '../ecs/IEngine';
import { MessageService } from '../services/MessageService';
import { CombatStats } from '../components/CombatStats';
import { NPC } from '../components/NPC';

// New Combat System Modules
import { CombatUtils } from './combat/CombatUtils';
import { CombatLogger } from './combat/CombatLogger';
import { ReloadHandler } from './combat/ActionHandlers/ReloadHandler';
import { ManeuverHandler } from './combat/ActionHandlers/ManeuverHandler';
import { AttackHandler } from './combat/ActionHandlers/AttackHandler';
import { SequenceHandler } from './combat/ActionHandlers/SequenceHandler';
import { SpecialHandler } from './combat/ActionHandlers/SpecialHandler';
import { DefenseHandler } from './combat/ActionHandlers/DefenseHandler';
import { AutomationManager } from './combat/AutomationManager';

export class CombatSystem extends System {
    private engine: IEngine;
    private io: Server;
    private messageService: MessageService;

    constructor(engine: IEngine, io: Server, messageService: MessageService) {
        super();
        this.engine = engine;
        this.io = io;
        this.messageService = messageService;
    }

    // --- Command Handlers (Entry Points) ---

    handleAttack(attackerId: string, targetName: string, engine: IEngine, moveType?: string): void {
        AttackHandler.handleAttack(attackerId, targetName, engine, this.messageService, this.io, moveType);
    }

    handleSyncResult(attackerId: string, targetId: string, hitType: 'crit' | 'hit' | 'miss', engine: IEngine, damageMultiplier: number = 1.0, moveType?: string): void {
        AttackHandler.handleSyncResult(attackerId, targetId, hitType, engine, this.messageService, this.io, damageMultiplier, moveType);
    }

    handleImmediateParry(playerId: string, engine: IEngine): void {
        AttackHandler.handleImmediateParry(playerId, engine, this.messageService);
    }

    handleNPCAttack(npcId: string, targetId: string, engine: IEngine): void {
        AttackHandler.handleNPCAttack(npcId, targetId, engine, this.messageService, this.io);
    }

    handleReload(playerId: string, engine: IEngine): void {
        ReloadHandler.handleReload(playerId, engine, this.messageService);
    }

    handleCheckAmmo(playerId: string, engine: IEngine): void {
        ReloadHandler.handleCheckAmmo(playerId, engine, this.messageService);
    }

    handleManeuver(playerId: string, direction: 'CLOSE' | 'WITHDRAW', engine: IEngine, targetName?: string): void {
        ManeuverHandler.handleManeuver(playerId, direction, engine, this.messageService, this.io, targetName);
    }

    handleAdvance(playerId: string, targetName: string, engine: IEngine): void {
        ManeuverHandler.handleAdvance(playerId, targetName, engine, this.messageService, this.io);
    }

    handleRetreat(playerId: string, targetName: string, engine: IEngine): void {
        ManeuverHandler.handleRetreat(playerId, targetName, engine, this.messageService, this.io);
    }

    handleFlee(playerId: string, direction: string | undefined, engine: IEngine): void {
        ManeuverHandler.handleFlee(playerId, direction, engine, this.messageService);
    }

    handleIaijutsu(playerId: string, targetName: string, engine: IEngine): void {
        SpecialHandler.handleIaijutsu(playerId, targetName, engine, this.messageService, this.io);
    }

    handleAssess(playerId: string, engine: IEngine): void {
        CombatLogger.handleAssess(playerId, engine, this.messageService);
    }

    handleAppraise(playerId: string, targetName: string, engine: IEngine): void {
        CombatLogger.handleAppraise(playerId, targetName, engine, this.messageService);
    }

    handleBalance(playerId: string, engine: IEngine): void {
        CombatLogger.handleBalance(playerId, engine, this.messageService);
    }

    handleTarget(playerId: string, part: string, engine: IEngine): void {
        DefenseHandler.handleTarget(playerId, part, engine, this.messageService);
    }

    handleStance(playerId: string, args: string[], engine: IEngine): void {
        DefenseHandler.handleStance(playerId, args, engine, this.messageService);
    }

    handleHangback(playerId: string, engine: IEngine): void {
        DefenseHandler.handleHangback(playerId, engine, this.messageService);
    }

    handleStop(playerId: string, engine: IEngine): void {
        AutomationManager.handleStop(playerId, engine, this.messageService);
    }

    executeBuffer(playerId: string, engine: IEngine): void {
        SequenceHandler.executeBuffer(playerId, engine, this.messageService, this.io, this);
    }

    // --- ECS Update Loop ---

    update(engine: IEngine, deltaTime: number): void {
        AutomationManager.processAutomatedActions(engine, this.messageService, this.io);
        AutomationManager.processRegeneration(engine, deltaTime);

        // Send combat state updates to players periodically (approx every 200ms)
        if (Math.random() < 0.2) {
            const players = engine.getEntitiesWithComponent(CombatStats).filter(e => !e.hasComponent(NPC));
            players.forEach(player => {
                CombatLogger.sendCombatState(player.id, engine, this.io);
            });
        }
    }
}
