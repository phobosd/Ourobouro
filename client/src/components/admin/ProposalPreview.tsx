import React from 'react';
import type { Proposal } from '../AdminDashboard';

interface ProposalPreviewProps {
    proposal: Proposal;
}

export const ProposalPreview: React.FC<ProposalPreviewProps> = ({ proposal }) => {
    const { type, payload } = proposal;

    if (type === 'NPC') {
        return (
            <div className="proposal-preview npc-preview">
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {payload.portrait && (
                        <div className="portrait-container">
                            <img
                                src={payload.portrait}
                                alt={payload.name}
                                className="realistic-portrait"
                            />
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <h3 style={{ color: '#00ffff', margin: '0 0 0.5rem 0' }}>{payload.name}</h3>
                        <p style={{ color: '#ccc', fontSize: '0.9rem', marginBottom: '1rem' }}>{payload.description}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem' }}>
                            <div>
                                <strong style={{ color: '#888' }}>STATS</strong>
                                <div style={{ color: '#00ff41' }}>HP: {payload.stats.health}</div>
                                <div style={{ color: '#ff4444' }}>ATK: {payload.stats.attack}</div>
                                <div style={{ color: '#33ccff' }}>DEF: {payload.stats.defense}</div>
                            </div>
                            <div>
                                <strong style={{ color: '#888' }}>DETAILS</strong>
                                <div>Behavior: <span style={{ color: '#ffcc00' }}>{payload.behavior}</span></div>
                                <div>Faction: <span style={{ color: '#bc13fe' }}>{payload.faction}</span></div>
                                <div>Tags: <span style={{ color: '#888' }}>{payload.tags?.join(', ')}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {payload.dialogue && payload.dialogue.length > 0 && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                        <strong style={{ color: '#888', fontSize: '0.8rem' }}>SAMPLE DIALOGUE</strong>
                        <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                            {payload.dialogue.slice(0, 5).map((line: string, i: number) => (
                                <div key={i} style={{ marginBottom: '0.25rem' }}>"{line}"</div>
                            ))}
                            {payload.dialogue.length > 5 && <div>...and {payload.dialogue.length - 5} more</div>}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (type === 'ITEM') {
        return (
            <div className="proposal-preview item-preview">
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    {payload.portrait && (
                        <div className="portrait-container item-icon-container">
                            <img
                                src={payload.portrait}
                                alt={payload.name}
                                className="realistic-portrait item-icon"
                            />
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <h3 style={{ color: '#ff00ff', margin: '0 0 0.5rem 0' }}>{payload.name}</h3>
                        <p style={{ color: '#ccc', fontSize: '0.9rem' }}>{payload.description}</p>
                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', fontSize: '0.85rem' }}>
                            <div>Type: <span style={{ color: '#00ffff' }}>{payload.type}</span></div>
                            <div>Rarity: <span className={`rarity-${payload.rarity}`}>{payload.rarity}</span></div>
                            <div>Cost: <span style={{ color: '#ffd700' }}>{payload.cost}cr</span></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'WORLD_EXPANSION') {
        return (
            <div className="proposal-preview room-preview">
                {payload.portrait && (
                    <div className="portrait-container room-portrait-container" style={{ width: '100%', height: '180px', marginBottom: '1rem' }}>
                        <img
                            src={payload.portrait}
                            alt={payload.name}
                            className="realistic-portrait"
                            style={{ objectFit: 'cover' }}
                        />
                    </div>
                )}
                <h3 style={{ color: '#00ff41', margin: '0 0 0.5rem 0' }}>{payload.name}</h3>
                <p style={{ color: '#ccc', fontSize: '0.9rem' }}>{payload.description}</p>
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#888' }}>
                    Coordinates: ({payload.coordinates.x}, {payload.coordinates.y}) | Type: {payload.type}
                </div>
            </div>
        );
    }

    // Fallback to JSON for other types
    return <pre style={{ fontSize: '0.8rem', color: '#888' }}>{JSON.stringify(payload, null, 2)}</pre>;
};
