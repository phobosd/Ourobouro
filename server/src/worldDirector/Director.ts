import { Server, Socket } from 'socket.io';
import { Logger } from '../utils/Logger';
import { GuardrailService } from '../services/GuardrailService';
import { SnapshotService } from '../services/SnapshotService';
import { PublisherService } from '../services/PublisherService';
import { NPCGenerator } from '../generation/generators/NPCGenerator';
import { DirectorSnapshotService } from './services/DirectorSnapshotService';
import { ItemGenerator } from '../generation/generators/ItemGenerator';
import { QuestGenerator } from '../generation/generators/QuestGenerator';
import { RoomGenerator } from '../generation/generators/RoomGenerator';
import { LLMService } from '../generation/llm/LLMService';
import { ProposalStatus, ProposalType, NPCPayload, ItemPayload, RoomPayload } from '../generation/proposals/schemas';
import { ItemRegistry } from '../services/ItemRegistry';
import { NPCRegistry } from '../services/NPCRegistry';
import { RoomRegistry } from '../services/RoomRegistry';
import { PrefabFactory } from '../factories/PrefabFactory';
import { CompendiumService } from '../services/CompendiumService';
import { Engine } from '../ecs/Engine';
import { ChunkSystem } from '../world/ChunkSystem';
import * as fs from 'fs';
import * as path from 'path';
import { IsRoom } from '../components/IsRoom';
import { Position } from '../components/Position';
import { Loot } from '../components/Loot';
import { NPC } from '../components/NPC';
import { Terminal } from '../components/Terminal';
import { ImageDownloader } from '../utils/ImageDownloader';
import { v4 as uuidv4 } from 'uuid';
import { DirectorSocketHandler } from './services/DirectorSocketHandler';
import { DirectorManagementService } from './services/DirectorManagementService';
import { FinOpsService } from '../services/FinOpsService';
import { DirectorContentService } from './services/DirectorContentService';
import { DirectorAutomationService } from './services/DirectorAutomationService';
import { DirectorActivityService } from './services/DirectorActivityService';
import { DirectorLogLevel, DirectorLogEntry } from './DirectorTypes';



export class WorldDirector {
    public io: Server;
    public adminNamespace: any;
    public guardrails: GuardrailService;
    public snapshots: SnapshotService;
    public publisher: PublisherService;
    public llm: LLMService;

    // Generators
    public npcGen: NPCGenerator;
    public itemGen: ItemGenerator;
    public questGen: QuestGenerator;
    public roomGen: RoomGenerator;

    public engine: Engine;
    public chunkSystem: ChunkSystem;

    public management: DirectorManagementService;
    public snapshotManager: DirectorSnapshotService;
    public content: DirectorContentService;
    public automation: DirectorAutomationService;
    public activity: DirectorActivityService;

    public logs: DirectorLogEntry[] = [];
    public proposals: any[] = []; // Pending content proposals
    private innerThoughts: { timestamp: number, thought: string }[] = [];

    private configPath = path.join(process.cwd(), 'data', 'director_config.json');

    private socketHandler: DirectorSocketHandler;

    public getLLM(): LLMService {
        return this.llm;
    }

    constructor(io: Server, guardrails: GuardrailService, snapshots: SnapshotService, publisher: PublisherService, engine: Engine) {
        this.io = io;
        this.guardrails = guardrails;
        this.snapshots = snapshots;
        this.publisher = publisher;
        this.engine = engine;
        this.chunkSystem = new ChunkSystem(engine);
        this.llm = new LLMService(guardrails.getConfig().llmProfiles);
        this.adminNamespace = io.of('/admin');

        // Subscribe to guardrail updates to keep LLM profiles in sync
        this.guardrails.onUpdate((config) => {
            this.llm.updateConfig(config.llmProfiles);
            this.log(DirectorLogLevel.INFO, 'LLM Profiles updated from GuardrailService.');
        });

        // Initialize Generators
        this.npcGen = new NPCGenerator();
        this.itemGen = new ItemGenerator();
        this.questGen = new QuestGenerator();
        this.roomGen = new RoomGenerator();

        this.management = new DirectorManagementService(this);
        this.management.loadConfig();

        this.snapshotManager = new DirectorSnapshotService(this, snapshots);
        this.content = new DirectorContentService(this);
        this.automation = new DirectorAutomationService(this);
        this.activity = new DirectorActivityService(this);

        // Start the automation loop (it will respect isPaused)
        this.automation.start();

        this.socketHandler = new DirectorSocketHandler(this, this.adminNamespace);
        this.socketHandler.setup();

        this.setupEventListeners();
    }


    private async setupEventListeners() {
        const { GameEventBus, GameEventType } = await import('../utils/GameEventBus');
        const { CharacterService } = await import('../services/CharacterService');

        GameEventBus.getInstance().subscribe(GameEventType.PLAYER_CONNECTED, async () => {
            const charService = CharacterService.getInstance();
            const characters = charService.getAllCharacters();
            const enriched = characters.map(c => ({
                ...c,
                online: !!charService.getActiveEntityByCharId(c.id, this.engine)
            }));
            this.adminNamespace.emit('director:characters_update', enriched);
        });

        GameEventBus.getInstance().subscribe(GameEventType.PLAYER_DISCONNECTED, async () => {
            const charService = CharacterService.getInstance();
            const characters = charService.getAllCharacters();
            const enriched = characters.map(c => ({
                ...c,
                online: !!charService.getActiveEntityByCharId(c.id, this.engine)
            }));
            this.adminNamespace.emit('director:characters_update', enriched);
        });
    }

    public log(level: DirectorLogLevel, message: string, context?: any) {
        const entry: DirectorLogEntry = {
            timestamp: Date.now(),
            level,
            message,
            context
        };
        this.logs.push(entry);
        // Keep log size manageable
        if (this.logs.length > 1000) this.logs.shift();

        // Broadcast to admin
        this.adminNamespace.emit('director:log', entry);
    }

    public think(thought: string) {
        const entry = { timestamp: Date.now(), thought };
        this.innerThoughts.unshift(entry);
        if (this.innerThoughts.length > 100) this.innerThoughts.pop();
        this.adminNamespace.emit('director:thoughts_update', this.innerThoughts);
    }

    public getStatus() {
        return {
            paused: this.management.isPaused,
            personality: this.management.personality,
            glitchConfig: this.management.glitchConfig, // Expose config
            aiConfig: this.management.aiConfig, // Expose AI config
            guardrails: this.guardrails.getSafeConfig(),
            proposals: this.proposals,
            activeEvents: this.content.activeEvents, // Expose active events
            innerThoughts: this.innerThoughts,
            finops: FinOpsService.getInstance().getStats()
        };
    }
}
