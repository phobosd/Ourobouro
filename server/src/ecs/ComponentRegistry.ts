import { ComponentClass } from './Component';
import { Position } from '../components/Position';
import { Description } from '../components/Description';
import { IsRoom } from '../components/IsRoom';
import { Item } from '../components/Item';
import { Inventory } from '../components/Inventory';
import { Container } from '../components/Container';
import { Stats } from '../components/Stats';
import { CombatStats } from '../components/CombatStats';
import { Stance } from '../components/Stance';
import { NPC } from '../components/NPC';
import { Shop } from '../components/Shop';
import { Terminal } from '../components/Terminal';
import { PuzzleObject } from '../components/PuzzleObject';
import { Credits } from '../components/Credits';
import { Magazine } from '../components/Magazine';
import { Weapon } from '../components/Weapon';
import { IsCyberspace } from '../components/IsCyberspace';
import { IsPersona } from '../components/IsPersona';
import { IsICE } from '../components/IsICE';
import { Atmosphere } from '../components/Atmosphere';
import { Cyberware } from '../components/Cyberware';
import { Portal } from '../components/Portal';
import { Visuals } from '../components/Visuals';
import { Momentum } from '../components/Momentum';

export class ComponentRegistry {
    private static components: Map<string, ComponentClass<any>> = new Map();

    static register(type: string, componentClass: ComponentClass<any>) {
        this.components.set(type, componentClass);
    }

    static get(type: string): ComponentClass<any> | undefined {
        return this.components.get(type);
    }

    static init() {
        this.register('Position', Position);
        this.register('Description', Description);
        this.register('IsRoom', IsRoom);
        this.register('Item', Item);
        this.register('Inventory', Inventory);
        this.register('Container', Container);
        this.register('Stats', Stats);
        this.register('CombatStats', CombatStats);
        this.register('Stance', Stance);
        this.register('NPC', NPC);
        this.register('Shop', Shop);
        this.register('Terminal', Terminal);
        this.register('PuzzleObject', PuzzleObject);
        this.register('Credits', Credits);
        this.register('Magazine', Magazine);
        this.register('Weapon', Weapon);
        this.register('IsCyberspace', IsCyberspace);
        this.register('IsPersona', IsPersona);
        this.register('IsICE', IsICE);
        this.register('Atmosphere', Atmosphere);
        this.register('Cyberware', Cyberware);
        this.register('Portal', Portal);
        this.register('Visuals', Visuals);
        this.register('Momentum', Momentum);
    }
}
