import React from 'react';
import { Slider } from '../Slider';
import { ToggleRow } from '../ToggleRow';
import type { PersonalityTrait } from '../AdminDashboard';

interface DirectorTabProps {
    paused: boolean;
    togglePause: () => void;
    chaos: PersonalityTrait;
    aggression: PersonalityTrait;
    expansion: PersonalityTrait;
    updatePersonality: (key: string, update: Partial<PersonalityTrait>) => void;
    triggerManualGen: (type: string) => void;
    enableNPCs: boolean;
    enableItems: boolean;
    enableQuests: boolean;
    enableExpansions: boolean;
    restrictedToGlitchArea: boolean;
    updateGuardrail: (update: any) => void;
    requireApproval: boolean;
    autoSnapshot: boolean;
    budgets: Record<string, number>;
    editBudget: (key: string, current: number) => void;
    BUDGET_TOOLTIPS: Record<string, string>;
    innerThoughts: { timestamp: number, thought: string }[];
}

export const DirectorTab: React.FC<DirectorTabProps> = ({
    paused, togglePause, chaos, aggression, expansion, updatePersonality,
    triggerManualGen, enableNPCs, enableItems, enableQuests, enableExpansions,
    restrictedToGlitchArea, updateGuardrail, requireApproval, autoSnapshot,
    budgets, editBudget, BUDGET_TOOLTIPS, innerThoughts
}) => {
    return (
        <div className="admin-grid">
            {/* Master Control */}
            <div className="admin-card master-control-card">
                <h2 style={{ marginBottom: '1rem' }}>Master Control</h2>
                <button
                    onClick={togglePause}
                    className={`stop-go-btn ${paused ? 'btn-resume' : 'btn-stop'}`}
                >
                    {paused ? 'RESUME' : 'STOP'}
                </button>
                <p style={{ fontSize: '0.8rem', color: '#666' }}>
                    {paused ? 'System Halted. Safe to edit.' : 'System Active. Monitoring...'}
                </p>
            </div>

            {/* Personality Sliders */}
            <div className="admin-card">
                <h2 style={{ marginBottom: '1.5rem' }}>Director Personality</h2>
                <div className="slider-group">
                    <Slider
                        label="Chaos"
                        value={chaos.value}
                        enabled={chaos.enabled}
                        onToggle={(e: boolean) => updatePersonality('chaos', { enabled: e })}
                        onChange={(v: number) => updatePersonality('chaos', { value: v })}
                        color="text-neon-purple"
                        tooltip="Controls randomness. High Chaos triggers frequent anomalies, bizarre NPC behavior, and unexpected world shifts."
                    />
                    <Slider
                        label="Aggression"
                        value={aggression.value}
                        enabled={aggression.enabled}
                        onToggle={(e: boolean) => updatePersonality('aggression', { enabled: e })}
                        onChange={(v: number) => updatePersonality('aggression', { value: v })}
                        color="text-neon-green"
                        tooltip="Controls combat difficulty. High Aggression spawns elite mobs, triggers frequent invasions, and increases boss lethality."
                    />
                    <Slider
                        label="Expansion"
                        value={expansion.value}
                        enabled={expansion.enabled}
                        onToggle={(e: boolean) => updatePersonality('expansion', { enabled: e })}
                        onChange={(v: number) => updatePersonality('expansion', { value: v })}
                        color="text-neon-blue"
                        tooltip="Controls growth speed. High Expansion rapidly constructs new streets, buildings, and dungeons based on player activity."
                    />
                </div>
            </div>

            {/* Manual Actions */}
            <div className="admin-card">
                <div className="slider-row">
                    <h2 style={{ marginBottom: '1rem' }}>Manual Actions</h2>
                    <div className="tooltip-icon" style={{ marginLeft: '0.5rem' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                        </svg>
                        <div className="tooltip-popup">Force the Director to generate specific content immediately. These bypass the normal autonomous cycle.</div>
                    </div>
                </div>
                <div className="action-btn-group">
                    <button className="action-btn" onClick={() => triggerManualGen('NPC')}>Generate NPC</button>
                    <button className="action-btn" onClick={() => triggerManualGen('MOB')}>Generate Mob</button>
                    <button className="action-btn" onClick={() => triggerManualGen('BOSS')}>Create BOSS</button>
                    <button className="action-btn" onClick={() => triggerManualGen('EVENT')}>World Event</button>
                    <button className="action-btn" onClick={() => triggerManualGen('ITEM')}>Generate Item</button>
                    <button className="action-btn" onClick={() => triggerManualGen('QUEST')}>Generate Quest</button>
                    <button className="action-btn" onClick={() => triggerManualGen('WORLD_EXPANSION')}>Generate Room</button>
                </div>
            </div>

            {/* Autonomous Toggles */}
            <div className="admin-card">
                <h2 style={{ marginBottom: '1rem' }}>Autonomous Toggles</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <ToggleRow label="NPCs" checked={enableNPCs} onChange={(e: boolean) => updateGuardrail({ enableNPCs: e })} tooltip="Enable/Disable autonomous NPC generation." />
                    <ToggleRow label="Items" checked={enableItems} onChange={(e: boolean) => updateGuardrail({ enableItems: e })} tooltip="Enable/Disable autonomous Item generation." />
                    <ToggleRow label="Quests" checked={enableQuests} onChange={(e: boolean) => updateGuardrail({ enableQuests: e })} tooltip="Enable/Disable autonomous Quest generation." />
                    <ToggleRow label="Expansions" checked={enableExpansions} onChange={(e: boolean) => updateGuardrail({ enableExpansions: e })} tooltip="Enable/Disable autonomous World Expansion." />
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <ToggleRow label="Restrict to Glitch Area" checked={restrictedToGlitchArea} onChange={(e: boolean) => updateGuardrail({ restrictedToGlitchArea: e })} tooltip="If enabled, the Director will only generate content within the designated Glitch Door regions." />
                </div>
            </div>

            {/* Safety Features (Guardrails) */}
            <div className="admin-card">
                <h2 style={{ marginBottom: '1.5rem' }}>Safety Features</h2>
                <ToggleRow label="Require Approval" checked={requireApproval} onChange={(e: boolean) => updateGuardrail({ requireHumanApproval: e })} tooltip="If enabled, the Director will wait for your manual approval before publishing any generated content." />
                <ToggleRow label="Auto-Snapshot" checked={autoSnapshot} onChange={(e: boolean) => updateGuardrail({ autoSnapshotHighRisk: e })} tooltip="If enabled, the system will automatically create a snapshot before performing high-risk operations like world expansion." />
            </div>

            <div className="admin-card">
                <h2 style={{ marginBottom: '1.5rem' }}>Global Budgets (Click to Edit)</h2>
                <div className="budget-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                    {Object.entries(budgets).map(([key, val]) => (
                        <div key={key} className="budget-item" style={{ position: 'relative', cursor: 'pointer', padding: '0.75rem', background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }} onClick={() => editBudget(key, val)}>
                            <div className="slider-row" style={{ justifyContent: 'space-between', width: '100%' }}>
                                <span className="budget-label" style={{
                                    fontSize: '0.75rem',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '140px'
                                }}>{key.replace('max', '')}</span>
                                <div className="tooltip-icon" style={{ marginLeft: '0.2rem', flexShrink: 0 }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                                        <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                                    </svg>
                                    <div className="tooltip-popup">{BUDGET_TOOLTIPS[key] || "Maximum limit for this parameter."}</div>
                                </div>
                            </div>
                            <span className="budget-value" style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>{val}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Inner Thoughts */}
            <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
                <h2 style={{ marginBottom: '1rem', color: '#00ffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>🧠</span> Director's Inner Thoughts
                </h2>
                <div style={{
                    background: '#000',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    height: '250px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    {innerThoughts.length === 0 ? (
                        <div style={{ color: '#444', fontStyle: 'italic' }}>Waiting for the Director to process next tick...</div>
                    ) : (
                        innerThoughts.map((t, i) => (
                            <div key={i} style={{
                                borderLeft: '2px solid #00ffff',
                                paddingLeft: '0.75rem',
                                color: i === 0 ? '#fff' : '#888',
                                opacity: Math.max(0.3, 1 - (i * 0.05))
                            }}>
                                <span style={{ color: '#008888', marginRight: '0.5rem' }}>[{new Date(t.timestamp).toLocaleTimeString()}]</span>
                                {t.thought}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
