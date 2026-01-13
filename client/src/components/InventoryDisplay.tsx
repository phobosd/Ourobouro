import React from 'react';
import { Socket } from 'socket.io-client';
import { ParseMessage } from './InteractiveText';
import './InventoryDisplay.css';

interface InventoryData {
    leftHand: string;
    rightHand: string;
    backpack: string;
    head: string;
    torso: string;
    legs: string;
    feet: string;
    waist: string;
    backpackContents: string[];
}

interface Props {
    data: InventoryData;
    socket: Socket | null;
}

export const InventoryDisplay: React.FC<Props> = ({ data, socket }) => {
    const renderItem = (text: string) => {
        if (!text || text === 'Empty' || text === 'Unknown') return text;
        // If the text is already formatted with tags (from server), ParseMessage will handle it.
        // If it's just plain text (legacy/fallback), ParseMessage will render it as text, 
        // but we want to force it to be interactive if it's an item name.
        // However, since we are updating the server to send tags, we can rely on ParseMessage.
        // But for safety, if it doesn't start with <, we could wrap it? 
        // Actually, let's just use ParseMessage. The server update will ensure tags are present.
        return <ParseMessage text={text} socket={socket} />;
    };

    return (
        <div className="inventory-display">
            <div className="inventory-header">CHARACTER INVENTORY</div>
            <div className="inventory-grid">
                <div className="inventory-section">
                    <div className="section-title">EQUIPPED:</div>
                    <div className="backpack-list">
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Head:</span>
                            <span className="stat-value">{renderItem(data.head)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Torso:</span>
                            <span className="stat-value">{renderItem(data.torso)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Back:</span>
                            <span className="stat-value">{renderItem(data.backpack)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Left Hand:</span>
                            <span className="stat-value">{renderItem(data.leftHand)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Right Hand:</span>
                            <span className="stat-value">{renderItem(data.rightHand)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Waist:</span>
                            <span className="stat-value">{renderItem(data.waist)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Legs:</span>
                            <span className="stat-value">{renderItem(data.legs)}</span>
                        </div>
                        <div className="inventory-item stat-row">
                            <span className="stat-label">Feet:</span>
                            <span className="stat-value">{renderItem(data.feet)}</span>
                        </div>
                    </div>
                </div>
                <div className="inventory-section">
                    <div className="section-title">BACKPACK:</div>
                    <div className="backpack-list">
                        {data.backpackContents && data.backpackContents.length > 0 ? (
                            data.backpackContents.map((item, idx) => (
                                <div key={idx} className="inventory-item">
                                    <span className="stat-value">- {renderItem(item)}</span>
                                </div>
                            ))
                        ) : (
                            <div className="inventory-item">
                                <span className="stat-value" style={{ fontStyle: 'italic', opacity: 0.5 }}>(Empty)</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
