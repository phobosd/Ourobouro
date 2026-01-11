export enum MessageType {
    INFO = 'info',
    ERROR = 'error',
    SUCCESS = 'success',
    ACTION = 'action',
    SYSTEM = 'system',
    COMBAT = 'combat',
    ROOM_DESC = 'room_desc',
    LOOK_AT = 'look_at',
    MAP = 'map'
}

export interface GameMessage {
    type: MessageType;
    content: string;
    payload?: any;
    timestamp: number;
}
