import React from 'react';
import './InventoryDisplay.css';

interface InventoryData {
    leftHand: string;
    rightHand: string;
    backpack: string;
    torso: string;
    legs: string;
    waist: string;
    backpackContents: string[];
    currency?: {
        newYen: number;
        credits: number;
    };
}

interface Props {
    data: InventoryData;
}

export const InventoryDisplay: React.FC<Props> = ({ data }) => {
    const tr = (str: string, len: number) => {
        if (str.length > len) return str.substring(0, len);
        return str.padEnd(len);
    };

    return (
        <div className="inv">
            <div className="inv-title">CHARACTER INVENTORY</div>
            <div className="inv-border"></div>
            <div className="inv-body">
                <div className="inv-left">
                    <div className="inv-section">EQUIPPED ITEMS:</div>

                    <div className="inv-slot">
                        <span className="slot-label">SHOULDER:</span>
                        <span className="slot-item">[ {tr(data.backpack, 14)} ]</span>
                        <span className="slot-label">HEAD:</span>
                        <span className="slot-item">[ None ]</span>
                    </div>

                    <div className="inv-slot">
                        <span className="slot-label">CHEST:</span>
                        <span className="slot-item wide">[ {tr(data.torso, 14)} ]</span>
                    </div>

                    <div className="inv-slot">
                        <span className="slot-label">R HAND:</span>
                        <span className="slot-item">[ {tr(data.rightHand, 12)} ]</span>
                        <span className="slot-label">L HAND:</span>
                        <span className="slot-item">[ {tr(data.leftHand, 12)} ]</span>
                    </div>

                    <div className="inv-slot">
                        <span className="slot-label">WAIST:</span>
                        <span className="slot-item wide">[ {tr(data.waist, 14)} ]</span>
                    </div>

                    <div className="inv-slot">
                        <span className="slot-label">LEGS:</span>
                        <span className="slot-item wide">[ {tr(data.legs, 14)} ]</span>
                    </div>
                </div>

                <div className="inv-divider"></div>

                <div className="inv-right">
                    <div className="inv-section">ALL ITEMS / BACKPACK CONTENTS:</div>
                    <div className="inv-list">
                        {data.backpackContents.length > 0 ? (
                            data.backpackContents.map((item, idx) => (
                                <div key={idx} className="inv-item">[ {item} ]</div>
                            ))
                        ) : (
                            <div className="inv-empty">(Empty)</div>
                        )}
                    </div>
                </div>
            </div>
            <div className="inv-border"></div>
            <div className="inv-footer">
                ¥{data.currency?.newYen || 0} | {data.currency?.credits || 0} CREDITS
            </div>
        </div>
    );
};
