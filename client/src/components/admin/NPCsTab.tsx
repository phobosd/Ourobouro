import React from 'react';

interface NPCsTabProps {
    npcs: any[];
    npcSearch: string;
    setNpcSearch: (search: string) => void;
    npcFilter: string | null;
    setNpcFilter: (filter: string | null) => void;
    editingNPC: any | null;
    setEditingNPC: (npc: any | null) => void;
    updateNPC: (id: string, updates: any) => void;
    deleteNPC: (id: string) => void;
    spawnRoamingNPC: (id: string) => void;
    generatePortrait: (id: string) => void;
}

export const NPCsTab: React.FC<NPCsTabProps> = ({
    npcs, npcSearch, setNpcSearch, npcFilter, setNpcFilter,
    editingNPC, setEditingNPC, updateNPC, deleteNPC, spawnRoamingNPC, generatePortrait
}) => {
    return (
        <div className="admin-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>NPC Registry ({npcs.length})</h2>
                    <input
                        type="text"
                        placeholder="Search NPCs..."
                        value={npcSearch}
                        onChange={(e) => setNpcSearch(e.target.value)}
                        style={{
                            background: '#222',
                            border: '1px solid #444',
                            color: '#fff',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            width: '300px'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['vendor', 'guard', 'civilian', 'mob', 'boss'].map(type => (
                        <button
                            key={type}
                            onClick={() => setNpcFilter(npcFilter === type ? null : type)}
                            style={{
                                padding: '0.3rem 0.8rem',
                                background: npcFilter === type ? '#00ffff' : '#222',
                                color: npcFilter === type ? '#000' : '#888',
                                border: '1px solid #444',
                                borderRadius: '15px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #333', borderRadius: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#111', zIndex: 1 }}>
                        <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem', color: '#888' }}>ID</th>
                            <th style={{ padding: '0.5rem', color: '#888' }}>Name</th>
                            <th style={{ padding: '0.5rem', color: '#888' }}>Role</th>
                            <th style={{ padding: '0.5rem', color: '#888' }}>Faction</th>
                            <th style={{ padding: '0.5rem', color: '#888', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {npcs
                            .filter(npc => {
                                const matchesSearch = npc.name.toLowerCase().includes(npcSearch.toLowerCase()) || npc.id.toLowerCase().includes(npcSearch.toLowerCase());
                                const matchesFilter = npcFilter ? (npc.role || '').toLowerCase() === npcFilter.toLowerCase() : true;
                                return matchesSearch && matchesFilter;
                            })
                            .map(npc => (
                                <tr key={npc.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: '#666' }}>{npc.id}</td>
                                    <td style={{ padding: '0.5rem', color: '#fff' }}>{npc.name}</td>
                                    <td style={{ padding: '0.5rem', color: '#00ffff' }}>{npc.role}</td>
                                    <td style={{ padding: '0.5rem', color: '#ffd700' }}>{npc.faction || '-'}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => spawnRoamingNPC(npc.id)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #00ff00',
                                                color: '#00ff00',
                                                padding: '0.2rem 0.5rem',
                                                marginRight: '0.5rem',
                                                cursor: 'pointer',
                                                borderRadius: '3px'
                                            }}
                                            title="Spawn Roaming NPC"
                                        >
                                            ROAM
                                        </button>
                                        <button
                                            onClick={() => setEditingNPC(npc)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #444',
                                                color: '#fff',
                                                padding: '0.2rem 0.5rem',
                                                marginRight: '0.5rem',
                                                cursor: 'pointer',
                                                borderRadius: '3px'
                                            }}
                                        >
                                            EDIT
                                        </button>
                                        <button
                                            onClick={() => deleteNPC(npc.id)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #ff4444',
                                                color: '#ff4444',
                                                padding: '0.2rem 0.5rem',
                                                cursor: 'pointer',
                                                borderRadius: '3px'
                                            }}
                                        >
                                            DEL
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {editingNPC && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: '#111',
                        border: '1px solid #444',
                        borderRadius: '8px',
                        width: '600px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '2rem',
                        position: 'relative',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                        <button
                            onClick={() => setEditingNPC(null)}
                            style={{
                                position: 'absolute',
                                top: '1rem',
                                right: '1rem',
                                background: 'transparent',
                                border: 'none',
                                color: '#888',
                                fontSize: '1.5rem',
                                cursor: 'pointer'
                            }}
                        >
                            ×
                        </button>

                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                            Editing: {editingNPC.name}
                        </h3>

                        <div style={{ display: 'flex', gap: '2rem' }}>
                            {/* Left Column: Form Fields */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Name</label>
                                    <input
                                        type="text"
                                        value={editingNPC.name}
                                        onChange={(e) => setEditingNPC({ ...editingNPC, name: e.target.value })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Description</label>
                                    <textarea
                                        value={editingNPC.description}
                                        onChange={(e) => setEditingNPC({ ...editingNPC, description: e.target.value })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem', minHeight: '80px' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Role</label>
                                        <select
                                            value={editingNPC.role || 'civilian'}
                                            onChange={(e) => setEditingNPC({ ...editingNPC, role: e.target.value })}
                                            style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                        >
                                            <option value="vendor">Vendor</option>
                                            <option value="guard">Guard</option>
                                            <option value="civilian">Civilian</option>
                                            <option value="mob">Mob</option>
                                            <option value="boss">Boss</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Faction</label>
                                        <input
                                            type="text"
                                            value={editingNPC.faction || ''}
                                            onChange={(e) => setEditingNPC({ ...editingNPC, faction: e.target.value })}
                                            style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Portrait */}
                            <div style={{ width: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <label style={{ color: '#888', fontSize: '0.8rem' }}>Portrait</label>
                                <div style={{
                                    width: '200px',
                                    height: '200px',
                                    border: '1px solid #444',
                                    background: '#000',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    overflow: 'hidden'
                                }}>
                                    {editingNPC.portrait ? (
                                        <img
                                            src={editingNPC.portrait}
                                            alt={editingNPC.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span style={{ color: '#444' }}>No Portrait</span>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Portrait URL"
                                    value={editingNPC.portrait || ''}
                                    onChange={(e) => setEditingNPC({ ...editingNPC, portrait: e.target.value })}
                                    style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem', fontSize: '0.8rem' }}
                                />
                                {!editingNPC.portrait && (
                                    <button
                                        onClick={() => generatePortrait(editingNPC.id)}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            background: '#00ffff',
                                            color: '#000',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            marginTop: '0.5rem'
                                        }}
                                    >
                                        GENERATE PORTRAIT
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn-reject"
                                onClick={() => setEditingNPC(null)}
                                style={{ padding: '0.5rem 1.5rem' }}
                            >
                                CANCEL
                            </button>
                            <button
                                className="btn-approve"
                                onClick={() => updateNPC(editingNPC.id, editingNPC)}
                                style={{ padding: '0.5rem 1.5rem' }}
                            >
                                SAVE CHANGES
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
