import { BaseGenerator } from './BaseGenerator';
import { Proposal, ProposalType, ItemPayload } from '../proposals/schemas';
import { GuardrailConfig, LLMRole } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';
import { Logger } from '../../utils/Logger';

const ITEM_TYPES = ['weapon', 'armor', 'consumable', 'item'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const PREFIXES = ['Rusty', 'Chrome', 'Neon', 'Void', 'Elite', 'Prototype', 'Glitch'];

export class ItemGenerator extends BaseGenerator<ItemPayload> {
    type = ProposalType.ITEM;

    async generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal> {
        let itemType = context?.forcedType || ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
        let rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)];

        if (context?.subtype === 'RARE') rarity = 'rare';
        if (context?.subtype === 'LEGENDARY') rarity = 'legendary';
        if (context?.subtype === 'UNCOMMON') rarity = 'uncommon';

        const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];

        let name = `${prefix} ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`;
        let description = `A ${rarity} grade ${itemType}.`;
        let rationale = `Generated a ${rarity} ${itemType} for the world.`;
        let attributes: Record<string, any> = {};
        let shortName = name.split(' ').pop()?.toLowerCase() || 'item';

        const models: Record<string, string> = {};
        // 1. Creative Pass
        if (llm) {
            try {
                const creativePrompt = `Generate a unique cyberpunk item. 
                Suggested Type: ${itemType}
                Rarity: ${rarity}
                ${context?.hint ? `Specific Request: ${context.hint}` : ''}
                ${context?.existingNames ? `EXISTING NAMES (DO NOT USE): ${context.existingNames.join(', ')}` : ''}
                
                Requirements:
                - Name: A punchy, tech-heavy name. MUST NOT be in the existing names list.
                - Type: You may change the type if it fits the name better. Choose from: [weapon, armor, consumable, cyberware].
                - Description: 1-2 sentences of atmospheric flavor text.
                - Rationale: Why would a player find this in a cyberpunk dystopia?
                - Slot: If armor or cyberware, specify a slot (e.g., head, torso, legs, waist, feet, back, neural). Neural is a specialized slot for brain/nervous system implants.
                
                Return ONLY a JSON object with fields: name, type, description, rationale, slot (optional).`;

                const creativeRes = await llm.chat(creativePrompt, "You are a master item crafter for Zenith-9.", LLMRole.CREATIVE);
                models['Creative'] = creativeRes.model;
                const creativeData = LLMService.parseJson(creativeRes.text);

                if (creativeData.name) name = creativeData.name;
                if (creativeData.type && ITEM_TYPES.includes(creativeData.type)) itemType = creativeData.type;
                if (creativeData.description) description = creativeData.description;
                if (creativeData.rationale) rationale = creativeData.rationale;
                if (creativeData.slot) attributes.slot = creativeData.slot;
                shortName = name.split(' ').pop()?.toLowerCase() || 'item';
            } catch (err) {
                Logger.error('ItemGenerator', `Item Creative Pass failed: ${err}`);
            }
        }

        // 2. Logic Pass
        const budgets = config.budgets;
        const rarityMult = RARITIES.indexOf(rarity) + 1;

        if (itemType === 'weapon') attributes.damage = Math.max(1, Math.min(budgets.maxWeaponDamage, 5 * rarityMult));
        if (itemType === 'armor') attributes.defense = Math.max(1, Math.min(budgets.maxArmorDefense, 3 * rarityMult));

        let cost = Math.min(budgets.maxItemValue, 100 * rarityMult);

        if (llm) {
            try {
                const logicPrompt = `Balance the mechanics for this item to fit the Zenith-9 game engine.
                
                Item Details:
                - Name: ${name}
                - Type: ${itemType}
                - Rarity: ${rarity}
                
                System Constraints:
                - Max Damage: ${budgets.maxWeaponDamage}
                - Max Defense: ${budgets.maxArmorDefense}
                - Max Cost: ${budgets.maxItemValue}
                
                Allowed Mechanics by Type:
                1. WEAPON:
                   - damage: number (1-${budgets.maxWeaponDamage})
                   - range: number (1-100, melee is 0)
                   - ammoType: string (optional, e.g., '9mm', '5.56', 'energy', 'arrow')
                   - magSize: number (optional, if ammoType is set)
                   
                2. ARMOR:
                   - defense: number (1-${budgets.maxArmorDefense})
                   - penalty: number (0-50, encumbrance penalty)
                   - slot: string (head, torso, legs, waist, feet, hands, back)
                   
                3. CONSUMABLE:
                   - effect: string (description of effect, e.g., "Heals 10 HP")
                   - charges: number (1-5)
                   
                4. ITEM (General):
                   - No special stats, just flavor.
                   
                Global Rules:
                - 'cost': number (Required for all)
                - 'weight': number (Required for all, in lbs)
                - 'shortName': string (Required, 1 word, lowercase, unique identifier)
                - DO NOT invent new stats (e.g., no 'strength_bonus' on weapons).
                
                Return ONLY a JSON object with the allowed fields for the item type.`;

                const logicRes = await llm.chat(logicPrompt, "You are a game balance engineer for Zenith-9.", LLMRole.LOGIC);
                models['Logic'] = logicRes.model;
                const logicData = LLMService.parseJson(logicRes.text);

                if (itemType === 'weapon') {
                    attributes.damage = Math.min(budgets.maxWeaponDamage, logicData.damage || attributes.damage || 1);
                    if (logicData.range) attributes.range = logicData.range;
                    if (logicData.ammoType) attributes.ammoType = logicData.ammoType;
                    if (logicData.magSize) attributes.magSize = logicData.magSize;
                }
                if (itemType === 'armor') {
                    attributes.defense = Math.min(budgets.maxArmorDefense, logicData.defense || attributes.defense || 1);
                    if (logicData.penalty) attributes.penalty = logicData.penalty;
                    if (logicData.slot) attributes.slot = logicData.slot;
                }
                if (itemType === 'consumable') {
                    if (logicData.effect) attributes.effect = logicData.effect;
                    if (logicData.charges) attributes.charges = logicData.charges;
                }

                if (logicData.cost !== undefined) cost = Math.min(budgets.maxItemValue, logicData.cost);
                if (logicData.shortName) shortName = logicData.shortName.toLowerCase();
                if (logicData.weight) attributes.weight = logicData.weight; // Allow LLM to suggest weight
            } catch (err) {
                Logger.error('ItemGenerator', `Item Logic Pass failed: ${err}`);
            }
        }

        const weight = itemType === 'weapon'
            ? Math.round((1 + Math.random() * 4) * 10) / 10
            : Math.round((0.1 + Math.random() * 1.9) * 10) / 10;

        // 3. Portrait Pass: AI Image Generation (via Pollinations.ai) - DISABLED
        let portrait = "";
        /*
        if (llm) {
            try {
                const portraitPrompt = `Create a highly detailed image generation prompt for a "realistic 3D digital art" icon of the following cyberpunk item:
                Name: ${name}
                Description: ${description}
                Type: ${itemType}
                
                Requirements for the prompt:
                - Style: Realistic 3D render, studio lighting, isolated on a dark background, cyberpunk aesthetic.
                - Composition: Centered product shot, high detail.
                - Details: Focus on metallic textures, glowing components, and realistic wear and tear.
                - Format: Return ONLY the prompt text. No preamble, no quotes.`;

                const portraitRes = await llm.chat(portraitPrompt, "You are an expert AI image prompt engineer.", LLMRole.CREATIVE);
                const imageRes = await llm.generateImage(portraitRes.text.trim());
                portrait = imageRes.url;
                models['Image'] = imageRes.model;
            } catch (err) {
                Logger.error('ItemGenerator', `Item Portrait Pass failed: ${err}`);
            }
        }
        */

        const payload: ItemPayload = {
            id: `item_${Math.random().toString(36).substring(7)}`,
            name,
            shortName,
            description,
            type: itemType as any,
            rarity: rarity as any,
            cost,
            weight,
            attributes,
            portrait
        };

        const proposal = this.generateBaseProposal(payload, context?.generatedBy || 'Director', models);
        proposal.flavor = { rationale };

        return proposal;
    }
}
