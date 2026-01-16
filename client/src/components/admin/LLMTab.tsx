import React from 'react';
import type { LLMProfile, LLMRole } from '../AdminDashboard';

interface LLMTabProps {
    llmProfiles: Record<string, LLMProfile>;
    addLlmProfile: () => void;
    updateLlmProfile: (id: string, field: string, value: any) => void;
    toggleRole: (profileId: string, role: LLMRole) => void;
    removeLlmProfile: (id: string) => void;
}

export const LLMTab: React.FC<LLMTabProps> = ({ llmProfiles, addLlmProfile, updateLlmProfile, toggleRole, removeLlmProfile }) => {
    return (
        <div className="admin-card" style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>LLM Configuration</h2>
                <button className="action-btn" onClick={addLlmProfile}>ADD PROFILE</button>
            </div>

            <div className="llm-profiles-list">
                {Object.values(llmProfiles).map(profile => (
                    <div key={profile.id} className="llm-profile-card">
                        <div className="profile-header">
                            <input
                                type="text"
                                value={profile.name}
                                onChange={(e) => updateLlmProfile(profile.id, 'name', e.target.value)}
                                className="profile-name-input"
                                placeholder="Profile Name"
                            />
                            <button className="btn-delete-icon" title="Remove Profile" onClick={() => removeLlmProfile(profile.id)}>×</button>
                        </div>

                        <div className="profile-body">
                            <div className="setting-row">
                                <label>Provider</label>
                                <select
                                    value={profile.provider}
                                    onChange={(e) => updateLlmProfile(profile.id, 'provider', e.target.value)}
                                >
                                    <option value="local">Local (LM Studio/Ollama)</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="pollinations">Pollinations.ai</option>
                                </select>
                            </div>

                            <div className="setting-row">
                                <label>Model ID</label>
                                <input
                                    type="text"
                                    value={profile.model}
                                    onChange={(e) => updateLlmProfile(profile.id, 'model', e.target.value)}
                                    placeholder="e.g. gemma-2b"
                                />
                            </div>

                            <div className="setting-row setting-row-full">
                                <label>Base URL</label>
                                <input
                                    type="text"
                                    value={profile.baseUrl}
                                    onChange={(e) => updateLlmProfile(profile.id, 'baseUrl', e.target.value)}
                                    placeholder="http://localhost:1234/v1"
                                />
                            </div>

                            <div className="setting-row setting-row-full">
                                <label>API Key</label>
                                <input
                                    type="password"
                                    value={profile.apiKey || ''}
                                    onChange={(e) => updateLlmProfile(profile.id, 'apiKey', e.target.value)}
                                    placeholder="Optional for local"
                                />
                            </div>

                            <div className="roles-section">
                                <label>Assigned Roles</label>
                                <div className="roles-tags">
                                    {(['CREATIVE', 'LOGIC', 'IMAGE', 'DEFAULT'] as LLMRole[]).map(role => (
                                        <span
                                            key={role}
                                            className={`role-tag ${profile.roles.includes(role) ? 'role-active' : ''}`}
                                            onClick={() => toggleRole(profile.id, role)}
                                        >
                                            {role}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {profile.provider === 'pollinations' && (
                                <div className="setting-row setting-row-full" style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '10px' }}>
                                    <label>Usage & Balance</label>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button
                                            className="action-btn small"
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(`http://localhost:3000/api/llm/balance/${profile.id}`);
                                                    const data = await res.json();
                                                    alert(JSON.stringify(data, null, 2));
                                                } catch (e) {
                                                    alert('Failed to check balance');
                                                }
                                            }}
                                        >
                                            Check Balance
                                        </button>
                                        <span style={{ fontSize: '0.8em', color: '#888' }}>
                                            (Requires valid API Key)
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
