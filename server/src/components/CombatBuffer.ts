import { Component } from '../ecs/Component';

export enum CombatActionType {
    DASH = 'DASH',
    SLASH = 'SLASH',
    SLICE = 'SLICE',
    PARRY = 'PARRY',
    THRUST = 'THRUST',
    REBOOT = 'REBOOT', // Malware
    STUMBLE = 'STUMBLE' // Scrambled action
}

export interface CombatAction {
    type: CombatActionType;
    targetId?: string;
}

export class CombatBuffer extends Component {
    public static type = 'CombatBuffer';
    public actions: CombatAction[] = [];
    public maxSlots: number = 3;
    public isExecuting: boolean = false;
    public isBuilding: boolean = false;
    public flow: number = 0;
    public malware: string[] = [];

    constructor(maxSlots: number = 3) {
        super();
        this.maxSlots = maxSlots;
    }

    public addAction(action: CombatAction): boolean {
        if (this.actions.length < this.maxSlots) {
            this.actions.push(action);
            return true;
        }
        return false;
    }

    public clear(): void {
        this.actions = [];
        this.isExecuting = false;
    }
}
