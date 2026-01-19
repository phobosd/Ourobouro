import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/Logger';
import { Encryption } from '../utils/Encryption';


export enum LLMRole {
    CREATIVE = 'CREATIVE',
    LOGIC = 'LOGIC',
    IMAGE = 'IMAGE',
    DEFAULT = 'DEFAULT'
}

export interface LLMProfile {
    id: string;
    name: string;
    provider: 'local' | 'gemini' | 'openai' | 'pollinations' | 'stable-diffusion';
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
        expansionProbability: number;
        aggressionProbability: number;
        chaosProbability: number;
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

                // Decrypt API keys in profiles
                if (loaded.llmProfiles) {
                    for (const id in loaded.llmProfiles) {
                        const profile = loaded.llmProfiles[id];
                        if (profile.apiKey) {
                            profile.apiKey = Encryption.secureDecrypt(profile.apiKey);
                        }
                    }
                }

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
                maxQuestXPReward: 5000,
                expansionProbability: 0.05,
                aggressionProbability: 0.01,
                chaosProbability: 0.1
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

    public getSafeConfig(): any {
        // Deep clone to avoid modifying the original
        const safeConfig = JSON.parse(JSON.stringify(this.config));
        if (safeConfig.llmProfiles) {
            for (const id in safeConfig.llmProfiles) {
                const profile = safeConfig.llmProfiles[id];
                if (profile.apiKey) {
                    // Mask the key: show only first 4 and last 4 chars if long enough
                    const key = profile.apiKey;
                    if (key.length > 10) {
                        profile.apiKey = `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
                    } else {
                        profile.apiKey = '********';
                    }
                }
            }
        }
        return safeConfig;
    }

    public saveConfig(newConfig: GuardrailConfig) {
        // Handle masked keys from UI: if a key is masked, restore the original from memory
        if (newConfig.llmProfiles) {
            for (const id in newConfig.llmProfiles) {
                const newProfile = newConfig.llmProfiles[id];
                const oldProfile = this.config.llmProfiles[id];

                if (newProfile.apiKey && newProfile.apiKey.includes('****')) {
                    // This is a masked key from the UI, restore the real one
                    if (oldProfile && oldProfile.apiKey) {
                        newProfile.apiKey = oldProfile.apiKey;
                    }
                }
            }
        }

        this.config = newConfig;

        try {
            // Clone config to avoid encrypting the in-memory version used by the app
            const configToSave = JSON.parse(JSON.stringify(this.config));

            // Encrypt API keys in profiles before saving
            if (configToSave.llmProfiles) {
                for (const id in configToSave.llmProfiles) {
                    const profile = configToSave.llmProfiles[id];
                    if (profile.apiKey && !Encryption.isEncrypted(profile.apiKey)) {
                        Logger.info('GuardrailService', `Encrypting API key for profile: ${profile.name}`);
                        profile.apiKey = Encryption.secureEncrypt(profile.apiKey);
                    }
                }
            }

            fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 4));
            Logger.info('GuardrailService', 'Config saved to disk (with encryption).');

            // Re-sync LLM Service
            this.onUpdateCallbacks.forEach(cb => cb(this.config));
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
