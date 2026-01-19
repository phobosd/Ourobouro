import { BaseGenerator } from './BaseGenerator';
import { Proposal, ProposalType, RoomPayload } from '../proposals/schemas';
import { GuardrailConfig, LLMRole } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';

const ROOM_TYPES = [
    { type: 'street', names: ['Neon Alley', 'Chrome Street', 'Void Plaza', 'Glitch Boulevard'] },
    { type: 'shop', names: ['Cyber-Market', 'The Mod Shop', 'Data Haven', 'Synapse Bar'] },
    { type: 'dungeon', names: ['Abandoned Server Room', 'Sewer Pipe 04', 'Corporate Basement', 'Undercity Tunnel'] },
    { type: 'indoor', names: ['Capsule Hotel', 'Safehouse', 'Apartment 402', 'Office Suite'] }
];

export class RoomGenerator extends BaseGenerator<RoomPayload> {
    type = ProposalType.WORLD_EXPANSION;

    async generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal> {
        const roomType = ROOM_TYPES[Math.floor(Math.random() * ROOM_TYPES.length)];

        let name = roomType.names[Math.floor(Math.random() * roomType.names.length)];
        let description = `A ${roomType.type} area. The air is thick with the smell of ozone and rain.`;
        let rationale = `Expanding the world with a new ${roomType.type} block.`;
        const models: Record<string, string> = {};

        if (llm) {
            try {
                const prompt = `Generate a unique cyberpunk location. 
                Type: ${roomType.type}
                ${context?.existingNames ? `EXISTING NAMES (DO NOT USE): ${context.existingNames.join(', ')}` : ''}
                
                Requirements:
                - Name: An evocative name (e.g., 'The Black-Out Bar', 'Sector 7 Slums', 'Korp-Tower Lobby'). MUST NOT be in the existing names list.
                - Description: 2-3 sentences. Focus on the sensory details—flickering neon, the hum of servers, the rain on dirty glass, or the smell of cheap synthetic food.
                - Rationale: How does this location fit into the decaying urban sprawl?
                
                Return ONLY a JSON object with fields: name, description, rationale.`;

                const response = await llm.chat(prompt, "You are the lead architect for the Zenith-9 sprawl. Your style is brutalist, neon-soaked, and claustrophobic. You describe spaces through light, sound, and decay.", LLMRole.CREATIVE);
                models['Creative'] = response.model;
                const data = LLMService.parseJson(response.text);

                if (data.name) name = data.name;
                if (data.description) description = data.description;
                if (data.rationale) rationale = data.rationale;
            } catch (err) {
                console.error('LLM Enrichment failed for Room, falling back:', err);
            }
        }

        const x = context?.x ?? Math.floor(Math.random() * 100);
        const y = context?.y ?? Math.floor(Math.random() * 100);

        const payload: RoomPayload = {
            id: `room_${Math.random().toString(36).substring(7)}`,
            name,
            description,
            type: roomType.type as any,
            coordinates: { x, y, z: 0 },
            exits: {},
            features: [],
            spawns: [],
            portrait: ""
        };

        const proposal = this.generateBaseProposal(payload, context?.generatedBy || 'Director', models);
        proposal.flavor = { rationale };

        return proposal;
    }
}
