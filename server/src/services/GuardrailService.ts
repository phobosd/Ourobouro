import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/Logger';

export enum LLMRole {
    CREATIVE = 'CREATIVE',
    LOGIC = 'LOGIC',
    IMAGE = 'IMAGE',
    DEFAULT = 'DEFAULT'
}

export interface LLMProfile {
    id: string;
    name: string;
    provider: 'local' | 'gemini' | 'openai' | 'pollinations';
    baseUrl: string;
    apiKey?: string;
    model: string;
    roles: LLMRole[];
}

export interface GuardrailConfig {
    budgets: {
        maxWeaponDamage: number;
        maxArmorDefense: number;
        maxGoldDrop: number;
        maxItemValue: number;
        maxNPCHealth: number;
        maxNPCAttack: number;
        maxNPCDefense: number;
        maxQuestXPReward: number;
    };
    throttles: {
        maxGenerationsPerMinute: number;
        maxActiveExpansions: number;
    };
    features: {
        requireHumanApproval: boolean;
        autoSnapshotHighRisk: boolean;
        enableNPCs: boolean;
        enableItems: boolean;
        enableQuests: boolean;
        enableExpansions: boolean;
        restrictedToGlitchArea: boolean;
    };
    llmProfiles: Record<string, LLMProfile>;
    bannedWords: string[];
}

export class GuardrailService {
    private configPath: string;
    private config: GuardrailConfig;
    private onUpdateCallbacks: ((config: GuardrailConfig) => void)[] = [];

    constructor() {
        this.configPath = path.resolve(__dirname, '../../guardrails.json');
        this.config = this.loadConfig();

        // Watch for changes
        fs.watchFile(this.configPath, () => {
            Logger.info('GuardrailService', 'Config changed on disk, reloading...');
            this.config = this.loadConfig();
            this.onUpdateCallbacks.forEach(cb => cb(this.config));
        });
    }

    public onUpdate(callback: (config: GuardrailConfig) => void) {
        this.onUpdateCallbacks.push(callback);
    }

    private loadConfig(): GuardrailConfig {
        const defaults = this.getDefaults();
        if (fs.existsSync(this.configPath)) {
            try {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const loaded = JSON.parse(data);
                // Deep merge defaults with loaded config
                return {
                    ...defaults,
                    ...loaded,
                    budgets: { ...defaults.budgets, ...loaded.budgets },
                    throttles: { ...defaults.throttles, ...loaded.throttles },
                    features: { ...defaults.features, ...loaded.features },
                    llmProfiles: loaded.llmProfiles || defaults.llmProfiles
                };
            } catch (err) {
                Logger.error('GuardrailService', `Failed to load config: ${err}`);
            }
        }
        return defaults;
    }

    private getDefaults(): GuardrailConfig {
        return {
            budgets: {
                maxWeaponDamage: 50,
                maxArmorDefense: 20,
                maxGoldDrop: 500,
                maxItemValue: 10000,
                maxNPCHealth: 1000,
                maxNPCAttack: 100,
                maxNPCDefense: 50,
                maxQuestXPReward: 5000
            },
            throttles: {
                maxGenerationsPerMinute: 10,
                maxActiveExpansions: 1
            },
            features: {
                requireHumanApproval: true,
                autoSnapshotHighRisk: true,
                enableNPCs: true,
                enableItems: true,
                enableQuests: true,
                enableExpansions: true,
                restrictedToGlitchArea: false
            },
            llmProfiles: {
                'default': {
                    id: 'default',
                    name: 'Default Local',
                    provider: 'local',
                    baseUrl: 'http://localhost:1234/v1',
                    model: 'llama-3-8b-instruct',
                    roles: [LLMRole.DEFAULT, LLMRole.CREATIVE, LLMRole.LOGIC]
                }
            },
            bannedWords: []
        };
    }

    public getConfig(): GuardrailConfig {
        return this.config;
    }

    public saveConfig(newConfig: GuardrailConfig) {
        this.config = newConfig;
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 4));
            Logger.info('GuardrailService', 'Config saved to disk.');
        } catch (err) {
            Logger.error('GuardrailService', `Failed to save config: ${err}`);
        }
    }

    public checkBudget(type: string, value: number): boolean {
        switch (type) {
            case 'damage': return value <= this.config.budgets.maxWeaponDamage;
            case 'defense': return value <= this.config.budgets.maxArmorDefense;
            case 'gold': return value <= this.config.budgets.maxGoldDrop;
            case 'health': return value <= this.config.budgets.maxNPCHealth;
            default: return true;
        }
    }

    public checkContent(text: string): boolean {
        const lower = text.toLowerCase();
        return !this.config.bannedWords.some(word => lower.includes(word));
    }
}
