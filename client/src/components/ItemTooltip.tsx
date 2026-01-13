import React from 'react';
import './StatusHUD.css';

export interface ItemDetails {
    name: string;
    description: string;
    damage?: number;
    range?: number;
    ammo?: number;
    weight?: number;
    attributes?: string;
}

export const ItemTooltip: React.FC<{ details: ItemDetails; visible?: boolean; style?: React.CSSProperties }> = ({ details, visible, style }) => {
    if (!details) return null;

    const combinedStyle: React.CSSProperties = {
        ...(visible ? { display: 'block', opacity: 1, visibility: 'visible', transform: 'translateY(0)' } : {}),
        ...style
    };

    return (
        <div className="item-tooltip" style={combinedStyle}>
            <div className="tooltip-header">{details.name}</div>
            <div className="tooltip-desc">{details.description}</div>
            <div className="tooltip-stats">
                {details.damage !== undefined && <div className="tooltip-stat"><span>DMG:</span> {details.damage}</div>}
                {details.range !== undefined && <div className="tooltip-stat"><span>RNG:</span> {details.range}</div>}
                {details.ammo !== undefined && <div className="tooltip-stat"><span>AMMO:</span> {details.ammo}</div>}
                {details.weight !== undefined && <div className="tooltip-stat"><span>WGT:</span> {details.weight}lb</div>}
                {details.attributes && <div className="tooltip-stat"><span>ATTR:</span> {details.attributes}</div>}
            </div>
        </div>
    );
};
