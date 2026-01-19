import { DirectorSocketHandler } from './DirectorSocketHandler';
import { WorldDirector } from '../Director';
import { Socket } from 'socket.io';

jest.mock('../Director', () => ({
    WorldDirector: jest.fn(),
    DirectorLogLevel: {
        INFO: 'info',
        WARN: 'warn',
        ERROR: 'error',
        SUCCESS: 'success'
    }
}));

jest.mock('../../utils/Logger');
jest.mock('../../services/ItemRegistry');
jest.mock('../../services/NPCRegistry');
jest.mock('../../services/RoomRegistry');
jest.mock('../../factories/PrefabFactory', () => ({
    PrefabFactory: {
        createNPC: jest.fn(),
        createItem: jest.fn(),
        createRoom: jest.fn(),
        equipNPC: jest.fn(),
        getSpawnableItems: jest.fn().mockReturnValue([]),
        getSpawnableNPCs: jest.fn().mockReturnValue([])
    }
}));
jest.mock('../../services/CompendiumService');
jest.mock('../../components/Position');
jest.mock('../../components/NPC');
jest.mock('../../components/Terminal');
jest.mock('../../utils/ImageDownloader');
jest.mock('../../services/AuthService');
jest.mock('../../services/CharacterService');

// Mock WorldDirector
const mockDirector = {
    management: {
        pause: jest.fn(),
        resume: jest.fn(),
        personality: { chaos: {}, aggression: {}, expansion: {} },
        glitchConfig: {},
        saveConfig: jest.fn()
    },
    getStatus: jest.fn().mockReturnValue({}),
    log: jest.fn(),
    guardrails: {
        getConfig: jest.fn().mockReturnValue({ features: {}, budgets: {} }),
        saveConfig: jest.fn()
    },
    proposals: [],
    publisher: { publish: jest.fn() },
    engine: { addEntity: jest.fn(), getEntity: jest.fn(), removeEntity: jest.fn() },
    io: { emit: jest.fn() },
    npcGen: { generate: jest.fn() },
    itemGen: { generate: jest.fn() },
    questGen: { generate: jest.fn() },
    roomGen: { generate: jest.fn() },
    chunkSystem: { getGeneratedChunks: jest.fn(), deleteChunk: jest.fn() },
    snapshots: { listSnapshots: jest.fn(), createSnapshot: jest.fn(), restoreSnapshot: jest.fn(), deleteSnapshot: jest.fn() },
    triggerWorldEvent: jest.fn(),
    stopEvent: jest.fn(),
    generateBoss: jest.fn(),
    findAdjacentEmptySpot: jest.fn(),
    processProposalAssets: jest.fn(),
    generateChunk: jest.fn()
} as unknown as WorldDirector;

// Mock Socket and Namespace
const mockSocket = {
    id: 'socket-123',
    handshake: { auth: { token: 'valid-token' } },
    emit: jest.fn(),
    on: jest.fn(),
    join: jest.fn()
} as unknown as Socket;

const mockNamespace = {
    use: jest.fn(),
    on: jest.fn(),
    emit: jest.fn()
} as any;

describe('DirectorSocketHandler', () => {
    let handler: DirectorSocketHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        handler = new DirectorSocketHandler(mockDirector, mockNamespace);
    });

    it('should setup middleware and connection handler', () => {
        handler.setup();
        expect(mockNamespace.use).toHaveBeenCalled();
        expect(mockNamespace.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle pause command', () => {
        mockNamespace.on.mockImplementation((event: string, fn: Function) => {
            if (event === 'connection') {
                fn(mockSocket);
            }
        });

        handler.setup();

        const pauseListener = (mockSocket.on as jest.Mock).mock.calls.find(call => call[0] === 'director:pause')[1];
        expect(pauseListener).toBeDefined();

        pauseListener();
        expect(mockDirector.management.pause).toHaveBeenCalled();
    });

    it('should handle resume command', () => {
        mockNamespace.on.mockImplementation((event: string, fn: Function) => {
            if (event === 'connection') {
                fn(mockSocket);
            }
        });

        handler.setup();

        const resumeListener = (mockSocket.on as jest.Mock).mock.calls.find(call => call[0] === 'director:resume')[1];
        expect(resumeListener).toBeDefined();

        resumeListener();
        expect(mockDirector.management.resume).toHaveBeenCalled();
    });
});
