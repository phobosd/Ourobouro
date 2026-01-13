import React, { useEffect, useState } from 'react';
import './CombatBufferDisplay.css';

interface CombatAction {
    type: string;
    targetId?: string;
}

interface BufferData {
    actions: CombatAction[];
    maxSlots: number;
    isExecuting: boolean;
    isBuilding?: boolean;
    currentAction?: CombatAction;
    flow?: number;
    malware?: string[];
}

export const CombatBufferDisplay: React.FC<{ socket: any }> = ({ socket }) => {
    const [buffer, setBuffer] = useState<BufferData>({
        actions: [],
        maxSlots: 3,
        isExecuting: false,
        isBuilding: false
    });
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        socket.on('buffer-update', (data: BufferData) => {
            setBuffer(data);
            if (data.currentAction) {
                setLogs(prev => [...prev, `> EXECUTING: ${data.currentAction?.type}...`].slice(-10));
            }
        });

        return () => {
            socket.off('buffer-update');
        };
    }, [socket]);

    // Only show if building or executing
    if (!buffer.isBuilding && !buffer.isExecuting) return null;

    return (
        <div className="combat-buffer-container">
            <div className="buffer-header">
                <span className="blink">_</span> COMBAT_BUFFER.EXE
            </div>
            <div className="buffer-info">
                <div className="info-item">
                    <span className="label">FLOW:</span>
                    <span className="value">{buffer.flow || 0}</span>
                </div>
                {buffer.malware && buffer.malware.length > 0 && (
                    <div className="info-item malware">
                        <span className="label">MALWARE:</span>
                        <span className="value">{buffer.malware.join(', ')}</span>
                    </div>
                )}
            </div>
            <div className="buffer-slots">
                {Array.from({ length: buffer.maxSlots }).map((_, i) => {
                    const action = buffer.actions[i];
                    return (
                        <div key={i} className={`buffer-slot ${action ? 'filled' : 'empty'} ${buffer.isExecuting && i === 0 ? 'active' : ''}`}>
                            <div className="slot-index">[{i}]</div>
                            <div className="slot-content">
                                {action ? action.type : '---'}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="buffer-status">
                {buffer.isExecuting ? (
                    <div className="status-executing">UPLOADING SEQUENCE...</div>
                ) : (
                    <div className="status-ready">READY FOR INPUT</div>
                )}
            </div>
            <div className="buffer-logs">
                {logs.map((log, i) => (
                    <div key={i} className="log-entry">{log}</div>
                ))}
            </div>
        </div>
    );
};
