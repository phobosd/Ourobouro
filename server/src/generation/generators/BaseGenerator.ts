import { v4 as uuidv4 } from 'uuid';
import {
    Proposal,
    ProposalType,
    ProposalStatus
} from '../proposals/schemas';
import { GuardrailConfig } from '../../services/GuardrailService';
import { LLMService } from '../llm/LLMService';

export abstract class BaseGenerator<T> {
    abstract type: ProposalType;

    protected generateBaseProposal(payload: any, generatedBy: string = 'Director', models?: Record<string, string>): Proposal {
        return {
            id: uuidv4(),
            type: this.type,
            status: ProposalStatus.DRAFT,
            payload,
            seed: Math.random().toString(36).substring(7),
            generatedBy,
            models,
            createdAt: Date.now(),
            tags: []
        };
    }

    abstract generate(config: GuardrailConfig, llm?: LLMService, context?: any): Promise<Proposal>;
}
