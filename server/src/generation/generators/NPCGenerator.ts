import { BaseGenerator } from './BaseGenerator';
import { Proposal, ProposalType, NPCPayload } from '../proposals/schemas';
import { GuardrailConfig, LLMRole } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';
import { Logger } from '../../utils/Logger';

const FIRST_NAMES = ['Jax', 'Kira', 'Vex', 'Zero', 'Nyx', 'Cipher', 'Echo', 'Raze', 'Sloane', 'Mako'];
const LAST_NAMES = ['Vance', 'Korp', 'Steel', 'Neon', 'Shadow', 'Flux', 'Void', 'Chrome', 'Glitch', 'Matrix'];

const ARCHETYPES = [
    { name: 'Thug', behavior: 'cautious', healthMult: 0.8, attackMult: 1.2, defenseMult: 0.5 },
    { name: 'Merchant', behavior: 'neutral', healthMult: 1.0, attackMult: 0.5, defenseMult: 1.0 },
    { name: 'Corporate Agent', behavior: 'cautious', healthMult: 1.2, attackMult: 1.0, defenseMult: 1.2 },
    { name: 'Street Doc', behavior: 'friendly', healthMult: 0.9, attackMult: 0.3, defenseMult: 0.8 },
    { name: 'Hacker', behavior: 'elusive', healthMult: 0.7, attackMult: 1.5, defenseMult: 0.4 }
];

const FRIENDLY_ARCHETYPES = [
    { name: 'Citizen', behavior: 'friendly', healthMult: 0.5, attackMult: 0.1, defenseMult: 0.1 },
    { name: 'Dancer', behavior: 'friendly', healthMult: 0.6, attackMult: 0.2, defenseMult: 0.2 },
    { name: 'Artist', behavior: 'friendly', healthMult: 0.4, attackMult: 0.1, defenseMult: 0.1 },
    { name: 'Monk', behavior: 'friendly', healthMult: 0.8, attackMult: 0.5, defenseMult: 0.5 },
    { name: 'Bartender', behavior: 'friendly', healthMult: 1.0, attackMult: 0.8, defenseMult: 0.8 },
    { name: 'Techie', behavior: 'friendly', healthMult: 0.6, attackMult: 0.2, defenseMult: 0.3 }
];

export class NPCGenerator extends BaseGenerator<NPCPayload> {
    type = ProposalType.NPC;

    async generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal> {
        const isMob = context?.subtype === 'MOB';
        const isBoss = context?.subtype === 'BOSS';
        const isFriendly = context?.subtype === 'FRIENDLY';

        const MOB_ARCHETYPES = [
            { name: 'Vermin', behavior: 'cautious', healthMult: 0.4, attackMult: 0.8, defenseMult: 0.2 },
            { name: 'Glitch Construct', behavior: 'neutral', healthMult: 0.6, attackMult: 1.2, defenseMult: 0.4 },
            { name: 'Rogue Drone', behavior: 'neutral', healthMult: 0.5, attackMult: 1.0, defenseMult: 0.8 },
            { name: 'Feral Mutant', behavior: 'cautious', healthMult: 1.2, attackMult: 1.1, defenseMult: 0.6 }
        ];

        const BOSS_ARCHETYPES = [
            { name: 'Cyber-Monstrosity', behavior: 'neutral', healthMult: 5.0, attackMult: 2.0, defenseMult: 2.0 },
            { name: 'Rogue AI Avatar', behavior: 'neutral', healthMult: 4.0, attackMult: 3.0, defenseMult: 1.5 },
            { name: 'Corporate Hit-Squad Leader', behavior: 'cautious', healthMult: 3.0, attackMult: 2.5, defenseMult: 2.5 },
            { name: 'Mutated Alpha', behavior: 'neutral', healthMult: 6.0, attackMult: 1.8, defenseMult: 1.2 }
        ];

        let archetype = isBoss
            ? BOSS_ARCHETYPES[Math.floor(Math.random() * BOSS_ARCHETYPES.length)]
            : isMob
                ? MOB_ARCHETYPES[Math.floor(Math.random() * MOB_ARCHETYPES.length)]
                : isFriendly
                    ? FRIENDLY_ARCHETYPES[Math.floor(Math.random() * FRIENDLY_ARCHETYPES.length)]
                    : ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];

        // If restricted to glitch area, force aggressive behavior
        if (config.features.restrictedToGlitchArea) {
            archetype = isBoss
                ? BOSS_ARCHETYPES.find(a => a.behavior === 'aggressive') || archetype
                : isMob
                    ? MOB_ARCHETYPES.find(a => a.behavior === 'aggressive') || archetype
                    : ARCHETYPES.find(a => a.behavior === 'aggressive') || archetype;
        }

        let name = isBoss
            ? `[BOSS] ${['Omega', 'Titan', 'Apex', 'Void', 'Prime'][Math.floor(Math.random() * 5)]} ${['Stalker', 'Reaper', 'Colossus', 'Executioner', 'Entity'][Math.floor(Math.random() * 5)]}`
            : isMob
                ? `${['Giant', 'Mutated', 'Cyber', 'Neon', 'Toxic'][Math.floor(Math.random() * 5)]} ${['Rat', 'Roach', 'Sludge', 'Hound', 'Spider'][Math.floor(Math.random() * 5)]}`
                : isFriendly
                    ? `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`
                    : `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;

        let description = isBoss
            ? `A towering, nightmare-inducing ${archetype.name.toLowerCase()} that radiates pure malice.`
            : isMob
                ? `A repulsive ${archetype.name.toLowerCase()} lurking in the shadows.`
                : isFriendly
                    ? `A friendly ${archetype.name.toLowerCase()} looking for conversation.`
                    : `A ${archetype.name.toLowerCase()} seen wandering the neon-lit streets.`;

        let rationale = `Generated a ${archetype.name} to populate the area.`;
        let behavior = archetype.behavior;
        let role = isBoss ? 'boss' : isMob ? 'mob' : isFriendly ? 'civilian' : 'civilian'; // Default role

        let stats = {
            health: Math.floor(config.budgets.maxNPCHealth * archetype.healthMult * (0.8 + Math.random() * 0.4)),
            attack: Math.floor(config.budgets.maxNPCAttack * archetype.attackMult * (0.8 + Math.random() * 0.4) * 0.2),
            defense: Math.floor(config.budgets.maxNPCDefense * archetype.defenseMult * (0.8 + Math.random() * 0.4) * 0.2)
        };

        const models: Record<string, string> = {};
        let personality: any = undefined;

        // 1. Combined Creative & Logic Pass
        if (llm) {
            try {
                const mutation = isFriendly
                    ? ['Cyber-Eye', 'Neon Tattoo', 'Data-Jack', 'Synth-Skin', 'Holo-Projector', 'Smart-Glasses'][Math.floor(Math.random() * 6)]
                    : ['Toxic', 'Radioactive', 'Crystalline', 'Shadow', 'Neon', 'Rust', 'Fungal', 'Digital', 'Volatile', 'Armored'][Math.floor(Math.random() * 10)];

                const bodyPart = isFriendly
                    ? ['Smile', 'Style', 'Voice', 'Aura', 'Gaze'][Math.floor(Math.random() * 5)]
                    : ['Claws', 'Fangs', 'Spines', 'Tentacles', 'Wires', 'Optics', 'Limbs', 'Maw'][Math.floor(Math.random() * 8)];

                const combinedPrompt = `Generate a unique cyberpunk ${isBoss ? 'BOSS' : isMob ? 'creature' : isFriendly ? 'friendly civilian' : 'NPC'}.
                Archetype: ${archetype.name}
                ${isFriendly ? 'Style/Vibe' : 'Mutation/Trait'}: ${mutation}
                Feature: ${bodyPart}
                
                System Constraints (MAX STATS):
                - Max Health: ${config.budgets.maxNPCHealth}
                - Max Attack: ${config.budgets.maxNPCAttack}
                - Max Defense: ${config.budgets.maxNPCDefense}
                
                Requirements:
                - Name: ${isFriendly ? 'A normal, cool cyberpunk name.' : 'A gritty, unique name.'}
                - Description: 2-3 sentences focusing on their appearance and ${mutation} traits. ${isFriendly ? 'Make them sound approachable and interesting.' : ''}
                - Behavior: [neutral, cautious, friendly, elusive, aggressive]. ${config.features.restrictedToGlitchArea || isMob || isBoss ? "MUST be 'aggressive'." : isFriendly ? "MUST be 'friendly'." : ""}
                - Role: ['vendor', 'guard', 'civilian', 'mob', 'boss'].
                - Stats: Provide health, attack, and defense within the limits.
                - Rationale: Why are they here?
                ${!isMob && !isBoss ? `
                - Personality: Provide traits (array of strings), voice (string), agenda (string), and background (string). ${isFriendly ? 'Traits should be positive/social.' : ''}` : ''}
                
                Return ONLY a JSON object with fields: name, description, behavior, role, rationale, stats: { health, attack, defense }${!isMob && !isBoss ? ', personality: { traits, voice, agenda, background }' : ''}.`;

                const res = await llm.chat(combinedPrompt, "You are a lead game designer for Zenith-9.", LLMRole.CREATIVE);
                models['Creative'] = res.model;
                const data = LLMService.parseJson(res.text);

                if (data.name) name = data.name;
                if (data.description) description = data.description;
                if (data.behavior) behavior = data.behavior;
                if (data.rationale) rationale = data.rationale;
                if (data.role) role = data.role;
                if (data.stats) {
                    stats.health = Math.max(1, Math.min(config.budgets.maxNPCHealth, data.stats.health || stats.health));
                    stats.attack = Math.max(1, Math.min(config.budgets.maxNPCAttack, data.stats.attack || stats.attack));
                    stats.defense = Math.max(1, Math.min(config.budgets.maxNPCDefense, data.stats.defense || stats.defense));
                }
                if (data.personality) {
                    personality = data.personality;
                }

                if (config.features.restrictedToGlitchArea || isMob || isBoss) {
                    behavior = 'aggressive';
                } else if (isFriendly) {
                    behavior = 'friendly';
                }
            } catch (err) {
                Logger.error('NPCGenerator', `NPC Generation Pass failed: ${err}`);
            }
        }

        // 3. Portrait Pass: AI Image Generation (via Pollinations.ai)
        let portrait = "";
        if (llm) {
            try {
                const lighting = ['neon-noir', 'harsh industrial', 'soft bioluminescent', 'shadowy and mysterious', 'volumetric fog', 'holographic glow', 'chiaroscuro'][Math.floor(Math.random() * 7)];
                const angle = ['close-up', 'low angle', 'dramatic profile', 'front facing', 'Dutch angle'][Math.floor(Math.random() * 5)];
                const palette = ['cyan and magenta', 'green and black', 'orange and teal', 'monochrome with red accents', 'rusty brown and steel grey', 'iridescent chrome'][Math.floor(Math.random() * 6)];

                const portraitPrompt = `Create a highly detailed image generation prompt for a "realistic 3D digital art" portrait of the following cyberpunk NPC:
                Name: ${name}
                Description: ${description}
                
                Requirements for the prompt:
                - Style: Realistic 3D render, Unreal Engine 5, cinematic lighting, cyberpunk aesthetic.
                - Lighting: ${lighting}.
                - Camera: ${angle}.
                - Color Palette: ${palette}.
                - Composition: Head and shoulders portrait.
                - Details: Focus on unique facial features, specific cybernetic implants, clothing textures, and the specified lighting/color mood.
                - Format: Return ONLY the prompt text. No preamble, no quotes.`;

                const portraitRes = await llm.chat(portraitPrompt, "You are an expert AI image prompt engineer.", LLMRole.CREATIVE);
                const imageRes = await llm.generateImage(portraitRes.text.trim());
                portrait = imageRes.url;
                models['Image'] = imageRes.model;
            } catch (err) {
                Logger.error('NPCGenerator', `NPC Portrait Pass failed: ${err}`);
            }
        }

        const payload: NPCPayload = {
            id: `npc_${Math.random().toString(36).substring(7)}`,
            name,
            description,
            stats,
            behavior: behavior as any,
            faction: Math.random() > 0.5 ? 'Street' : 'Corporate',
            role,
            tags: [archetype.name.toLowerCase()],
            canMove: true,
            portrait, // Add portrait to payload
            personality,
            generatedBy: context?.generatedBy || 'Director'
        };

        const proposal = this.generateBaseProposal(payload, context?.generatedBy || 'Director', models);
        proposal.flavor = { rationale };

        return proposal;
    }
}
