import React from 'react';
import './InventoryDisplay.css';

interface MapCell {
    x: number;
    y: number;
    type: string;
    title: string;
    isPlayer: boolean;
}

interface MapData {
    grid: (MapCell | null)[][];
    playerPos: { x: number; y: number };
    worldPos?: { x: number; y: number };
}

interface Props {
    data: MapData;
}

export const MapDisplay: React.FC<Props> = React.memo(({ data }) => {
    const getSymbol = (cell: MapCell) => {
        if (cell.isPlayer) return '@';
        switch (cell.type) {
            case 'clinic': return '+';
            case 'shop': return '$';
            case 'club': return '♫';
            case 'park': return 'T';
            case 'plaza': return '#';
            case 'street': return '.';
            case 'dungeon': return '░';
            default: return '?';
        }
    };

    const getCellClass = (cell: MapCell) => {
        if (cell.isPlayer) return 'map-player';
        return `map-${cell.type}`;
    };

    const displayX = data.worldPos ? data.worldPos.x : data.playerPos.x;
    const displayY = data.worldPos ? data.worldPos.y : data.playerPos.y;

    const isCyberspace = displayX >= 5000;
    let sector = 'UNKNOWN';
    if (isCyberspace) sector = 'THE MATRIX';
    else if (displayX < 7) sector = 'CHIBA';
    else if (displayX < 14) sector = 'SPRAWL';
    else sector = 'STRAYLIGHT';

    const isLargeMap = data.grid.length > 25;

    return (
        <div className={`inventory-display ${isCyberspace ? 'matrix-map' : ''}`}>
            <div className="inventory-header">{isCyberspace ? 'NEURAL TOPOLOGY GRID' : 'CITY NAVIGATION GRID'}</div>
            <div className="inventory-grid" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className={`map-grid ${isLargeMap ? 'large-map' : ''}`}>
                    {data.grid.map((row, y) => (
                        <div key={y} className="map-row">
                            {row.map((cell, x) => (
                                <div
                                    key={x}
                                    className={`map-cell ${cell ? getCellClass(cell) : 'map-empty'}`}
                                    title={cell ? cell.title : ''}
                                >
                                    {cell ? getSymbol(cell) : ' '}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="inventory-footer" style={{
                marginTop: '10px',
                textAlign: 'center',
                fontSize: '12px',
                color: isCyberspace ? '#00ff41' : '#0ff',
                borderTop: `1px solid ${isCyberspace ? 'rgba(0, 255, 65, 0.3)' : 'rgba(0, 255, 255, 0.3)'}`,
                paddingTop: '5px'
            }}>
                LOCATION: ({isCyberspace ? displayX - 10000 : displayX}, {displayY}) | SECTOR: {sector}
            </div>
        </div>
    );
});
