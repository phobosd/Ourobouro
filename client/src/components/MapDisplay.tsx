import React from 'react';
import './InventoryDisplay.css'; // Reusing consistency

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
}

interface Props {
    data: MapData;
}

export const MapDisplay: React.FC<Props> = ({ data }) => {
    const getSymbol = (cell: MapCell) => {
        if (cell.isPlayer) return '@';
        switch (cell.type) {
            case 'clinic': return '+';
            case 'shop': return '$';
            case 'club': return '♫';
            case 'park': return 'T';
            case 'plaza': return '#';
            case 'street': return '.';
            default: return '?';
        }
    };

    const getCellClass = (cell: MapCell) => {
        if (cell.isPlayer) return 'map-player';
        return `map-${cell.type}`;
    };

    return (
        <div className="inv map-display">
            <div className="inv-title">CITY NAVIGATION GRID</div>
            <div className="inv-border"></div>
            <div className="inv-body" style={{ justifyContent: 'center', padding: '10px' }}>
                <div className="map-grid">
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
            <div className="inv-border"></div>
            <div className="inv-footer" style={{ textAlign: 'center', fontSize: '0.8em' }}>
                LOCATION: ({data.playerPos.x}, {data.playerPos.y}) | SECTOR: {data.playerPos.x < 7 ? 'CHIBA' : data.playerPos.x < 14 ? 'SPRAWL' : 'STRAYLIGHT'}
            </div>
        </div>
    );
};
