import React from 'react';

interface GlitchTabProps {
    glitchConfig: {
        mobCount: number;
        itemCount: number;
        legendaryChance: number;
    };
    setGlitchConfig: (config: any) => void;
    updateGlitchConfig: (config: any) => void;
}

export const GlitchTab: React.FC<GlitchTabProps> = ({ glitchConfig, setGlitchConfig, updateGlitchConfig }) => {
    return (
        <div className="admin-grid">
            <div className="admin-card">
                <h2 style={{ marginBottom: '1.5rem' }}>Glitch Door Configuration</h2>
                <p style={{ marginBottom: '1.5rem', color: '#888' }}>
                    Configure the parameters for the procedural dungeon generation triggered by the Glitch Door.
                    Changes are applied immediately for the next run.
                </p>

                <div className="setting-row">
                    <label>Mob Count: <span className="text-neon-blue">{glitchConfig.mobCount}</span></label>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={glitchConfig.mobCount}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGlitchConfig((prev: any) => ({ ...prev, mobCount: val }));
                            updateGlitchConfig({ mobCount: val });
                        }}
                    />
                </div>

                <div className="setting-row">
                    <label>Item Count: <span className="text-neon-blue">{glitchConfig.itemCount}</span></label>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={glitchConfig.itemCount}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGlitchConfig((prev: any) => ({ ...prev, itemCount: val }));
                            updateGlitchConfig({ itemCount: val });
                        }}
                    />
                </div>

                <div className="setting-row">
                    <label>Legendary Chance: <span className="text-neon-purple">{(glitchConfig.legendaryChance * 100).toFixed(0)}%</span></label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={glitchConfig.legendaryChance * 100}
                        onChange={(e) => {
                            const val = parseInt(e.target.value) / 100;
                            setGlitchConfig((prev: any) => ({ ...prev, legendaryChance: val }));
                            updateGlitchConfig({ legendaryChance: val });
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
