import { Server } from 'socket.io';
import { GameMessage, MessageType } from '../types/MessageTypes';

export class MessageService {
    constructor(private io: Server) { }

    send(targetId: string, type: MessageType, content: string, payload?: any) {
        const message: GameMessage = {
            type,
            content,
            payload,
            timestamp: Date.now()
        };
        this.io.to(targetId).emit('message', message);
    }

    info(targetId: string, content: string) {
        this.send(targetId, MessageType.INFO, content);
    }

    error(targetId: string, content: string) {
        this.send(targetId, MessageType.ERROR, content);
    }

    success(targetId: string, content: string) {
        this.send(targetId, MessageType.SUCCESS, content);
    }

    action(targetId: string, content: string) {
        this.send(targetId, MessageType.ACTION, content);
    }

    system(targetId: string, content: string) {
        this.send(targetId, MessageType.SYSTEM, content);
    }

    combat(targetId: string, content: string, payload?: any) {
        this.send(targetId, MessageType.COMBAT, content, payload);
    }

    roomDesc(targetId: string, content: string, payload?: any) {
        this.send(targetId, MessageType.ROOM_DESC, content, payload);
    }

    map(targetId: string, content: string, payload?: any) {
        this.send(targetId, MessageType.MAP, content, payload);
    }

    broadcast(content: string, type: MessageType = MessageType.INFO) {
        const message: GameMessage = {
            type,
            content,
            timestamp: Date.now()
        };
        this.io.emit('message', message);
    }
}
