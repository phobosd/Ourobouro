import { System } from '../ecs/System';
import { Stance, StanceType } from '../components/Stance';
import { WorldQuery } from '../utils/WorldQuery';
import { IEngine } from '../ecs/IEngine';
import { MessageService } from '../services/MessageService';
import { MessageFormatter } from '../utils/MessageFormatter';
import { Server } from 'socket.io';

export class StanceSystem extends System {
    private messageService: MessageService;

    constructor(private io: Server) {
        super();
        this.messageService = new MessageService(io);
    }

    update(engine: IEngine, deltaTime: number): void {
        // Stance-related logic
    }

    handleStanceChange(entityId: string, newStance: StanceType, engine: IEngine) {
        const player = WorldQuery.getEntityById(engine, entityId);
        if (!player) return;

        const stance = player.getComponent(Stance);
        if (!stance) return;

        if (stance.current === StanceType.Stasis) {
            this.messageService.error(entityId, "You cannot change your physical stance while jacked into the Matrix.");
            return;
        }

        if (stance.current === newStance) {
            this.messageService.info(entityId, `You are already ${newStance}.`);
            return;
        }

        stance.current = newStance;
        let msg = "";
        switch (newStance) {
            case StanceType.Standing: msg = MessageFormatter.system("You stand up."); break;
            case StanceType.Sitting: msg = MessageFormatter.system("You sit down."); break;
            case StanceType.Lying: msg = MessageFormatter.system("You lie down."); break;
        }

        this.messageService.system(entityId, msg);
    }
}
