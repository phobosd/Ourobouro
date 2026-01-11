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
import { IEngine } from '../commands/CommandRegistry';
import { WorldQuery } from '../utils/WorldQuery';
import { Description } from '../components/Description';

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
        if (!stance || !pos) return;

        if (stance.current === StanceType.Stasis) {
            this.messageService.error(socketId, "You are already jacked in.");
            return;
        }

        // Check for deck (simplified: just check if they have a deck item)
        // In a real implementation, we'd check inventory for an item with 'deck' attribute

        this.messageService.info(socketId, "Jacking in... The world fades into a grid of neon light.");

        // Set physical body to stasis
        stance.current = StanceType.Stasis;

        // Create PersonaAgent
        const persona = new Entity(`persona_${socketId}`);
        persona.addComponent(new IsPersona(socketId));
        persona.addComponent(new Position(100, 100)); // Cyberspace starts at 100, 100
        persona.addComponent(new Description("Persona", "Your digital avatar in the Matrix."));
        persona.addComponent(new CombatStats(100, 20, 10, false)); // Digital stats
        engine.addEntity(persona);

        // Notify client
        this.messageService.success(socketId, "Welcome to the Matrix, Console Cowboy.");

        // Move client's "view" to persona? 
        // In this engine, the socketId is the entityId of the player.
        // If we want the player to control the persona, we might need to swap the socketId mapping or handle it in systems.
        // For now, let's assume the player entity stays the same but gains 'IsPersona' or we handle it via a 'controller' component.
        // Actually, the user said "Instantiate a PersonaAgent in the nearest CyberspaceAgent node".
        // Let's just add IsPersona to the player entity for now to keep it simple, or handle the redirection.
    }

    handleJackOut(socketId: string, engine: IEngine) {
        const player = engine.getEntity(socketId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        if (!stance || stance.current !== StanceType.Stasis) {
            this.messageService.error(socketId, "You are not jacked in.");
            return;
        }

        this.messageService.info(socketId, "Jacking out... The neon grid collapses back into meat-space.");
        stance.current = StanceType.Standing;

        // Remove PersonaAgent
        const personaId = `persona_${socketId}`;
        engine.removeEntity(personaId);
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
