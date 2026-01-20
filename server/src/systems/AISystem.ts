import { System } from '../ecs/System';
import { IEngine } from '../ecs/IEngine';
import { NPC } from '../components/NPC';
import { Schedule } from '../components/Schedule';
import { Position } from '../components/Position';
import { Needs } from '../components/Needs';
import { TimeSystem } from './TimeSystem';
import { Logger } from '../utils/Logger';
import { GameEventBus, GameEventType } from '../utils/GameEventBus';

export class AISystem extends System {
    private timeSystem: TimeSystem;
    private lastProcessedHour: number = -1;
    private processTimer: number = 0;
    private readonly PROCESS_INTERVAL = 5000; // Process needs every 5 seconds

    constructor(timeSystem: TimeSystem) {
        super();
        this.timeSystem = timeSystem;
    }

    update(engine: IEngine, deltaTime: number): void {
        const currentHour = this.timeSystem.getHours();

        // 1. Process Schedules (on hour change)
        if (currentHour !== this.lastProcessedHour) {
            this.lastProcessedHour = currentHour;
            this.processSchedules(engine, currentHour);
        }

        // 2. Process Needs (periodically)
        this.processTimer += deltaTime;
        if (this.processTimer >= this.PROCESS_INTERVAL) {
            this.processTimer = 0;
            this.processNeeds(engine);
        }
    }

    private processSchedules(engine: IEngine, hour: number) {
        const entities = engine.getEntitiesWithComponent(Schedule);

        entities.forEach(entity => {
            const schedule = entity.getComponent(Schedule);
            const pos = entity.getComponent(Position);
            const npc = entity.getComponent(NPC);

            if (schedule && pos && npc) {
                const entry = schedule.getCurrentEntry(hour);
                if (entry) {
                    if (pos.x !== entry.location.x || pos.y !== entry.location.y) {
                        Logger.info('AI', `NPC ${npc.typeName} (${entity.id}) moving to ${entry.location.x},${entry.location.y} for activity: ${entry.activity}`);
                        this.moveTowards(pos, entry.location, entity.id);
                    }
                }
            }
        });
    }

    private processNeeds(engine: IEngine) {
        const entities = engine.getEntitiesWithComponent(Needs);

        entities.forEach(entity => {
            const needs = entity.getComponent(Needs);
            if (needs) {
                // Decay/Increase needs over time
                needs.hunger = Math.min(100, needs.hunger + 1);
                needs.social = Math.max(0, needs.social - 0.5);

                // Simple Goal Selection based on needs
                if (needs.hunger > 80) {
                    // TODO: Set goal to find food
                }
            }
        });
    }

    private moveTowards(currentPos: Position, target: { x: number, y: number }, npcId: string) {
        const fromX = currentPos.x;
        const fromY = currentPos.y;

        // Move one step at a time towards target
        if (currentPos.x < target.x) currentPos.x++;
        else if (currentPos.x > target.x) currentPos.x--;

        if (currentPos.y < target.y) currentPos.y++;
        else if (currentPos.y > target.y) currentPos.y--;

        if (fromX !== currentPos.x || fromY !== currentPos.y) {
            GameEventBus.getInstance().emit(GameEventType.NPC_MOVED, {
                npcId,
                fromX,
                fromY,
                toX: currentPos.x,
                toY: currentPos.y
            });
        }
    }
}
