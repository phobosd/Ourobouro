import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { WorldDirector, DirectorLogLevel } from '../Director';

export class DirectorManagementService {
    private director: WorldDirector;
    private configPath = path.join(process.cwd(), 'data', 'director_config.json');

    public isPaused: boolean = true;
    public personality = {
        chaos: { value: 0.2, enabled: true },
        aggression: { value: 0.0, enabled: false },
        expansion: { value: 0.1, enabled: true }
    };
    public glitchConfig = {
        mobCount: 5,
        itemCount: 5,
        legendaryChance: 0.05
    };

    constructor(director: WorldDirector) {
        this.director = director;
    }

    public loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const raw = fs.readFileSync(this.configPath, 'utf-8');
                const config = JSON.parse(raw);

                if (config.glitchConfig) this.glitchConfig = config.glitchConfig;
                if (config.personality) this.personality = config.personality;
                if (config.paused !== undefined) this.isPaused = config.paused;

                Logger.info('Director', 'Loaded configuration from disk.');
            }
        } catch (err) {
            Logger.error('Director', `Failed to load config: ${err}`);
        }
    }

    public saveConfig() {
        try {
            const config = {
                glitchConfig: this.glitchConfig,
                personality: this.personality,
                paused: this.isPaused
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 4));
            Logger.info('Director', 'Saved configuration to disk.');
        } catch (err) {
            Logger.error('Director', `Failed to save config: ${err}`);
        }
    }

    public pause() {
        this.isPaused = true;
        this.saveConfig();
        this.director.log(DirectorLogLevel.WARN, 'Director PAUSED.');
        this.director.adminNamespace.emit('director:status', this.director.getStatus());
    }

    public resume() {
        this.isPaused = false;
        this.saveConfig();
        this.director.log(DirectorLogLevel.SUCCESS, 'Director RESUMED.');
        this.director.adminNamespace.emit('director:status', this.director.getStatus());
    }

    public updatePersonality(update: any) {
        if (update.chaos !== undefined) this.personality.chaos = { ...this.personality.chaos, ...update.chaos };
        if (update.aggression !== undefined) this.personality.aggression = { ...this.personality.aggression, ...update.aggression };
        if (update.expansion !== undefined) this.personality.expansion = { ...this.personality.expansion, ...update.expansion };

        this.director.log(DirectorLogLevel.INFO, `Personality updated: ${JSON.stringify(this.personality)}`);
        this.saveConfig();
        this.director.adminNamespace.emit('director:status', this.director.getStatus());
    }

    public updateGlitchConfig(config: any) {
        this.glitchConfig = { ...this.glitchConfig, ...config };
        this.saveConfig();
        this.director.log(DirectorLogLevel.INFO, 'Glitch Door configuration updated.');
        this.director.adminNamespace.emit('director:status', this.director.getStatus());
    }
}
