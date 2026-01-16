import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { DirectorTab } from './admin/DirectorTab';
import { ApprovalsTab } from './admin/ApprovalsTab';
import { WorldTab } from './admin/WorldTab';
import { ItemsTab } from './admin/ItemsTab';
import { NPCsTab } from './admin/NPCsTab';
import { GlitchTab } from './admin/GlitchTab';
import { SnapshotsTab } from './admin/SnapshotsTab';
import { LLMTab } from './admin/LLMTab';
import { LogsTab } from './admin/LogsTab';

// Types (mirrored from server)
export interface LogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    context?: any;
    source?: 'director' | 'server';
}

export interface Proposal {
    id: string;
    type: string;
    status: string;
    payload: any;
    flavor?: { rationale?: string };
}

export interface PersonalityTrait {
    value: number;
    enabled: boolean;
}

export type LLMRole = 'CREATIVE' | 'LOGIC' | 'IMAGE' | 'DEFAULT';

export interface LLMProfile {
    id: string;
    name: string;
    provider: 'local' | 'gemini' | 'openai' | 'pollinations';
    baseUrl: string;
    apiKey?: string;
    model: string;
    roles: LLMRole[];
}

export interface DirectorStatus {
    paused: boolean;
    personality: {
        chaos: PersonalityTrait;
        aggression: PersonalityTrait;
        expansion: PersonalityTrait;
    };
    guardrails?: {
        budgets: Record<string, number>;
        features: {
            requireHumanApproval: boolean;
            autoSnapshotHighRisk: boolean;
            enableNPCs: boolean;
            enableItems: boolean;
            enableQuests: boolean;
            enableExpansions: boolean;
            restrictedToGlitchArea: boolean;
        };
        llmProfiles: Record<string, LLMProfile>;
    };
    proposals: Proposal[];
    glitchConfig: {
        mobCount: number;
        itemCount: number;
        legendaryChance: number;
    };
}

const BUDGET_TOOLTIPS: Record<string, string> = {
    maxWeaponDamage: "Maximum damage value any generated weapon can have.",
    maxArmorDefense: "Maximum defense value any generated armor can have.",
    maxGoldDrop: "Maximum amount of credits an NPC or container can drop.",
    maxItemValue: "Maximum market value for any generated item.",
    maxNPCHealth: "Maximum health points for any generated NPC.",
    maxNPCAttack: "Maximum base attack value for any generated NPC.",
    maxNPCDefense: "Maximum base defense value for any generated NPC.",
    maxQuestXPReward: "Maximum experience points awarded for completing a generated quest."
};

type AdminTab = 'director' | 'approvals' | 'snapshots' | 'llm' | 'logs' | 'world' | 'items' | 'npcs' | 'glitch';

export const AdminDashboard: React.FC = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [activeTab, setActiveTab] = useState<AdminTab>('director');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [paused, setPaused] = useState(true);

    // Personality State
    const [chaos, setChaos] = useState<PersonalityTrait>({ value: 0.2, enabled: true });
    const [aggression, setAggression] = useState<PersonalityTrait>({ value: 0.3, enabled: true });
    const [expansion, setExpansion] = useState<PersonalityTrait>({ value: 0.1, enabled: true });

    // Glitch Door State
    const [glitchConfig, setGlitchConfig] = useState({
        mobCount: 5,
        itemCount: 5,
        legendaryChance: 0.05
    });

    // Guardrails State
    const [requireApproval, setRequireApproval] = useState(true);
    const [autoSnapshot, setAutoSnapshot] = useState(true);
    const [enableNPCs, setEnableNPCs] = useState(true);
    const [enableItems, setEnableItems] = useState(true);
    const [enableQuests, setEnableQuests] = useState(true);
    const [enableExpansions, setEnableExpansions] = useState(true);
    const [restrictedToGlitchArea, setRestrictedToGlitchArea] = useState(false);
    const [budgets, setBudgets] = useState<Record<string, number>>({});
    const [llmProfiles, setLlmProfiles] = useState<Record<string, LLMProfile>>({});

    // Snapshot State
    const [snapshots, setSnapshots] = useState<string[]>([]);
    const [confirmAction, setConfirmAction] = useState<{ type: 'restore' | 'delete', id: string, step: number } | null>(null);
    const [generatedChunks, setGeneratedChunks] = useState<string[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [npcs, setNpcs] = useState<any[]>([]);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [editingNPC, setEditingNPC] = useState<any | null>(null);
    const [itemFilter, setItemFilter] = useState<string | null>(null);
    const [npcFilter, setNpcFilter] = useState<string | null>(null);
    const [mapDeleteMode, setMapDeleteMode] = useState(false);
    const [itemSearch, setItemSearch] = useState('');
    const [npcSearch, setNpcSearch] = useState('');

    useEffect(() => {
        const newSocket = io('http://localhost:3000/admin', {
            transports: ['websocket']
        });

        newSocket.on('connect', () => {
            console.log('Connected to Admin Stream');
            addLog('success', 'Connected to World Director');
            newSocket.emit('snapshot:list');
            newSocket.emit('director:get_chunks');
            newSocket.emit('director:get_items');
            newSocket.emit('director:get_npcs');
        });

        newSocket.on('director:log', (entry: LogEntry) => {
            addLog(entry.level, entry.message, entry.context, 'director');
        });

        newSocket.on('server:console_output', (entry: { timestamp: number, type: 'info' | 'warn' | 'error', message: string }) => {
            addLog(entry.type, entry.message, undefined, 'server');
        });

        newSocket.on('director:status', (status: DirectorStatus) => {
            setPaused(status.paused);
            if (status.personality) {
                setChaos(status.personality.chaos);
                setAggression(status.personality.aggression);
                setExpansion(status.personality.expansion);
            }
            if (status.guardrails) {
                setRequireApproval(status.guardrails.features.requireHumanApproval);
                setAutoSnapshot(status.guardrails.features.autoSnapshotHighRisk);
                setEnableNPCs(status.guardrails.features.enableNPCs);
                setEnableItems(status.guardrails.features.enableItems);
                setEnableQuests(status.guardrails.features.enableQuests);
                setEnableExpansions(status.guardrails.features.enableExpansions);
                setRestrictedToGlitchArea(status.guardrails.features.restrictedToGlitchArea);
                setBudgets(status.guardrails.budgets);
                if (status.guardrails.llmProfiles) {
                    setLlmProfiles(status.guardrails.llmProfiles);
                }
            }
            if (status.proposals) {
                setProposals(status.proposals);
            }
            if (status.glitchConfig) {
                setGlitchConfig(status.glitchConfig);
            }
        });

        newSocket.on('director:proposals_update', (list: Proposal[]) => {
            setProposals(list);
        });

        newSocket.on('snapshot:list_update', (list: string[]) => {
            setSnapshots(list);
        });

        newSocket.on('director:chunks_update', (list: string[]) => {
            setGeneratedChunks(list);
        });

        newSocket.on('director:items_update', (list: any[]) => {
            setItems(list);
        });

        newSocket.on('director:npcs_update', (list: any[]) => {
            setNpcs(list);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const addLog = (level: LogEntry['level'], message: string, context?: any, source?: 'director' | 'server') => {
        setLogs(prev => [{ timestamp: Date.now(), level, message, context, source }, ...prev].slice(0, 500));
    };

    const togglePause = () => {
        if (!socket) return;
        const newState = !paused;
        setPaused(newState);
        socket.emit(newState ? 'director:pause' : 'director:resume');
        addLog('warn', newState ? 'EMERGENCY STOP ACTIVATED' : 'Resuming Automation...');
    };

    const updatePersonality = (key: string, update: Partial<PersonalityTrait>) => {
        if (!socket) return;
        socket.emit('director:update_personality', { [key]: update });
    };

    const updateGuardrail = (update: any) => {
        if (!socket) return;
        socket.emit('director:update_guardrail', update);
    };

    const approveProposal = (id: string) => {
        socket?.emit('director:approve_proposal', id);
    };

    const rejectProposal = (id: string) => {
        socket?.emit('director:reject_proposal', id);
    };

    const triggerManualGen = (type: string) => {
        if (!socket) return;
        socket.emit('director:manual_trigger', { type });
        addLog('info', `Manual trigger sent: ${type}`);
    };

    const createSnapshot = () => {
        if (!socket) return;
        const name = prompt('Enter snapshot name (optional):');
        socket.emit('snapshot:create', name);
    };

    const handleSnapshotAction = (type: 'restore' | 'delete', id: string) => {
        if (confirmAction?.id === id && confirmAction?.type === type && confirmAction?.step === 2) {
            if (type === 'restore') socket?.emit('snapshot:restore', id);
            if (type === 'delete') socket?.emit('snapshot:delete', id);
            setConfirmAction(null);
        } else if (confirmAction?.id === id && confirmAction?.type === type && confirmAction?.step === 1) {
            setConfirmAction({ type, id, step: 2 });
        } else {
            setConfirmAction({ type, id, step: 1 });
        }
    };

    const editBudget = (key: string, current: number) => {
        const val = prompt(`Enter new value for ${key.replace('max', '')}:`, current.toString());
        if (val !== null) {
            const num = parseInt(val);
            if (!isNaN(num)) {
                updateGuardrail({ budgets: { [key]: num } });
            }
        }
    };

    const addLlmProfile = () => {
        const id = `profile_${Math.random().toString(36).substring(7)}`;
        const newProfile: LLMProfile = {
            id,
            name: 'New Profile',
            provider: 'local',
            baseUrl: 'http://localhost:1234/v1',
            model: 'llama-3-8b-instruct',
            roles: []
        };
        updateGuardrail({ llmProfiles: { ...llmProfiles, [id]: newProfile } });
    };

    const removeLlmProfile = (id: string) => {
        const newProfiles = { ...llmProfiles };
        delete newProfiles[id];
        updateGuardrail({ llmProfiles: newProfiles });
    };

    const updateLlmProfile = (id: string, field: string, value: any) => {
        const newProfiles = { ...llmProfiles };
        let updatedProfile = { ...newProfiles[id], [field]: value };

        // Auto-fill defaults when provider changes
        if (field === 'provider') {
            if (value === 'gemini') {
                updatedProfile.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
                updatedProfile.model = 'gemini-1.5-pro';
            } else if (value === 'openai') {
                updatedProfile.baseUrl = 'https://api.openai.com/v1';
                updatedProfile.model = 'gpt-4o';
            } else if (value === 'pollinations') {
                updatedProfile.baseUrl = 'https://gen.pollinations.ai';
                updatedProfile.model = 'flux';
                updatedProfile.name = 'Pollinations (Image)';
            } else if (value === 'local') {
                updatedProfile.baseUrl = 'http://localhost:1234/v1';
                updatedProfile.model = 'llama-3-8b-instruct';
            }
        }

        newProfiles[id] = updatedProfile;
        updateGuardrail({ llmProfiles: newProfiles });
    };

    const toggleRole = (profileId: string, role: LLMRole) => {
        const profile = llmProfiles[profileId];
        let newRoles = [...profile.roles];
        if (newRoles.includes(role)) {
            newRoles = newRoles.filter(r => r !== role);
        } else {
            newRoles.push(role);
        }
        updateLlmProfile(profileId, 'roles', newRoles);
    };

    const generateChunk = (x: number, y: number) => {
        if (!socket) return;
        if (mapDeleteMode) {
            if (generatedChunks.includes(`${x},${y}`)) {
                if (confirm(`Delete chunk ${x},${y}? This will reset it.`)) {
                    socket.emit('director:delete_chunk', { x, y });
                }
            }
            return;
        }
        if (generatedChunks.includes(`${x},${y}`)) return;
        socket.emit('director:generate_chunk', { x, y });
    };

    const deleteItem = (id: string) => {
        if (confirm(`Are you sure you want to delete item: ${id}?`)) {
            socket?.emit('director:delete_item', id);
        }
    };

    const updateItem = (id: string, updates: any) => {
        socket?.emit('director:update_item', { id, updates });
        setEditingItem(null);
    };

    const deleteNPC = (id: string) => {
        if (confirm(`Are you sure you want to delete NPC: ${id}?`)) {
            socket?.emit('director:delete_npc', id);
        }
    };

    const updateNPC = (id: string, updates: any) => {
        socket?.emit('director:update_npc', { id, updates });
        setEditingNPC(null);
    };

    const spawnRoamingNPC = (id: string) => {
        socket?.emit('director:spawn_roaming_npc', id);
        addLog('info', `Spawned roaming NPC: ${id}`);
    };

    const generatePortrait = (id: string) => {
        socket?.emit('director:generate_portrait', id);
        addLog('info', `Requested portrait generation for: ${id}`);
    };

    const updateGlitchConfig = (config: any) => {
        socket?.emit('director:update_glitch_config', config);
    };

    return (
        <div className="admin-container">
            {/* Confirmation Overlay */}
            {confirmAction && (
                <div className="confirm-overlay">
                    <div className="confirm-dialog">
                        <div className="confirm-title">
                            {confirmAction.step === 1 ? 'ARE YOU SURE?' : 'FINAL WARNING!'}
                        </div>
                        <div className="confirm-msg">
                            {confirmAction.type === 'restore'
                                ? `Restoring snapshot "${confirmAction.id}" will WIPE all current game state. This cannot be undone.`
                                : `Deleting snapshot "${confirmAction.id}" will permanently remove this backup.`
                            }
                            <br /><br />
                            {confirmAction.step === 2 && <strong>THIS IS THE LAST CHANCE TO CANCEL.</strong>}
                        </div>
                        <div className="confirm-btns">
                            <button className="confirm-btn confirm-btn-yes" onClick={() => handleSnapshotAction(confirmAction.type, confirmAction.id)}>
                                {confirmAction.step === 1 ? 'YES, PROCEED' : 'I AM ABSOLUTELY SURE'}
                            </button>
                            <button className="confirm-btn confirm-btn-no" onClick={() => setConfirmAction(null)}>CANCEL</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="admin-header">
                <div>
                    <h1 className="text-neon-blue">Zenith-9 World Director</h1>
                    <div className="status-indicator">
                        <div className={`dot ${socket?.connected ? 'dot-online' : 'dot-offline'}`} />
                        <span>{socket?.connected ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
                    </div>
                </div>
                <div style={{
                    flex: 1,
                    marginLeft: '2rem',
                    background: '#000',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    height: '60px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column-reverse'
                }}>
                    {logs.filter(l => l.source === 'server').slice(0, 2).map((log, i) => (
                        <div key={i} style={{
                            color: log.level === 'error' ? '#ff4444' : log.level === 'warn' ? '#ffcc00' : '#888',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            {log.message}
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="tab-container">
                <button className={`tab-btn ${activeTab === 'director' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('director')}>DIRECTOR</button>
                <button className={`tab-btn ${activeTab === 'approvals' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('approvals')}>
                    APPROVALS {proposals.length > 0 && <span style={{ color: '#ffcc00' }}>({proposals.length})</span>}
                </button>
                <button className={`tab-btn ${activeTab === 'world' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('world')}>WORLD MAP</button>
                <button className={`tab-btn ${activeTab === 'items' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('items')}>ITEMS</button>
                <button className={`tab-btn ${activeTab === 'npcs' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('npcs')}>NPCS</button>
                <button className={`tab-btn ${activeTab === 'glitch' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('glitch')}>GLITCH DOOR</button>
                <button className={`tab-btn ${activeTab === 'snapshots' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('snapshots')}>SNAPSHOTS</button>
                <button className={`tab-btn ${activeTab === 'llm' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('llm')}>LLM</button>
                <button className={`tab-btn ${activeTab === 'logs' ? 'tab-btn-active' : ''}`} onClick={() => setActiveTab('logs')}>LOGS</button>
            </div>

            {/* Tab Content */}
            {activeTab === 'director' && (
                <DirectorTab
                    paused={paused}
                    togglePause={togglePause}
                    chaos={chaos}
                    aggression={aggression}
                    expansion={expansion}
                    updatePersonality={updatePersonality}
                    triggerManualGen={triggerManualGen}
                    enableNPCs={enableNPCs}
                    enableItems={enableItems}
                    enableQuests={enableQuests}
                    enableExpansions={enableExpansions}
                    restrictedToGlitchArea={restrictedToGlitchArea}
                    updateGuardrail={updateGuardrail}
                    requireApproval={requireApproval}
                    autoSnapshot={autoSnapshot}
                    budgets={budgets}
                    editBudget={editBudget}
                    BUDGET_TOOLTIPS={BUDGET_TOOLTIPS}
                />
            )}

            {activeTab === 'approvals' && (
                <ApprovalsTab
                    proposals={proposals}
                    approveProposal={approveProposal}
                    rejectProposal={rejectProposal}
                />
            )}

            {activeTab === 'world' && (
                <WorldTab
                    mapDeleteMode={mapDeleteMode}
                    setMapDeleteMode={setMapDeleteMode}
                    generatedChunks={generatedChunks}
                    generateChunk={generateChunk}
                />
            )}

            {activeTab === 'items' && (
                <ItemsTab
                    items={items}
                    itemSearch={itemSearch}
                    setItemSearch={setItemSearch}
                    itemFilter={itemFilter}
                    setItemFilter={setItemFilter}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                    updateItem={updateItem}
                    deleteItem={deleteItem}
                />
            )}

            {activeTab === 'npcs' && (
                <NPCsTab
                    npcs={npcs}
                    npcSearch={npcSearch}
                    setNpcSearch={setNpcSearch}
                    npcFilter={npcFilter}
                    setNpcFilter={setNpcFilter}
                    editingNPC={editingNPC}
                    setEditingNPC={setEditingNPC}
                    updateNPC={updateNPC}
                    deleteNPC={deleteNPC}
                    spawnRoamingNPC={spawnRoamingNPC}
                    generatePortrait={generatePortrait}
                />
            )}

            {activeTab === 'glitch' && (
                <GlitchTab
                    glitchConfig={glitchConfig}
                    setGlitchConfig={setGlitchConfig}
                    updateGlitchConfig={updateGlitchConfig}
                />
            )}

            {activeTab === 'snapshots' && (
                <SnapshotsTab
                    snapshots={snapshots}
                    createSnapshot={createSnapshot}
                    handleSnapshotAction={handleSnapshotAction}
                    confirmAction={confirmAction}
                />
            )}

            {activeTab === 'llm' && (
                <LLMTab
                    llmProfiles={llmProfiles}
                    addLlmProfile={addLlmProfile}
                    updateLlmProfile={updateLlmProfile}
                    toggleRole={toggleRole}
                    removeLlmProfile={removeLlmProfile}
                />
            )}

            {activeTab === 'logs' && (
                <LogsTab logs={logs} />
            )}
        </div>
    );
};
