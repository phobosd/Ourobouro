import React from 'react';

interface WorldTabProps {
    mapDeleteMode: boolean;
    setMapDeleteMode: (mode: boolean) => void;
    generatedChunks: string[];
    generateChunk: (x: number, y: number) => void;
}

export const WorldTab: React.FC<WorldTabProps> = ({ mapDeleteMode, setMapDeleteMode, generatedChunks, generateChunk }) => {
    return (
        <div className="admin-card" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ marginBottom: '1rem' }}>World Expansion Map</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <p style={{ color: '#888', margin: 0 }}>
                    {mapDeleteMode
                        ? <span style={{ color: '#ff4444' }}>DELETE MODE: Click a green cell to delete/reset it.</span>
                        : "Click on a grid cell to generate a new 20x20 chunk. Green cells are already generated."
                    }
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={mapDeleteMode}
                        onChange={(e) => setMapDeleteMode(e.target.checked)}
                    />
                    <span style={{ color: mapDeleteMode ? '#ff4444' : '#fff' }}>Delete Mode</span>
                </label>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(11, 40px)',
                gap: '4px',
                background: '#111',
                padding: '1rem',
                borderRadius: '8px'
            }}>
                {/* Generate a 11x11 grid centered on 0,0 (from -5 to +5) */}
                {Array.from({ length: 11 * 11 }).map((_, i) => {
                    const x = (i % 11) - 5;
                    const y = Math.floor(i / 11) - 5;
                    const isGenerated = generatedChunks.includes(`${x},${y}`);
                    const isCenter = x === 0 && y === 0;

                    return (
                        <div
                            key={`${x},${y}`}
                            onClick={() => generateChunk(x, y)}
                            style={{
                                width: '40px',
                                height: '40px',
                                background: isGenerated ? '#00ff0033' : '#333',
                                border: isCenter ? '2px solid #fff' : '1px solid #444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.6rem',
                                color: isGenerated ? '#00ff00' : '#666',
                                cursor: isGenerated ? 'default' : 'pointer',
                                transition: 'all 0.2s'
                            }}
                            title={`Chunk ${x},${y}`}
                        >
                            {x},{y}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
