import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import './CombatDisplay.css';

interface CombatState {
    inCombat: boolean;
    player: {
        balance: number;
        balanceDesc: string;
        fatigue: number;
        maxFatigue: number;
        engagementTier: string;
    };
    target: {
        id: string;
        name: string;
        hp: number;
        maxHp: number;
        status: string;
        balance: number;
        balanceDesc: string;
        range: string;
    } | null;
    nearby: {
        id: string;
        name: string;
        isHostile: boolean;
        balanceDesc: string;
        range: string;
    }[];
}

interface Props {
    socket: Socket;
}

export const CombatDisplay: React.FC<Props> = ({ socket }) => {
    const [state, setState] = useState<CombatState | null>(null);
    const [position, setPosition] = useState({ x: window.innerWidth - 700, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleCombatState = (data: CombatState) => {
            setState(data);
        };

        socket.on('combat-state', handleCombatState);

        return () => {
            socket.off('combat-state', handleCombatState);
        };
    }, [socket]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    if (!state || !state.inCombat) return null;

    const getBalanceColor = (balance: number) => {
        if (balance > 0.7) return '#00ff00'; // Green
        if (balance > 0.4) return '#ffff00'; // Yellow
        return '#ff0000'; // Red
    };

    const getFatigueColor = (current: number, max: number) => {
        const ratio = current / max;
        if (ratio > 0.5) return '#00ff00';
        if (ratio > 0.2) return '#ffff00';
        return '#ff0000';
    };

    return (
        <div
            className={`combat-display ${isDragging ? 'dragging' : ''}`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'grab',
                right: 'auto' // Override default CSS
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="combat-header">COMBAT ASSESSMENT</div>

            <div className="combat-section player-section">
                <div className="section-title">YOU</div>
                <div className="stat-row">
                    <span className="label">Balance:</span>
                    <span className="value" style={{ color: getBalanceColor(state.player.balance) }}>
                        {state.player.balanceDesc} ({Math.floor(state.player.balance * 100)}%)
                    </span>
                </div>
                <div className="stat-row">
                    <span className="label">Stamina:</span>
                    <span className="value" style={{ color: getFatigueColor(state.player.fatigue, state.player.maxFatigue) }}>
                        {Math.floor(state.player.fatigue)} / {state.player.maxFatigue}
                    </span>
                </div>
                <div className="stat-row">
                    <span className="label">Engagement:</span>
                    <span className="value">{state.player.engagementTier}</span>
                </div>
            </div>

            {state.target && (
                <div className="combat-section target-section">
                    <div className="section-title">TARGET: {state.target.name}</div>
                    <div className="stat-row">
                        <span className="label">Status:</span>
                        <span className="value">{state.target.status}</span>
                    </div>
                    <div className="stat-row">
                        <span className="label">Balance:</span>
                        <span className="value" style={{ color: getBalanceColor(state.target.balance) }}>
                            {state.target.balanceDesc}
                        </span>
                    </div>
                    <div className="stat-row">
                        <span className="label">Range:</span>
                        <span className="value">{state.target.range}</span>
                    </div>
                </div>
            )}

            {state.nearby.length > 0 && (
                <div className="combat-section nearby-section">
                    <div className="section-title">NEARBY THREATS</div>
                    {state.nearby.map((npc, idx) => (
                        <div key={idx} className="nearby-row">
                            <span className={`npc-name ${npc.isHostile ? 'hostile' : ''}`}>{npc.name}</span>
                            <span className="npc-range">({npc.range})</span>
                            <span className="npc-balance" style={{ color: getBalanceColor(0.5) }}>{npc.balanceDesc}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
