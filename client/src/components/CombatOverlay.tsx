import React, { useState, useEffect, useRef } from 'react';
import './CombatOverlay.css';

interface SyncBarParams {
    speed: number;
    critZoneSize: number;
    jitter: number;
    barLength: number;
}

interface CombatSyncData {
    targetId: string;
    targetName: string;
    weaponName: string;
    syncBar: SyncBarParams;
}

interface CombatOverlayProps {
    socket: any;
}

export const CombatOverlay: React.FC<CombatOverlayProps> = ({ socket }) => {
    const [isActive, setIsActive] = useState(false);
    const [combatData, setCombatData] = useState<CombatSyncData | null>(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [direction, setDirection] = useState(1);
    const animationRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);

    useEffect(() => {
        const handleCombatSync = (data: CombatSyncData) => {
            setCombatData(data);
            setIsActive(true);
            setCursorPosition(0);
            setDirection(1);
            lastTimeRef.current = performance.now();
        };

        socket.on('combat-sync', handleCombatSync);

        return () => {
            socket.off('combat-sync', handleCombatSync);
        };
    }, [socket]);

    useEffect(() => {
        if (!isActive || !combatData) return;

        const animate = (currentTime: number) => {
            const deltaTime = currentTime - lastTimeRef.current;
            lastTimeRef.current = currentTime;

            setCursorPosition(prev => {
                const speed = combatData.syncBar.speed;
                const barLength = combatData.syncBar.barLength;
                const jitter = combatData.syncBar.jitter;

                // Add jitter (random jumps)
                const jitterAmount = Math.random() < jitter ? (Math.random() - 0.5) * 2 : 0;

                let newPos = prev + (direction * speed * deltaTime / 100) + jitterAmount;

                // Bounce at edges
                if (newPos >= barLength) {
                    newPos = barLength;
                    setDirection(-1);
                } else if (newPos <= 0) {
                    newPos = 0;
                    setDirection(1);
                }

                return newPos;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive, combatData, direction]);

    useEffect(() => {
        if (!isActive || !combatData) return;

        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'f') {
                e.preventDefault();

                // Calculate hit type based on cursor position
                const barLength = combatData.syncBar.barLength;
                const critZoneSize = combatData.syncBar.critZoneSize;
                const critZoneCenter = barLength / 2;
                const critZoneStart = critZoneCenter - critZoneSize / 2;
                const critZoneEnd = critZoneCenter + critZoneSize / 2;

                const hitMarkers = [barLength * 0.25, barLength * 0.75];
                const hitTolerance = 0.5;

                let hitType: 'crit' | 'hit' | 'miss';

                if (cursorPosition >= critZoneStart && cursorPosition <= critZoneEnd) {
                    hitType = 'crit';
                } else if (
                    Math.abs(cursorPosition - hitMarkers[0]) < hitTolerance ||
                    Math.abs(cursorPosition - hitMarkers[1]) < hitTolerance
                ) {
                    hitType = 'hit';
                } else {
                    hitType = 'miss';
                }

                // Send result to server
                socket.emit('combat-result', {
                    targetId: combatData.targetId,
                    hitType: hitType
                });

                // Close overlay
                setIsActive(false);
                setCombatData(null);
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [isActive, combatData, cursorPosition, socket]);

    if (!isActive || !combatData) return null;

    const renderSyncBar = () => {
        const barLength = combatData.syncBar.barLength;
        const critZoneSize = combatData.syncBar.critZoneSize;
        const critZoneCenter = barLength / 2;
        const critZoneStart = Math.floor(critZoneCenter - critZoneSize / 2);
        const critZoneEnd = Math.floor(critZoneCenter + critZoneSize / 2);

        const hitMarker1 = Math.floor(barLength * 0.25);
        const hitMarker2 = Math.floor(barLength * 0.75);

        const cursorPos = Math.floor(cursorPosition);

        let bar = '';
        for (let i = 0; i < barLength; i++) {
            if (i === cursorPos) {
                bar += '<span class="cursor">▼</span>';
            }

            if (i >= critZoneStart && i <= critZoneEnd) {
                bar += '<span class="crit-zone">=</span>';
            } else if (i === hitMarker1 || i === hitMarker2) {
                bar += '<span class="hit-marker">|</span>';
            } else {
                bar += '<span class="miss-zone">-</span>';
            }
        }

        return `[${bar}]`;
    };

    return (
        <div className="combat-overlay">
            <div className="combat-container">
                <div className="combat-header">
                    <div className="combat-title">═══ NEURAL SYNC INITIATED ═══</div>
                    <div className="combat-info">
                        <div>Target: <span className="target-name">{combatData.targetName}</span></div>
                        <div>Weapon: <span className="weapon-name">{combatData.weaponName}</span></div>
                    </div>
                </div>

                <div className="sync-bar-container">
                    <div
                        className="sync-bar"
                        dangerouslySetInnerHTML={{ __html: renderSyncBar() }}
                    />
                </div>

                <div className="combat-instructions">
                    <div className="instruction-pulse">Press [F] to FIRE!</div>
                    <div className="zone-legend">
                        <span className="legend-crit">[==] CRIT ZONE</span>
                        <span className="legend-hit">[|] HIT</span>
                        <span className="legend-miss">[-] MISS</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
