import { Entity } from '../../ecs/Entity';
import { IEngine } from '../../ecs/IEngine';
import { Position } from '../../components/Position';
import { NPC } from '../../components/NPC';
import { MessageService } from '../../services/MessageService';
import { MessageFormatter } from '../../utils/MessageFormatter';
import { NPCUtils } from './NPCUtils';
import { LLMService } from '../../generation/llm/LLMService';
import { LLMRole } from '../../services/GuardrailService';

export class NPCBehaviorHandler {
    static async bark(npc: Entity, npcComp: NPC, pos: Position, engine: IEngine, messageService: MessageService, llm?: LLMService) {
        let bark = "";

        /* Disabling LLM barks for now to reduce API usage
        if (llm) {
            try {
                const prompt = `Generate a single, short "bark" (one line of dialogue) for the following NPC:
                Name: ${npcComp.typeName}
                Description: ${npcComp.description}
                Behavior: ${npcComp.isAggressive ? 'aggressive' : 'neutral'}
                
                The bark should be in-character, gritty, and fit a cyberpunk setting. 
                Return ONLY the bark text. No quotes, no preamble.`;

                const res = await llm.chat(prompt, "You are a narrative designer for a cyberpunk MUD.", LLMRole.CREATIVE);
                bark = res.text.trim().replace(/^["']|["']$/g, '');
            } catch (err) {
                console.error(`Failed to generate LLM bark for ${npcComp.typeName}:`, err);
            }
        }
        */

        // Fallback to pre-defined barks if LLM fails or is unavailable
        if (!bark && npcComp.barks && npcComp.barks.length > 0) {
            bark = npcComp.barks[Math.floor(Math.random() * npcComp.barks.length)];
        }

        if (!bark) return;

        const message = MessageFormatter.speech(npcComp.typeName, bark);

        // Broadcast to players in the same room
        NPCUtils.broadcastToRoom(engine, pos.x, pos.y, message, messageService);
    }
}
