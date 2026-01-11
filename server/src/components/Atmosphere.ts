import { Component } from '../ecs/Component';

export class Atmosphere extends Component {
    static type = 'Atmosphere';

    skyState: string;
    lighting: string;
    contrast: string;

    constructor(
        skyState: string = "Dead Channel",
        lighting: string = "Mercury-Vapor",
        contrast: string = "High"
    ) {
        super();
        this.skyState = skyState;
        this.lighting = lighting;
        this.contrast = contrast;
    }
}
