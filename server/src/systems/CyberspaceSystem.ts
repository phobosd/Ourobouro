import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Position } from '../components/Position';
import { Stance, StanceType } from '../components/Stance';
import { IsPersona } from '../components/IsPersona';
import { IsCyberspace } from '../components/IsCyberspace';
import { IsICE } from '../components/IsICE';
import { CombatStats } from '../components/CombatStats';
import { Server } from 'socket.io';
import { MessageService } from '../services/MessageService';
import { IEngine } from '../ecs/IEngine';
import { WorldQuery } from '../utils/WorldQuery';
import { Description } from '../components/Description';
import { Item } from '../components/Item';
import { Container } from '../components/Container';
import { Inventory } from '../components/Inventory';
import { ObservationSystem } from './ObservationSystem';
import { Roundtime } from '../components/Roundtime';
import { EngagementTier } from '../types/CombatTypes';

export class CyberspaceSystem extends System {
    private io: Server;
    private messageService: MessageService;

    constructor(io: Server, messageService: MessageService) {
        super();
        this.io = io;
        this.messageService = messageService;
    }

    update(engine: IEngine, deltaTime: number): void {
        // Handle ICE behaviors or Matrix-specific timed events
    }

    handleJackIn(socketId: string, engine: IEngine) {
        const player = engine.getEntity(socketId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        const pos = player.getComponent(Position);
        const inventory = player.getComponent(Inventory);
        if (!stance || !pos || !inventory) return;

        if (player.hasComponent(IsPersona) || pos.x >= 10000) {
            this.messageService.error(socketId, "You are already jacked in.");
            return;
        }

        if (stance.current !== StanceType.Standing) {
            this.messageService.error(socketId, "You must be standing to jack in.");
            return;
        }

        const combatStats = player.getComponent(CombatStats);
        if (combatStats && combatStats.engagementTier !== EngagementTier.DISENGAGED) {
            this.messageService.error(socketId, "You cannot jack in while engaged in combat!");
            return;
        }

        // Check for Cyberdeck in HANDS
        let hasDeck = false;
        const checkItemForDeck = (itemId: string | null) => {
            if (!itemId) return false;
            const item = WorldQuery.getEntityById(engine, itemId);
            const itemComp = item?.getComponent(Item);
            return itemComp && (itemComp.name.toLowerCase().includes('deck') || itemComp.attributes.includes('deck'));
        };

        if (checkItemForDeck(inventory.leftHand) || checkItemForDeck(inventory.rightHand)) {
            hasDeck = true;
        }

        if (!hasDeck) {
            this.messageService.error(socketId, "You must be holding a Cyberdeck in your hands to jack in.");
            return;
        }

        this.messageService.info(socketId, "Jacking in... The world fades into a grid of neon light.");

        // Set physical body to stasis
        stance.current = StanceType.Stasis;

        // Add Persona component to track state
        player.addComponent(new IsPersona(player.id));

        // Move to Matrix offset (10000)
        pos.x += 10000;

        // Notify client to change UI
        this.io.to(socketId).emit('cyberspace-state', { active: true });

        this.messageService.success(socketId, "Welcome to the Matrix, Console Cowboy.");

        // Add 4 second round timer
        player.addComponent(new Roundtime(4));

        // Force a look to show the digital room
        engine.getSystem<ObservationSystem>(ObservationSystem)?.handleLook(socketId, engine);
    }

    handleJackOut(socketId: string, engine: IEngine) {
        const player = engine.getEntity(socketId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        const pos = player.getComponent(Position);
        const inventory = player.getComponent(Inventory);
        if (!stance || !pos || !inventory) return;

        if (!player.hasComponent(IsPersona) && pos.x < 10000) {
            this.messageService.error(socketId, "You are not jacked in.");
            return;
        }

        const combatStats = player.getComponent(CombatStats);
        if (combatStats && combatStats.engagementTier !== EngagementTier.DISENGAGED) {
            this.messageService.error(socketId, "You cannot jack out while engaged in combat!");
            return;
        }

        // Check for Cyberdeck in HANDS (Physical body is in stasis, but we check if it's still there)
        let hasDeck = false;
        const checkItemForDeck = (itemId: string | null) => {
            if (!itemId) return false;
            const item = WorldQuery.getEntityById(engine, itemId);
            const itemComp = item?.getComponent(Item);
            return itemComp && (itemComp.name.toLowerCase().includes('deck') || itemComp.attributes.includes('deck'));
        };

        if (checkItemForDeck(inventory.leftHand) || checkItemForDeck(inventory.rightHand)) {
            hasDeck = true;
        }

        if (!hasDeck) {
            this.messageService.error(socketId, "You must be holding a Cyberdeck to maintain the connection.");
            return;
        }

        this.messageService.info(socketId, "Jacking out... The neon grid collapses back into meat-space.");

        // Move back to meat-space
        if (pos.x >= 10000) {
            pos.x -= 10000;
        }

        stance.current = StanceType.Standing;

        // Remove Persona component
        player.removeComponent(IsPersona);

        // Notify client to restore UI
        this.io.to(socketId).emit('cyberspace-state', { active: false });

        this.messageService.success(socketId, "Connection terminated. You are back in your body.");

        // Add 4 second round timer
        player.addComponent(new Roundtime(4));

        // Force a look to show the physical room
        engine.getSystem<ObservationSystem>(ObservationSystem)?.handleLook(socketId, engine);
    }

    applyLethalFeedback(socketId: string, damage: number, engine: IEngine) {
        const player = engine.getEntity(socketId);
        if (!player) return;

        const combatStats = player.getComponent(CombatStats);
        if (combatStats) {
            combatStats.hp -= damage;
            this.messageService.error(socketId, `[LETHAL FEEDBACK] Your nervous system screams as ${damage} damage is uploaded directly to your brain!`);

            if (combatStats.hp <= 0) {
                this.messageService.error(socketId, "FATAL ERROR: Brain-dead in the Matrix.");
                // Handle death...
            }
        }
    }
}
