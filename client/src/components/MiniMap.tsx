import React from 'react';
import './MiniMap.css';

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
    data: MapData | null;
}

export const MiniMap: React.FC<Props> = ({ data }) => {
    if (!data) return null;

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
        if (cell.isPlayer) return 'minimap-player';
        return `minimap-${cell.type}`;
    };

    const displayX = data.worldPos ? data.worldPos.x : data.playerPos.x;
    const displayY = data.worldPos ? data.worldPos.y : data.playerPos.y;

    const isCyberspace = displayX >= 5000;
    let sector = 'UNKNOWN';
    if (isCyberspace) sector = 'MATRIX';
    else if (displayX < 7) sector = 'CHIBA';
    else if (displayX < 14) sector = 'SPRAWL';
    else sector = 'STRAYLIGHT';

    return (
        <div className={`minimap-container ${isCyberspace ? 'matrix-mode' : ''}`}>
            <div className="minimap-header">
                {isCyberspace ? 'NEURAL MAP' : 'NAV MAP'}
            </div>
            <div className="minimap-grid">
                {data.grid.map((row, y) => (
                    <div key={y} className="minimap-row">
                        {row.map((cell, x) => (
                            <div
                                key={x}
                                className={`minimap-cell ${cell ? getCellClass(cell) : 'minimap-empty'}`}
                                title={cell ? cell.title : ''}
                            >
                                {cell ? getSymbol(cell) : ' '}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="minimap-footer">
                {sector} ({isCyberspace ? displayX - 10000 : displayX},{displayY})
            </div>
        </div>
    );
};
