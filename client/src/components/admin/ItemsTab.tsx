import React from 'react';

interface ItemsTabProps {
    items: any[];
    itemSearch: string;
    setItemSearch: (search: string) => void;
    itemFilter: string | null;
    setItemFilter: (filter: string | null) => void;
    editingItem: any | null;
    setEditingItem: (item: any | null) => void;
    updateItem: (id: string, updates: any) => void;
    deleteItem: (id: string) => void;
}

export const ItemsTab: React.FC<ItemsTabProps> = ({
    items, itemSearch, setItemSearch, itemFilter, setItemFilter,
    editingItem, setEditingItem, updateItem, deleteItem
}) => {
    return (
        <div className="admin-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Item Registry ({items.length})</h2>
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
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
                    {['item', 'ammo', 'armor', 'container', 'cyberware', 'consumable'].map(type => (
                        <button
                            key={type}
                            onClick={() => setItemFilter(itemFilter === type ? null : type)}
                            style={{
                                padding: '0.3rem 0.8rem',
                                background: itemFilter === type ? '#00ffff' : '#222',
                                color: itemFilter === type ? '#000' : '#888',
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
                            <th style={{ padding: '0.5rem', color: '#888' }}>Type</th>
                            <th style={{ padding: '0.5rem', color: '#888' }}>Cost</th>
                            <th style={{ padding: '0.5rem', color: '#888' }}>Rarity</th>
                            <th style={{ padding: '0.5rem', color: '#888', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items
                            .filter(item => {
                                const matchesSearch = item.name.toLowerCase().includes(itemSearch.toLowerCase()) || item.id.toLowerCase().includes(itemSearch.toLowerCase());
                                const matchesFilter = itemFilter ? item.type === itemFilter : true;
                                return matchesSearch && matchesFilter;
                            })
                            .map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', color: '#666' }}>{item.id}</td>
                                    <td style={{ padding: '0.5rem', color: '#fff' }}>{item.name}</td>
                                    <td style={{ padding: '0.5rem', color: '#00ffff' }}>{item.type}</td>
                                    <td style={{ padding: '0.5rem', color: '#ffd700' }}>{item.cost}</td>
                                    <td style={{ padding: '0.5rem', color: item.rarity === 'legendary' ? '#ff00ff' : item.rarity === 'epic' ? '#bf00ff' : item.rarity === 'rare' ? '#0088ff' : '#888' }}>
                                        {item.rarity || 'common'}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => setEditingItem(item)}
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
                                            onClick={() => deleteItem(item.id)}
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

            {editingItem && (
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
                        width: '500px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '2rem',
                        position: 'relative',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                        <button
                            onClick={() => setEditingItem(null)}
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
                            Editing: {editingItem.name}
                        </h3>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Name</label>
                                <input
                                    type="text"
                                    value={editingItem.name}
                                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                    style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Description</label>
                                <textarea
                                    value={editingItem.description}
                                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                                    style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem', minHeight: '80px' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Cost</label>
                                    <input
                                        type="number"
                                        value={editingItem.cost}
                                        onChange={(e) => setEditingItem({ ...editingItem, cost: parseInt(e.target.value) })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Weight</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={editingItem.weight}
                                        onChange={(e) => setEditingItem({ ...editingItem, weight: parseFloat(e.target.value) })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Rarity</label>
                                    <select
                                        value={editingItem.rarity || 'common'}
                                        onChange={(e) => setEditingItem({ ...editingItem, rarity: e.target.value })}
                                        style={{ width: '100%', background: '#222', border: '1px solid #444', color: '#fff', padding: '0.5rem' }}
                                    >
                                        <option value="common">Common</option>
                                        <option value="uncommon">Uncommon</option>
                                        <option value="rare">Rare</option>
                                        <option value="epic">Epic</option>
                                        <option value="legendary">Legendary</option>
                                    </select>
                                </div>
                            </div>

                            {/* Type Specific Fields */}
                            {editingItem.type === 'weapon' && (
                                <div style={{ padding: '1rem', background: '#222', borderRadius: '4px' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#ff4444' }}>Weapon Stats</h4>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Damage</label>
                                            <input
                                                type="number"
                                                value={editingItem.extraData?.damage || 0}
                                                onChange={(e) => setEditingItem({
                                                    ...editingItem,
                                                    extraData: { ...editingItem.extraData, damage: parseInt(e.target.value) }
                                                })}
                                                style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '0.5rem' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', color: '#888', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Range</label>
                                            <input
                                                type="number"
                                                value={editingItem.extraData?.range || 0}
                                                onChange={(e) => setEditingItem({
                                                    ...editingItem,
                                                    extraData: { ...editingItem.extraData, range: parseInt(e.target.value) }
                                                })}
                                                style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#fff', padding: '0.5rem' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn-reject"
                                    onClick={() => setEditingItem(null)}
                                    style={{ padding: '0.5rem 1.5rem' }}
                                >
                                    CANCEL
                                </button>
                                <button
                                    className="btn-approve"
                                    onClick={() => updateItem(editingItem.id, editingItem)}
                                    style={{ padding: '0.5rem 1.5rem' }}
                                >
                                    SAVE CHANGES
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
