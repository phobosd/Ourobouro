import React, { useState, useEffect } from 'react';

interface User {
    id: number;
    username: string;
    role: string;
}

interface Character {
    id: number;
    user_id: number;
    name: string;
    archetype: string;
    data: string;
    last_seen: string;
    online?: boolean;
}

interface UsersTabProps {
    socket: any;
    items: any[];
}

export const UsersTab: React.FC<UsersTabProps> = ({ socket, items }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [changingPasswordFor, setChangingPasswordFor] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [viewingCharactersFor, setViewingCharactersFor] = useState<number | null>(null);
    const [editingCharacterStats, setEditingCharacterStats] = useState<{ id: number, name: string, stats: any, skills: any, reputation: any } | null>(null);
    const [editingInventory, setEditingInventory] = useState<{ charId: number, name: string, inventory: any } | null>(null);

    useEffect(() => {
        if (!socket) return;

        socket.emit('director:get_users');
        socket.emit('director:get_characters');

        const handleUsersUpdate = (updatedUsers: User[]) => {
            setUsers(updatedUsers);
        };

        const handleCharactersUpdate = (updatedChars: Character[]) => {
            setCharacters(updatedChars);
        };

        const handleInventoryData = (data: { charId: number, inventory: any, error?: string }) => {
            if (data.error) {
                alert(`Error fetching inventory: ${data.error}`);
                return;
            }
            // Find char name
            const char = characters.find(c => c.id === data.charId);
            setEditingInventory({
                charId: data.charId,
                name: char?.name || 'Unknown',
                inventory: data.inventory
            });
        };

        socket.on('director:users_update', handleUsersUpdate);
        socket.on('director:characters_update', handleCharactersUpdate);
        socket.on('director:character_inventory', handleInventoryData);

        return () => {
            socket.off('director:users_update', handleUsersUpdate);
            socket.off('director:characters_update', handleCharactersUpdate);
            socket.off('director:character_inventory', handleInventoryData);
        };
    }, [socket, characters]);

    const handleSaveRole = () => {
        if (editingUser) {
            socket.emit('director:update_user_role', { userId: editingUser.id, role: editingUser.role });
            setEditingUser(null);
        }
    };

    const handleDelete = (id: number) => {
        if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            socket.emit('director:delete_user', id);
        }
    };

    const handleChangePassword = () => {
        if (changingPasswordFor && newPassword.trim()) {
            socket.emit('director:update_user_password', {
                userId: changingPasswordFor.id,
                password: newPassword
            });
            setChangingPasswordFor(null);
            setNewPassword('');
        }
    };

    const handleViewCharacters = (userId: number) => {
        setViewingCharactersFor(userId);
    };

    const handleEditStats = (char: Character) => {
        try {
            const data = JSON.parse(char.data);
            let currentStats = { STR: 10, CON: 10, AGI: 10, CHA: 10 };
            let currentSkills: Record<string, number> = {};
            let currentRep = { 'Corporation': 0, 'Street': 0, 'Police': 0 };

            if (data.components) {
                if (data.components.Stats) {
                    // Attributes
                    if (data.components.Stats.attributes) {
                        const attrs = data.components.Stats.attributes;
                        if (attrs.__type === 'Map' && Array.isArray(attrs.data)) {
                            attrs.data.forEach(([key, val]: [string, any]) => {
                                if (key in currentStats) {
                                    (currentStats as any)[key] = val.value;
                                }
                            });
                        }
                    }
                    // Skills
                    if (data.components.Stats.skills) {
                        const skills = data.components.Stats.skills;
                        if (skills.__type === 'Map' && Array.isArray(skills.data)) {
                            skills.data.forEach(([key, val]: [string, any]) => {
                                currentSkills[key] = val.level;
                            });
                        }
                    }
                }
                if (data.components.Reputation && data.components.Reputation.factions) {
                    const factions = data.components.Reputation.factions;
                    if (factions.__type === 'Map' && Array.isArray(factions.data)) {
                        factions.data.forEach(([key, val]: [string, any]) => {
                            (currentRep as any)[key] = val;
                        });
                    }
                }
            }

            setEditingCharacterStats({ id: char.id, name: char.name, stats: currentStats, skills: currentSkills, reputation: currentRep });
        } catch (e) {
            console.error("Failed to parse character data", e);
            alert("Error parsing character data");
        }
    };

    const handleEditItems = (char: Character) => {
        socket.emit('director:get_character_inventory', char.id);
    };

    const handleSaveStats = () => {
        if (editingCharacterStats) {
            socket.emit('director:update_character_stats', {
                charId: editingCharacterStats.id,
                stats: editingCharacterStats.stats,
                skills: editingCharacterStats.skills,
                reputation: editingCharacterStats.reputation
            });
            setEditingCharacterStats(null);
        }
    };

    const handleSaveInventory = () => {
        if (editingInventory) {
            socket.emit('director:update_character_inventory', {
                charId: editingInventory.charId,
                inventory: editingInventory.inventory
            });
            setEditingInventory(null);
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const userCharacters = viewingCharactersFor
        ? characters.filter(c => c.user_id === viewingCharactersFor)
        : [];

    const itemOptions = items.map(i => ({ id: i.id, name: i.name, slot: i.slot }));

    const renderItemSelect = (value: string | null, onChange: (val: string | null) => void, filterSlot?: string) => {
        const filteredOptions = filterSlot
            ? itemOptions.filter(opt => opt.slot === filterSlot)
            : itemOptions;

        return (
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value || null)}
                style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
            >
                <option value="">(Empty)</option>
                {filteredOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name} ({opt.id})</option>
                ))}
            </select>
        );
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        flex: 1,
                        background: '#111',
                        border: '1px solid #333',
                        color: '#fff',
                        padding: '0.5rem',
                        fontFamily: 'monospace'
                    }}
                />
                <button
                    onClick={() => {
                        socket.emit('director:get_users');
                        socket.emit('director:get_characters');
                    }}
                    className="admin-button"
                >
                    REFRESH
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #333', background: '#111' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ background: '#222', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>ID</th>
                            <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Username</th>
                            <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Role</th>
                            <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id} style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '0.5rem' }}>{user.id}</td>
                                <td style={{ padding: '0.5rem', color: '#fff' }}>{user.username}</td>
                                <td style={{ padding: '0.5rem' }}>
                                    <span style={{
                                        color: user.role === 'god' ? '#ff00ff' : user.role === 'admin' ? '#00ffff' : '#888',
                                        fontWeight: 'bold'
                                    }}>
                                        {user.role.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => {
                                                const userChars = characters.filter(c => c.user_id === user.id);
                                                if (userChars.length === 1) {
                                                    // For single char, show a mini-menu or just open stats?
                                                    // User requested "EDIT ITEMS" button.
                                                    // Let's just open the character list to keep it simple and allow access to both buttons.
                                                    // Or we can add a second smart button.
                                                    handleViewCharacters(user.id);
                                                } else {
                                                    handleViewCharacters(user.id);
                                                }
                                            }}
                                            style={{
                                                background: '#333', border: 'none', color: '#fff',
                                                padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                            }}
                                        >
                                            MANAGE
                                        </button>
                                        <button
                                            onClick={() => setEditingUser(user)}
                                            style={{
                                                background: '#333', border: 'none', color: '#fff',
                                                padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                            }}
                                        >
                                            EDIT ROLE
                                        </button>
                                        <button
                                            onClick={() => {
                                                setChangingPasswordFor(user);
                                                setNewPassword('');
                                            }}
                                            style={{
                                                background: '#333', border: 'none', color: '#fff',
                                                padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                            }}
                                        >
                                            CHANGE PASSWORD
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            style={{
                                                background: '#500', border: 'none', color: '#fff',
                                                padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                            }}
                                        >
                                            DEL
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Role Modal */}
            {editingUser && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '2rem', width: '400px',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#00ffff' }}>Edit User Role</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>Username</label>
                            <div style={{ color: '#fff', fontWeight: 'bold' }}>{editingUser.username}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>Role</label>
                            <select
                                value={editingUser.role}
                                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                                style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="god">God</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                onClick={() => setEditingUser(null)}
                                style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveRole}
                                style={{ background: '#00ffff', border: 'none', color: '#000', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {changingPasswordFor && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '2rem', width: '400px',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#00ffff' }}>Change Password</h3>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>Username</label>
                            <div style={{ color: '#fff', fontWeight: 'bold' }}>{changingPasswordFor.username}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password..."
                                style={{
                                    width: '100%',
                                    background: '#222',
                                    border: '1px solid #444',
                                    color: '#fff',
                                    padding: '0.5rem',
                                    boxSizing: 'border-box'
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newPassword.trim()) {
                                        handleChangePassword();
                                    }
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                onClick={() => {
                                    setChangingPasswordFor(null);
                                    setNewPassword('');
                                }}
                                style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleChangePassword}
                                disabled={!newPassword.trim()}
                                style={{
                                    background: newPassword.trim() ? '#00ffff' : '#333',
                                    border: 'none',
                                    color: newPassword.trim() ? '#000' : '#666',
                                    padding: '0.5rem 1rem',
                                    cursor: newPassword.trim() ? 'pointer' : 'not-allowed',
                                    fontWeight: 'bold'
                                }}
                            >
                                Change Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Characters Modal */}
            {viewingCharactersFor && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '2rem', width: '900px',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)', maxHeight: '80vh', overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#00ffff' }}>User Characters</h3>
                        {userCharacters.length === 0 ? (
                            <div style={{ color: '#888', fontStyle: 'italic' }}>No characters found for this user.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: '#222', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem' }}>ID</th>
                                        <th style={{ padding: '0.5rem' }}>Name</th>
                                        <th style={{ padding: '0.5rem' }}>Archetype</th>
                                        <th style={{ padding: '0.5rem' }}>Status</th>
                                        <th style={{ padding: '0.5rem' }}>Last Seen</th>
                                        <th style={{ padding: '0.5rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userCharacters.map(char => (
                                        <tr key={char.id} style={{ borderBottom: '1px solid #333' }}>
                                            <td style={{ padding: '0.5rem' }}>{char.id}</td>
                                            <td style={{ padding: '0.5rem', color: '#fff', fontWeight: 'bold' }}>{char.name}</td>
                                            <td style={{ padding: '0.5rem' }}>{char.archetype}</td>
                                            <td style={{ padding: '0.5rem' }}>
                                                {char.online ? (
                                                    <span style={{ color: '#0f0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <span style={{ fontSize: '1.2rem', lineHeight: 0 }}>●</span> ONLINE
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#666' }}>OFFLINE</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.5rem' }}>{new Date(char.last_seen).toLocaleDateString()}</td>
                                            <td style={{ padding: '0.5rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => handleEditStats(char)}
                                                        style={{
                                                            background: '#333', border: 'none', color: '#fff',
                                                            padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        EDIT STATS
                                                    </button>
                                                    <button
                                                        onClick={() => handleEditItems(char)}
                                                        style={{
                                                            background: '#333', border: 'none', color: '#fff',
                                                            padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        EDIT ITEMS
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button
                                onClick={() => setViewingCharactersFor(null)}
                                style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', cursor: 'pointer' }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Stats Modal */}
            {editingCharacterStats && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1100
                }}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '2rem', width: '500px',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#00ffff' }}>Edit Stats: {editingCharacterStats.name}</h3>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Attributes</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            {Object.entries(editingCharacterStats.stats).map(([key, value]) => (
                                <div key={key}>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>{key}</label>
                                    <input
                                        type="number"
                                        value={value as number}
                                        onChange={(e) => setEditingCharacterStats({
                                            ...editingCharacterStats,
                                            stats: { ...editingCharacterStats.stats, [key]: parseInt(e.target.value) }
                                        })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                            ))}
                        </div>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Skills</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            {Object.entries(editingCharacterStats.skills).map(([key, value]) => (
                                <div key={key}>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>{key}</label>
                                    <input
                                        type="number"
                                        value={value as number}
                                        onChange={(e) => setEditingCharacterStats({
                                            ...editingCharacterStats,
                                            skills: { ...editingCharacterStats.skills, [key]: parseInt(e.target.value) }
                                        })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                            ))}
                        </div>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Reputation</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            {Object.entries(editingCharacterStats.reputation).map(([key, value]) => (
                                <div key={key}>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>{key}</label>
                                    <input
                                        type="number"
                                        value={value as number}
                                        onChange={(e) => setEditingCharacterStats({
                                            ...editingCharacterStats,
                                            reputation: { ...editingCharacterStats.reputation, [key]: parseInt(e.target.value) }
                                        })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setEditingCharacterStats(null)}
                                style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveStats}
                                style={{ background: '#00ffff', border: 'none', color: '#000', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Inventory Modal */}
            {editingInventory && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1100
                }}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '2rem', width: '600px',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#00ffff' }}>Edit Inventory: {editingInventory.name}</h3>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Hands</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>Right Hand</label>
                                {renderItemSelect(editingInventory.inventory.rightHand, (val) => setEditingInventory({
                                    ...editingInventory,
                                    inventory: { ...editingInventory.inventory, rightHand: val }
                                }))}
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>Left Hand</label>
                                {renderItemSelect(editingInventory.inventory.leftHand, (val) => setEditingInventory({
                                    ...editingInventory,
                                    inventory: { ...editingInventory.inventory, leftHand: val }
                                }))}
                            </div>
                        </div>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Equipment</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            {['head', 'torso', 'waist', 'legs', 'feet', 'neural', 'back'].map(slot => (
                                <div key={slot}>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.5rem' }}>{slot.charAt(0).toUpperCase() + slot.slice(1)}</label>
                                    {renderItemSelect(editingInventory.inventory.equipment[slot] || null, (val) => {
                                        const newEq = { ...editingInventory.inventory.equipment };
                                        if (val) newEq[slot] = val;
                                        else delete newEq[slot];
                                        setEditingInventory({
                                            ...editingInventory,
                                            inventory: { ...editingInventory.inventory, equipment: newEq }
                                        });
                                    }, slot)}
                                </div>
                            ))}
                        </div>

                        <h4 style={{ color: '#888', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Backpack</h4>
                        <div style={{ marginBottom: '1rem' }}>
                            {editingInventory.inventory.backpack.map((itemId: string, index: number) => (
                                <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <div style={{ flex: 1 }}>
                                        {renderItemSelect(itemId, (val) => {
                                            const newBackpack = [...editingInventory.inventory.backpack];
                                            if (val) newBackpack[index] = val;
                                            else newBackpack.splice(index, 1); // Remove if cleared
                                            setEditingInventory({
                                                ...editingInventory,
                                                inventory: { ...editingInventory.inventory, backpack: newBackpack }
                                            });
                                        })}
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newBackpack = [...editingInventory.inventory.backpack];
                                            newBackpack.splice(index, 1);
                                            setEditingInventory({
                                                ...editingInventory,
                                                inventory: { ...editingInventory.inventory, backpack: newBackpack }
                                            });
                                        }}
                                        style={{ background: '#500', border: 'none', color: '#fff', padding: '0 0.5rem', cursor: 'pointer' }}
                                    >
                                        X
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => {
                                    setEditingInventory({
                                        ...editingInventory,
                                        inventory: { ...editingInventory.inventory, backpack: [...editingInventory.inventory.backpack, ''] }
                                    });
                                }}
                                style={{
                                    background: '#333', border: '1px dashed #666', color: '#888',
                                    width: '100%', padding: '0.5rem', cursor: 'pointer', marginTop: '0.5rem'
                                }}
                            >
                                + Add Item
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setEditingInventory(null)}
                                style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '0.5rem 1rem', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveInventory}
                                style={{ background: '#00ffff', border: 'none', color: '#000', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
