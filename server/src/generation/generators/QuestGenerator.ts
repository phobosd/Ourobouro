import { BaseGenerator } from './BaseGenerator';
import { Proposal, ProposalType, QuestPayload } from '../proposals/schemas';
import { GuardrailConfig, LLMRole } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';

const QUEST_TEMPLATES = [
    { type: 'eliminate', title: 'Eliminate Target', desc: 'A high-value target needs to be removed.' },
    { type: 'data_retrieval', title: 'Data Retrieval', desc: 'Recover the encrypted drive from the secure facility.' },
    { type: 'recon', title: 'Reconnaissance', desc: 'Scan the perimeter of the corporate HQ.' },
    { type: 'informant', title: 'Meet Informant', desc: 'Meet the contact in the back alley of Sector 4.' }
];

export class QuestGenerator extends BaseGenerator<QuestPayload> {
    type = ProposalType.QUEST;

    async generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal> {
        const template = QUEST_TEMPLATES[Math.floor(Math.random() * QUEST_TEMPLATES.length)];

        let title = template.title;
        let description = template.desc;
        let rationale = `Generated a ${template.type} quest.`;

        // 1. Creative Pass
        if (llm) {
            try {
                const creativePrompt = `Generate a gritty cyberpunk quest. 
                Type: ${template.type}
                
                Requirements:
                - Title: A sharp, noir-style title.
                - Description: 2-3 sentences. Frame it as a job offer or a desperate plea.
                - Rationale: Why is this job being offered now?
                
                Return ONLY a JSON object with fields: title, description, rationale.`;

                const creativeRes = await llm.chat(creativePrompt, "You are a Fixer in the world of Zenith-9.", LLMRole.CREATIVE);
                const creativeData = LLMService.parseJson(creativeRes.text);

                if (creativeData.title) title = creativeData.title;
                if (creativeData.description) description = creativeData.description;
                if (creativeData.rationale) rationale = creativeData.rationale;
            } catch (err) {
                console.error('Quest Creative Pass failed:', err);
            }
        }

        // 2. Logic Pass
        const budgets = config.budgets;
        let rewards = {
            gold: Math.floor(Math.random() * budgets.maxGoldDrop),
            xp: Math.floor(Math.random() * budgets.maxQuestXPReward)
        };

        if (llm) {
            try {
                const logicPrompt = `Balance the rewards for this quest:
                Title: ${title}
                Description: ${description}
                Type: ${template.type}
                
                System Constraints (MAX LIMITS):
                - Max Credits: ${budgets.maxGoldDrop}
                - Max XP: ${budgets.maxQuestXPReward}
                
                Return ONLY a JSON object with fields: gold, xp.
                Ensure the rewards reflect the difficulty and stakes described in the quest.`;

                const logicRes = await llm.chat(logicPrompt, "You are a game balance engineer for Zenith-9.", LLMRole.LOGIC);
                const logicData = LLMService.parseJson(logicRes.text);

                if (logicData.gold !== undefined) rewards.gold = Math.min(budgets.maxGoldDrop, logicData.gold);
                if (logicData.xp !== undefined) rewards.xp = Math.min(budgets.maxQuestXPReward, logicData.xp);
            } catch (err) {
                console.error('Quest Logic Pass failed:', err);
            }
        }

        const payload: QuestPayload = {
            id: `quest_${Math.random().toString(36).substring(7)}`,
            title,
            description,
            giverId: 'npc_director',
            steps: [
                {
                    id: 'step_1',
                    description: `Complete the ${template.type} objective.`,
                    type: (template.type === 'eliminate' ? 'kill' :
                        template.type === 'data_retrieval' ? 'fetch' :
                            template.type === 'recon' ? 'explore' : 'talk') as any,
                    target: 'any',
                    count: 1
                }
            ],
            rewards
        };

        const proposal = this.generateBaseProposal(payload);
        proposal.flavor = { rationale };

        return proposal;
    }
}
