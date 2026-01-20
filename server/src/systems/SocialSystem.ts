import { System } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { IEngine } from '../ecs/IEngine';
import { MessageService } from '../services/MessageService';
import { MessageType } from '../types/MessageTypes';
import { NPC } from '../components/NPC';
import { Position } from '../components/Position';
import { Personality } from '../components/Personality';
import { Memory } from '../components/Memory';
import { Relationship } from '../components/Relationship';
import { GameEventBus, GameEventType } from '../utils/GameEventBus';
import { Logger } from '../utils/Logger';
import { Conversation } from '../components/Conversation';
import { LLMService } from '../generation/llm/LLMService';
import { LLMRole } from '../services/GuardrailService';
import { Description } from '../components/Description';
import { Role } from '../components/Role';

interface ConversationState {
    lastConversation: number;      // Timestamp of last conversation
    currentPartner: string | null;  // ID of current conversation partner
    turnCount: number;              // Number of turns in current conversation
    waitingForResponse: boolean;    // Whether we are waiting for the partner to speak
    history: { speaker: string, text: string }[]; // History of the conversation
}

export class SocialSystem extends System {
    private messageService: MessageService;
    private llmService: LLMService;
    private lastSocialCheck: number = 0;
    private readonly SOCIAL_CHECK_INTERVAL = 30000; // 30 seconds
    private readonly CONVERSATION_COOLDOWN = 120000; // 2 minutes
    private conversationChance = 0.3; // 30% chance (default)
    private maxConversationTurns = 6;

    private lastGossipCheck: number = 0;
    private readonly GOSSIP_CHECK_INTERVAL = 60000; // Check every minute
    private gossipChance = 0.1; // 10% chance per minute for a global message

    private npcConversationState: Map<string, ConversationState> = new Map();

    constructor(messageService: MessageService, llmService: LLMService) {
        super();
        this.messageService = messageService;
        this.llmService = llmService;

        // Subscribe to config updates
        GameEventBus.getInstance().subscribe(GameEventType.CONFIG_UPDATED, (payload) => {
            if (payload.aiConfig && payload.aiConfig.ambientDialogueFrequency !== undefined) {
                this.conversationChance = payload.aiConfig.ambientDialogueFrequency / 100;
                Logger.info('SocialSystem', `Updated conversation chance to ${this.conversationChance}`);
            }
            if (payload.aiConfig && payload.aiConfig.maxConversationTurns !== undefined) {
                this.maxConversationTurns = payload.aiConfig.maxConversationTurns;
                Logger.info('SocialSystem', `Updated max turns to ${this.maxConversationTurns}`);
            }
        });
    }

    update(engine: IEngine, deltaTime: number): void {
        const now = Date.now();

        // Global Gossip Check
        if (now - this.lastGossipCheck > this.GOSSIP_CHECK_INTERVAL) {
            this.lastGossipCheck = now;
            if (Math.random() < this.gossipChance) {
                this.triggerGlobalGossip(engine);
            }
        }

        if (now - this.lastSocialCheck < this.SOCIAL_CHECK_INTERVAL) {
            return;
        }
        this.lastSocialCheck = now;

        const npcs = engine.getEntitiesWithComponent(Personality);

        for (const npc of npcs) {
            const npcComp = npc.getComponent(NPC);
            const pos = npc.getComponent(Position);

            if (!npcComp || !pos || npcComp.behavior === 'aggressive') continue;

            // Initialize state if needed
            if (!this.npcConversationState.has(npc.id)) {
                this.npcConversationState.set(npc.id, {
                    lastConversation: 0,
                    currentPartner: null,
                    turnCount: 0,
                    waitingForResponse: false,
                    history: []
                });
            }

            const state = this.npcConversationState.get(npc.id)!;

            // 0. Check for active conversation response (High Priority)
            if (state.currentPartner && !state.waitingForResponse) {
                // It's our turn to speak!
                // Check for a natural pause (e.g., 1.5 seconds)
                if (now - state.lastConversation > 1500) {
                    this.respondToConversation(engine, npc, state);
                }
                continue;
            }

            // Check cooldown for initiating NEW conversations
            if (now - state.lastConversation < this.CONVERSATION_COOLDOWN) {
                continue;
            }

            // Random chance check
            if (Math.random() > this.conversationChance) {
                continue;
            }

            // 1. Try to greet a player first (higher priority)
            const nearbyPlayers = this.findNearbyPlayers(engine, pos);
            if (nearbyPlayers.length > 0) {
                const targetPlayer = nearbyPlayers[Math.floor(Math.random() * nearbyPlayers.length)];
                if (this.shouldGreetPlayer(npc, targetPlayer)) {
                    this.initiatePlayerConversation(engine, npc, targetPlayer, npcComp);
                    continue; // Done for this turn
                }
            }

            // 2. Try to talk to another NPC
            const nearbyNPCs = this.findNearbyNPCs(engine, npc.id, pos);
            if (nearbyNPCs.length > 0) {
                const targetNPC = nearbyNPCs[Math.floor(Math.random() * nearbyNPCs.length)];
                const targetNPCComp = targetNPC.getComponent(NPC);
                if (targetNPCComp) {
                    this.initiateConversation(engine, npc, targetNPC, npcComp, targetNPCComp);
                }
            }
        }
    }

    private findNearbyPlayers(engine: IEngine, position: Position): Entity[] {
        const players: Entity[] = [];

        for (const entity of engine.getEntities().values()) {
            if (entity.hasComponent(NPC)) continue;

            const pos = entity.getComponent(Position);
            if (!pos) continue;

            if (pos.x === position.x && pos.y === position.y) {
                // Check if it's a player (has Role component)
                if (entity.hasComponent(Role)) {
                    players.push(entity);
                }
            }
        }
        return players;
    }

    private findNearbyNPCs(engine: IEngine, excludeId: string, position: Position): Entity[] {
        const potentialPartners: Entity[] = [];
        const npcs = engine.getEntitiesWithComponent(NPC);

        for (const other of npcs) {
            if (other.id === excludeId) continue;

            const pos = other.getComponent(Position);
            if (!pos) continue;

            if (pos.x === position.x && pos.y === position.y) {
                const otherComp = other.getComponent(NPC);
                // Only talk to non-aggressive NPCs with Personality
                if (otherComp && otherComp.behavior !== 'aggressive' && other.hasComponent(Personality)) {
                    potentialPartners.push(other);
                }
            }
        }
        return potentialPartners;
    }

    private shouldGreetPlayer(npc: Entity, player: Entity): boolean {
        const relationship = npc.getComponent(Relationship);
        if (!relationship) return false;

        // Use Name as key if available to match InteractionSystem
        let targetKey = player.id;
        const desc = player.getComponent(Description);
        if (desc) targetKey = desc.title;

        const relData = relationship.getRelationship(targetKey);
        const chance = Math.random();

        // Higher trust = higher chance to greet
        if (relData.status === 'Trusted') return chance < 0.7;
        if (relData.status === 'Friendly') return chance < 0.5;
        if (relData.status === 'Neutral') return chance < 0.2;
        if (relData.status === 'Hostile') return chance < 0.05; // Rare taunt

        return false;
    }

    private initiatePlayerConversation(engine: IEngine, npc: Entity, player: Entity, npcComp: NPC) {
        const personality = npc.getComponent(Personality);
        const greeting = this.generateGreeting(personality, npcComp.typeName, 'player');

        const pos = npc.getComponent(Position)!;

        // Broadcast to room
        this.messageService.sendToRoom(pos.x, pos.y, MessageType.INFO, `[${npcComp.typeName}] says to you: "${greeting}"`);

        // Update state
        const state = this.npcConversationState.get(npc.id)!;
        state.lastConversation = Date.now();
        state.currentPartner = null; // Don't track player state here, let them respond naturally via commands
        state.turnCount = 1;
        state.waitingForResponse = false;
        state.history = [{ speaker: npcComp.typeName, text: greeting }];

        // Update Memory
        const memory = npc.getComponent(Memory);
        if (memory) {
            memory.addShortTerm(`Greeted player ${player.id}`, [player.id]);
        }
    }

    private initiateConversation(engine: IEngine, initiator: Entity, target: Entity, initiatorComp: NPC, targetComp: NPC) {
        const personality = initiator.getComponent(Personality);
        const greeting = this.generateGreeting(personality, initiatorComp.typeName, 'npc');

        const pos = initiator.getComponent(Position)!;

        // Broadcast to room
        this.messageService.sendToRoom(pos.x, pos.y, MessageType.INFO, `[${initiatorComp.typeName}] says to [${targetComp.typeName}]: "${greeting}"`);

        // Update state for both
        const stateInit = this.npcConversationState.get(initiator.id)!;
        stateInit.lastConversation = Date.now();
        stateInit.currentPartner = target.id;
        stateInit.turnCount = 1;
        stateInit.waitingForResponse = true; // Initiator waits for response
        stateInit.history = [{ speaker: initiatorComp.typeName, text: greeting }];

        // Initialize target state if needed
        if (!this.npcConversationState.has(target.id)) {
            this.npcConversationState.set(target.id, {
                lastConversation: Date.now(),
                currentPartner: initiator.id,
                turnCount: 1,
                waitingForResponse: false, // Target needs to respond
                history: [{ speaker: initiatorComp.typeName, text: greeting }]
            });
        } else {
            const stateTarget = this.npcConversationState.get(target.id)!;
            stateTarget.lastConversation = Date.now();
            stateTarget.currentPartner = initiator.id;
            stateTarget.turnCount = 1;
            stateTarget.waitingForResponse = false; // Target needs to respond
            stateTarget.history = [{ speaker: initiatorComp.typeName, text: greeting }];
        }

        // Add Conversation component to both (blocks movement)
        if (!initiator.hasComponent(Conversation)) initiator.addComponent(new Conversation(target.id));
        if (!target.hasComponent(Conversation)) target.addComponent(new Conversation(initiator.id));

        // Update Memory
        const memory = initiator.getComponent(Memory);
        if (memory) {
            memory.addShortTerm(`Chatted with ${targetComp.typeName}`, [target.id]);
        }
    }

    private respondToConversation(engine: IEngine, npc: Entity, state: ConversationState) {
        if (!state.currentPartner) return;

        const partner = engine.getEntity(state.currentPartner);
        if (!partner) {
            // Partner gone, end convo
            state.currentPartner = null;
            return;
        }

        const npcComp = npc.getComponent(NPC);
        const partnerComp = partner.getComponent(NPC);
        if (!npcComp || !partnerComp) {
            state.currentPartner = null;
            return;
        }

        const personality = npc.getComponent(Personality);

        // Use LLM for response
        this.generateLLMResponse(npc, partner, personality, npcComp.typeName, partnerComp.typeName, state.history).then(response => {
            const pos = npc.getComponent(Position)!;

            // Broadcast response
            this.messageService.sendToRoom(pos.x, pos.y, MessageType.INFO, `[${npcComp.typeName}] says to [${partnerComp.typeName}]: "${response}"`);
            Logger.info('SocialSystem', `[${npcComp.typeName}] responded to [${partnerComp.typeName}]. Cleaned Response: "${response}". Turn: ${state.turnCount + 1}`);

            // Update states
            state.lastConversation = Date.now();
            state.turnCount++;
            state.waitingForResponse = true; // Now we wait
            state.history.push({ speaker: npcComp.typeName, text: response });

            // Update partner state
            if (this.npcConversationState.has(partner.id)) {
                const partnerState = this.npcConversationState.get(partner.id)!;
                partnerState.waitingForResponse = false; // Their turn
                partnerState.turnCount++;
                partnerState.lastConversation = Date.now(); // Reset their timer so they don't timeout immediately
                partnerState.history = [...state.history]; // Sync history

                // Check for end of conversation
                if (state.turnCount >= this.maxConversationTurns) {
                    Logger.info('SocialSystem', `Conversation between ${npcComp.typeName} and ${partnerComp.typeName} ended. Turns: ${state.turnCount}/${this.maxConversationTurns}`);

                    // Process memories for both participants
                    this.processConversationMemory(npc, partner, state.history);
                    this.processConversationMemory(partner, npc, state.history);

                    state.currentPartner = null;
                    partnerState.currentPartner = null;

                    // Remove Conversation component
                    npc.removeComponent(Conversation);
                    partner.removeComponent(Conversation);
                }
            } else {
                // Partner state lost? End convo
                state.currentPartner = null;
                npc.removeComponent(Conversation);
            }
        });
    }

    private async processConversationMemory(npc: Entity, partner: Entity, history: { speaker: string, text: string }[]) {
        const memory = npc.getComponent(Memory);
        const npcComp = npc.getComponent(NPC);
        const partnerComp = partner.getComponent(NPC);
        const relationship = npc.getComponent(Relationship);
        const partnerRole = partner.getComponent(Role);

        if (!memory || !npcComp) return;

        // ONLY process relationships for NPCs or Players
        if (!partnerComp && !partnerRole) {
            Logger.info('SocialSystem', `Skipping memory processing for non-sentient partner: ${partner.id}`);
            return;
        }

        // Determine partner name and persistent ID
        let partnerName = "Unknown";
        let partnerPersistentId = partner.id;

        if (partnerComp) {
            partnerName = partnerComp.typeName;
            partnerPersistentId = partnerComp.typeName; // Use typeName as persistent ID for NPCs
        } else {
            // Try to find player name via Description component
            const desc = partner.getComponent(Description);
            if (desc) {
                partnerName = desc.title;
                partnerPersistentId = desc.title;
            } else {
                partnerName = `Entity ${partner.id}`;
            }
        }

        const historyText = history.map(h => `${h.speaker}: "${h.text}"`).join('\n');

        const prompt = `Analyze the following conversation between ${npcComp.typeName} (You) and ${partnerName}.
        
        CONVERSATION:
        ${historyText}

        Identify 1-3 important facts, relationship updates, or key details that ${npcComp.typeName} should remember long-term.
        Also, determine if this interaction improved or damaged the relationship.
        
        - Focus on actionable info (quests, threats, deals).
        - Ignore small talk ("Hello", "How are you").
        - trustChange: A number between -10 and 10. 
            - 0: Neutral/Small talk
            - 5: Helpful/Friendly
            - 10: Major deal/Alliance
            - -5: Rude/Unhelpful
            - -10: Threatening/Hostile
        
        Return ONLY a JSON object. Example: { "memories": ["Learned that X is a spy"], "trustChange": 5 }.`;

        try {
            const llmRes = await this.llmService.chat(prompt, "You are a social memory system for an AI agent.", LLMRole.LOGIC);
            const result = LLMService.parseJson(llmRes.text);

            if (result && typeof result === 'object') {
                // 1. Process Memories
                if (Array.isArray(result.memories)) {
                    for (const mem of result.memories) {
                        if (typeof mem === 'string' && mem.length > 5) {
                            memory.addLongTerm(mem, [partnerPersistentId]);
                            Logger.info('SocialSystem', `[${npcComp.typeName}] Formed Memory: "${mem}"`);
                        }
                    }
                }

                // 2. Process Relationship Update
                if (relationship && result.trustChange !== undefined && typeof result.trustChange === 'number') {
                    const change = Math.max(-10, Math.min(10, result.trustChange));
                    if (change !== 0) {
                        relationship.modifyTrust(partnerPersistentId, change);
                        Logger.info('SocialSystem', `[${npcComp.typeName}] Relationship with ${partnerName} changed by ${change}.`);
                    }
                }
            }
        } catch (err) {
            Logger.warn('SocialSystem', `Failed to process memory for ${npcComp.typeName}: ${err}`);
        }
    }

    private async generateLLMResponse(npc: Entity, partner: Entity, personality: Personality | undefined, name: string, partnerName: string, history: { speaker: string, text: string }[]): Promise<string> {
        if (!personality) return "Greetings.";

        const historyText = history.slice(-4).map(h => `${h.speaker}: "${h.text}"`).join('\n');
        const traits = personality.traits.join(', ');
        const prompt = `You are ${name}, a cyberpunk NPC with traits: ${traits}. You are talking to ${partnerName}.
        
        CONVERSATION HISTORY:
        ${historyText}
        ${partnerName}: "..." (The partner just spoke, respond to this)

        Current agenda: ${personality.agenda}.
        Generate a short, single-sentence response to continue the conversation. Keep it under 15 words.
        Output ONLY the spoken text. Do not include thoughts, reasoning, or quotes.`;

        try {
            const llmRes = await this.llmService.chat(prompt, "You are a roleplaying NPC.");
            let response = llmRes.text;

            if (llmRes.reasoning) {
                Logger.info('SocialSystem', `[${name}] Reasoning: ${llmRes.reasoning.substring(0, 200)}...`);
            }

            // Clean response
            response = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
            return response.replace(/^["\s]+|["\s]+$/g, '').trim();
        } catch (err) {
            Logger.error('SocialSystem', `LLM generation failed for ${name}: ${err}`);
            return this.generateGreeting(personality, name, 'npc'); // Fallback
        }
    }

    private async triggerGlobalGossip(engine: IEngine) {
        const npcs = engine.getEntitiesWithComponent(Personality);
        if (npcs.length === 0) return;

        const npc = npcs[Math.floor(Math.random() * npcs.length)];
        const npcComp = npc.getComponent(NPC);
        const personality = npc.getComponent(Personality);

        if (!npcComp || !personality) return;

        const prompt = `You are ${npcComp.typeName}, a cyberpunk NPC with traits: ${personality.traits.join(', ')}.
        Current agenda: ${personality.agenda}.
        Generate a short, intriguing message to broadcast on the global Neural Link (public feed).
        Topics: Corporate rumors, street events, weather anomalies, or philosophical musings.
        Keep it under 20 words.
        Output ONLY the message text. Do not include thoughts or quotes.`;

        try {
            const llmRes = await this.llmService.chat(prompt, "You are a roleplaying NPC.");
            let response = llmRes.text;

            if (llmRes.reasoning) {
                Logger.info('SocialSystem', `[${npcComp.typeName}] Gossip Reasoning: ${llmRes.reasoning.substring(0, 200)}...`);
            }

            response = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
            const matches = response.match(/"([^"]*)"/g);
            if (matches && matches.length > 0) {
                response = matches[matches.length - 1].replace(/^"|"$/g, '');
            } else {
                const lines = response.split('\n').filter(line => line.trim() !== '');
                if (lines.length > 0) response = lines[lines.length - 1].trim();
            }
            response = response.trim().replace(/^"|"$/g, '');

            if (response) {
                this.messageService.broadcastGlobal(npcComp.typeName, response);
                Logger.info('SocialSystem', `Global Gossip from ${npcComp.typeName}: "${response}"`);
            }
        } catch (err) {
            Logger.error('SocialSystem', `Gossip generation failed: ${err}`);
        }
    }

    private generateGreeting(personality: Personality | undefined, name: string, targetType: 'player' | 'npc'): string {
        if (!personality) return "Hello.";

        const traits = personality.traits.map(t => t.toLowerCase());

        if (traits.includes('friendly') || traits.includes('cheerful')) {
            return targetType === 'player' ? "Hey there! Good to see a friendly face." : "Nice weather we're having, isn't it?";
        }
        if (traits.includes('cautious') || traits.includes('paranoid')) {
            return targetType === 'player' ? "Keep your distance..." : "Did you hear that noise?";
        }
        if (traits.includes('cynical') || traits.includes('ruthless')) {
            return "What do you want?";
        }
        if (traits.includes('calculating')) {
            return "I trust you have business here?";
        }

        return "Greetings.";
    }
}
