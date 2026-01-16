import { z } from 'zod';

// --- Core Proposal Types ---

export enum ProposalType {
    NPC = 'NPC',
    ITEM = 'ITEM',
    QUEST = 'QUEST',
    BUILDING = 'BUILDING',
    EVENT = 'EVENT',
    WORLD_EXPANSION = 'WORLD_EXPANSION'
}

export enum ProposalStatus {
    DRAFT = 'DRAFT',
    VALIDATED = 'VALIDATED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    PUBLISHED = 'PUBLISHED',
    FAILED = 'FAILED'
}

// --- Payload Schemas ---

// 1. NPC Schema
export const NPCPayloadSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string(),
    stats: z.object({
        health: z.number().min(1),
        attack: z.number().min(0),
        defense: z.number().min(0)
    }),
    behavior: z.string().optional(), // e.g., "aggressive", "merchant"
    dialogue: z.array(z.string()).optional(),
    faction: z.string().optional(),
    role: z.string().optional(),
    equipment: z.array(z.string()).optional(), // Item IDs
    tags: z.array(z.string()).optional(),
    canMove: z.boolean().default(true),
    portrait: z.string().optional()
});

// 2. Item Schema
export const ItemPayloadSchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    shortName: z.string(),
    description: z.string(),
    type: z.enum(['weapon', 'armor', 'consumable', 'junk', 'container', 'cyberware']),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
    cost: z.number().min(0),
    weight: z.number().min(0),
    attributes: z.record(z.string(), z.any()).optional(), // Flexible for now, can be tightened
    effects: z.array(z.object({
        type: z.string(),
        value: z.number(),
        duration: z.number().optional()
    })).optional(),
    portrait: z.string().optional()
});

// 3. Quest Schema
export const QuestPayloadSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    giverId: z.string(), // NPC ID
    steps: z.array(z.object({
        id: z.string(),
        description: z.string(),
        type: z.enum(['kill', 'fetch', 'talk', 'explore']),
        target: z.string(), // NPC/Item/Room ID
        count: z.number().default(1)
    })),
    rewards: z.object({
        gold: z.number().optional(),
        xp: z.number().optional(),
        items: z.array(z.string()).optional()
    }),
    requirements: z.object({
        level: z.number().optional(),
        factionRep: z.record(z.string(), z.number()).optional()
    }).optional()
});

// 4. Room/Building Schema (World Expansion)
export const RoomPayloadSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    coordinates: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().default(0)
    }),
    exits: z.record(z.string(), z.string()), // direction -> roomId
    type: z.enum(['street', 'indoor', 'shop', 'dungeon', 'safehouse']),
    features: z.array(z.string()).optional(), // e.g., "vending_machine", "terminal"
    spawns: z.array(z.object({
        npcId: z.string(),
        chance: z.number()
    })).optional(),
    portrait: z.string().optional()
});

// 5. Event Schema
export const EventPayloadSchema = z.object({
    id: z.string(),
    type: z.string(), // e.g., "invasion", "sale", "weather"
    description: z.string(),
    duration: z.number(), // in ticks or seconds
    zoneId: z.string().optional(),
    effects: z.record(z.string(), z.any()).optional()
});

// --- The Master Proposal Schema ---

export const ProposalSchema = z.object({
    id: z.string().uuid(),
    type: z.nativeEnum(ProposalType),
    status: z.nativeEnum(ProposalStatus).default(ProposalStatus.DRAFT),

    // The actual content (Union of all payloads)
    payload: z.union([
        NPCPayloadSchema,
        ItemPayloadSchema,
        QuestPayloadSchema,
        RoomPayloadSchema,
        EventPayloadSchema
    ]),

    // Metadata
    seed: z.string(), // For reproducibility
    generatedBy: z.string(), // "Director" or "Manual"
    createdAt: z.number(),

    // Flavor text (from LLM)
    flavor: z.object({
        rationale: z.string().optional(), // Why did the Director make this?
        lore: z.string().optional()
    }).optional(),

    // Validation results
    validationErrors: z.array(z.string()).optional(),
    budgetScore: z.number().optional(),

    // Tags for filtering
    tags: z.array(z.string()).default([])
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type NPCPayload = z.infer<typeof NPCPayloadSchema>;
export type ItemPayload = z.infer<typeof ItemPayloadSchema>;
export type QuestPayload = z.infer<typeof QuestPayloadSchema>;
export type RoomPayload = z.infer<typeof RoomPayloadSchema>;
export type EventPayload = z.infer<typeof EventPayloadSchema>;
