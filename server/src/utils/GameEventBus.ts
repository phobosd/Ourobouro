import { EventEmitter } from 'events';

export enum GameEventType {
    PLAYER_MOVED = 'PLAYER_MOVED',
    ENTITY_SPAWNED = 'ENTITY_SPAWNED',
    ENTITY_DESTROYED = 'ENTITY_DESTROYED',
    COMBAT_START = 'COMBAT_START',
    COMBAT_END = 'COMBAT_END',
    ITEM_PICKED_UP = 'ITEM_PICKED_UP',
    ITEM_DROPPED = 'ITEM_DROPPED',
    PLAYER_CONNECTED = 'PLAYER_CONNECTED',
    PLAYER_DISCONNECTED = 'PLAYER_DISCONNECTED',
    CONFIG_UPDATED = 'CONFIG_UPDATED',
    NPC_MOVED = 'NPC_MOVED'
}

export interface GameEventPayloads {
    [GameEventType.PLAYER_MOVED]: { playerId: string, fromX: number, fromY: number, toX: number, toY: number };
    [GameEventType.ENTITY_SPAWNED]: { entityId: string, type: string };
    [GameEventType.ENTITY_DESTROYED]: { entityId: string, x?: number, y?: number };
    [GameEventType.COMBAT_START]: { attackerId: string, targetId: string };
    [GameEventType.COMBAT_END]: { attackerId: string, targetId: string, winnerId?: string };
    [GameEventType.ITEM_PICKED_UP]: { entityId: string, itemId: string };
    [GameEventType.ITEM_DROPPED]: { entityId: string, itemId: string };
    [GameEventType.PLAYER_CONNECTED]: { playerId: string, characterId: number, username: string };
    [GameEventType.PLAYER_DISCONNECTED]: { playerId: string };
    [GameEventType.CONFIG_UPDATED]: { aiConfig?: any, glitchConfig?: any };
    [GameEventType.NPC_MOVED]: { npcId: string, fromX: number, fromY: number, toX: number, toY: number };
}

export class GameEventBus {
    private static instance: GameEventBus;
    private emitter: EventEmitter;

    private constructor() {
        this.emitter = new EventEmitter();
        // Increase limit for many systems
        this.emitter.setMaxListeners(50);
    }

    public static getInstance(): GameEventBus {
        if (!GameEventBus.instance) {
            GameEventBus.instance = new GameEventBus();
        }
        return GameEventBus.instance;
    }

    public emit<T extends GameEventType>(type: T, payload: GameEventPayloads[T]): void {
        this.emitter.emit(type, payload);
    }

    public subscribe<T extends GameEventType>(type: T, callback: (payload: GameEventPayloads[T]) => void): void {
        this.emitter.on(type, callback);
    }

    public unsubscribe<T extends GameEventType>(type: T, callback: (payload: GameEventPayloads[T]) => void): void {
        this.emitter.removeListener(type, callback);
    }
}
