import { BaseGenerator } from './BaseGenerator';
import { Proposal, ProposalType, NPCPayload } from '../proposals/schemas';
import { GuardrailConfig, LLMRole } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';

const FIRST_NAMES = ['Jax', 'Kira', 'Vex', 'Zero', 'Nyx', 'Cipher', 'Echo', 'Raze', 'Sloane', 'Mako'];
const LAST_NAMES = ['Vance', 'Korp', 'Steel', 'Neon', 'Shadow', 'Flux', 'Void', 'Chrome', 'Glitch', 'Matrix'];

const ARCHETYPES = [
    { name: 'Thug', behavior: 'cautious', healthMult: 0.8, attackMult: 1.2, defenseMult: 0.5 },
    { name: 'Merchant', behavior: 'neutral', healthMult: 1.0, attackMult: 0.5, defenseMult: 1.0 },
    { name: 'Corporate Agent', behavior: 'cautious', healthMult: 1.2, attackMult: 1.0, defenseMult: 1.2 },
    { name: 'Street Doc', behavior: 'friendly', healthMult: 0.9, attackMult: 0.3, defenseMult: 0.8 },
    { name: 'Hacker', behavior: 'elusive', healthMult: 0.7, attackMult: 1.5, defenseMult: 0.4 }
];

export class NPCGenerator extends BaseGenerator<NPCPayload> {
    type = ProposalType.NPC;

    async generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal> {
        const isMob = context?.subtype === 'MOB';
        const isBoss = context?.subtype === 'BOSS';

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
                : `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;

        let description = isBoss
            ? `A towering, nightmare-inducing ${archetype.name.toLowerCase()} that radiates pure malice.`
            : isMob
                ? `A repulsive ${archetype.name.toLowerCase()} lurking in the shadows.`
                : `A ${archetype.name.toLowerCase()} seen wandering the neon-lit streets.`;

        let rationale = `Generated a ${archetype.name} to populate the area.`;
        let behavior = archetype.behavior;
        let role = isBoss ? 'boss' : isMob ? 'mob' : 'civilian'; // Default role

        // 1. Creative Pass: Narrative & Flavor
        if (llm) {
            try {
                const mutation = ['Toxic', 'Radioactive', 'Crystalline', 'Shadow', 'Neon', 'Rust', 'Fungal', 'Digital', 'Volatile', 'Armored'][Math.floor(Math.random() * 10)];
                const bodyPart = ['Claws', 'Fangs', 'Spines', 'Tentacles', 'Wires', 'Optics', 'Limbs', 'Maw'][Math.floor(Math.random() * 8)];

                const creativePrompt = isBoss
                    ? `Generate a TERRIFYING cyberpunk BOSS.
                Archetype: ${archetype.name}
                Mutation Trait: ${mutation}
                Prominent Feature: ${bodyPart}
                Current World Context: A massive anomaly has appeared in the city, birthing a legendary horror.
                ${context?.existingNames ? `EXISTING NAMES (DO NOT USE): ${context.existingNames.join(', ')}` : ''}
                
                Requirements:
                - Name: A POWERFUL, INTIMIDATING name (e.g., 'The ${mutation} ${bodyPart}', 'System-Breaker', 'Apex-${mutation}'). MUST NOT be in the existing names list.
                - Description: 3-4 sentences describing its overwhelming presence, its ${mutation} aura, and its lethal ${bodyPart}.
                - Behavior: MUST be 'aggressive'.
                - Rationale: Why is this boss here? What is its purpose?
                
                Return ONLY a JSON object with fields: name, description, behavior, rationale.`
                    : isMob
                        ? `Generate a UNIQUE cyberpunk creature/mob.
                Archetype: ${archetype.name}
                Mutation Trait: ${mutation}
                Prominent Feature: ${bodyPart}
                Current World Context: The city sewers and dark alleys are infested with diverse techno-organic horrors.
                ${context?.existingNames ? `EXISTING NAMES (DO NOT USE): ${context.existingNames.join(', ')}` : ''}
                
                Requirements:
                - Name: A CREATIVE, UNIQUE creature name based on the Mutation Trait (e.g., '${mutation} Stalker', '${mutation} Leech', 'Razor-${bodyPart}'). DO NOT USE GENERIC NAMES. MUST NOT be in the existing names list.
                - Description: 2-3 sentences describing its physical appearance, focusing on its ${mutation} nature and ${bodyPart}.
                - Behavior: MUST be 'aggressive'.
                - Rationale: Why is this specific creature here?
                
                Return ONLY a JSON object with fields: name, description, behavior, rationale.`

                        : `Generate a unique cyberpunk NPC. 
                Archetype: ${archetype.name}
                Current World Context: The city is under heavy corporate surveillance. The Matrix is leaking into reality.
                ${config.features.restrictedToGlitchArea ? "IMPORTANT: This NPC is in a highly unstable 'Glitch Area' and MUST be hostile/aggressive." : ""}
                ${context?.existingNames ? `EXISTING NAMES (DO NOT USE): ${context.existingNames.join(', ')}` : ''}
                
                Requirements:
                - Name: A gritty cyberpunk name (e.g., 'Rat-Byte', 'Chrome-Jack'). MUST NOT be 'Sloane Vane'. MUST NOT be in the existing names list.
                - Description: 2-3 sentences. Focus on their 'chrome' (cybernetics), their worn clothing, and their vibe.
                - Behavior: Choose from [neutral, cautious, friendly, elusive, aggressive]. PREFER 'neutral' or 'cautious' unless the archetype suggests otherwise. ${config.features.restrictedToGlitchArea ? "MUST be 'aggressive'." : ""}
                - Role: Choose from ['vendor', 'guard', 'civilian', 'mob']. Based on the archetype (${archetype.name}).
                - Rationale: Why does this NPC exist in this specific district?
                
                Return ONLY a JSON object with fields: name, description, behavior, role, and rationale.`;

                const creativeRes = await llm.chat(creativePrompt, "You are the lead narrative designer for Ouroboro.", LLMRole.CREATIVE);
                const creativeData = LLMService.parseJson(creativeRes.text);

                if (creativeData.name) name = creativeData.name;
                if (creativeData.description) description = creativeData.description;
                if (creativeData.behavior) behavior = creativeData.behavior;
                if (creativeData.rationale) rationale = creativeData.rationale;
                if (creativeData.role) role = creativeData.role;

                // Final override if restricted
                if (config.features.restrictedToGlitchArea || isMob || isBoss) {
                    behavior = 'aggressive'; // Wait, user asked to turn OFF aggressive. But this is generator logic.
                    // I should respect the previous change I made to turn off aggression?
                    // The user said "turn off ALL aggressive NPCs in the world".
                    // I previously changed the archetypes to be neutral/cautious.
                    // But here I have explicit overrides.
                    // I should probably remove this override or change it to 'cautious'.
                    // However, the current task is just about roles.
                    // I will leave the behavior override alone for now to avoid scope creep, or change it to 'cautious' if I want to be consistent.
                    // The user's previous request was "turn off ALL aggressive NPCs".
                    // So I SHOULD change this to 'cautious' or remove it.
                    // But wait, the previous request was handled by modifying archetypes.
                    // This block overrides behavior for glitch areas/mobs/bosses.
                    // I should change this to 'cautious' to be safe.
                    behavior = 'cautious';
                }
            } catch (err) {
                console.error('NPC Creative Pass failed:', err);
            }
        }

        // 2. Logic Pass: Stat Balancing
        const budgets = config.budgets;
        let stats = {
            health: Math.floor(budgets.maxNPCHealth * archetype.healthMult * (0.8 + Math.random() * 0.4)),
            attack: Math.floor(budgets.maxNPCAttack * archetype.attackMult * (0.8 + Math.random() * 0.4) * 0.2),
            defense: Math.floor(budgets.maxNPCDefense * archetype.defenseMult * (0.8 + Math.random() * 0.4) * 0.2)
        };

        if (llm) {
            try {
                const logicPrompt = `Balance the stats for this NPC:
                Name: ${name}
                Description: ${description}
                Archetype: ${archetype.name}
                Behavior: ${behavior}
                
                System Constraints (MAX LIMITS):
                - Max Health: ${budgets.maxNPCHealth}
                - Max Attack: ${budgets.maxNPCAttack}
                - Max Defense: ${budgets.maxNPCDefense}
                
                Return ONLY a JSON object with fields: health, attack, defense.
                Ensure the stats reflect the NPC's description and archetype. An 'aggressive' NPC should generally have higher attack.`;

                const logicRes = await llm.chat(logicPrompt, "You are a game balance engineer for Ouroboro. You ensure NPCs are challenging but fair.", LLMRole.LOGIC);
                const logicData = LLMService.parseJson(logicRes.text);

                if (logicData.health) stats.health = Math.max(1, Math.min(budgets.maxNPCHealth, logicData.health));
                if (logicData.attack) stats.attack = Math.max(1, Math.min(budgets.maxNPCAttack, logicData.attack));
                if (logicData.defense) stats.defense = Math.max(1, Math.min(budgets.maxNPCDefense, logicData.defense));
            } catch (err) {
                console.error('NPC Logic Pass failed:', err);
            }
        }

        // 3. Portrait Pass: AI Image Generation (via Pollinations.ai)
        let portrait = "";
        if (llm) {
            try {
                const portraitPrompt = `Create a highly detailed image generation prompt for a "realistic 3D digital art" portrait of the following cyberpunk NPC:
                Name: ${name}
                Description: ${description}
                
                Requirements for the prompt:
                - Style: Realistic 3D render, Unreal Engine 5, cinematic lighting, cyberpunk aesthetic.
                - Composition: Close-up portrait (head and shoulders).
                - Details: Focus on skin textures, cybernetic implants, clothing materials, and atmospheric lighting (neon, grit).
                - Format: Return ONLY the prompt text. No preamble, no quotes.`;

                const portraitRes = await llm.chat(portraitPrompt, "You are an expert AI image prompt engineer.", LLMRole.CREATIVE);
                portrait = await llm.generateImage(portraitRes.text.trim());
            } catch (err) {
                console.error('NPC Portrait Pass failed:', err);
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
            portrait // Add portrait to payload
        };

        const proposal = this.generateBaseProposal(payload);
        proposal.flavor = { rationale };

        return proposal;
    }
}
