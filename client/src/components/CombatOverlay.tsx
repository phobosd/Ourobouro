import React, { useState, useEffect, useRef, useCallback } from 'react';

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
    onSyncBarUpdate: (bar: string) => void;
}

export const CombatOverlay: React.FC<CombatOverlayProps> = ({ socket, onSyncBarUpdate }) => {
    const [isActive, setIsActive] = useState(false);
    const [combatData, setCombatData] = useState<CombatSyncData | null>(null);

    // Use refs for animation state to avoid re-renders
    const cursorPositionRef = useRef(0);
    const directionRef = useRef(1);
    const animationRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);
    const lastRenderedPosRef = useRef(-1);

    // Memoize bar building function
    const buildBar = useCallback((cursorPos: number, data: CombatSyncData): string => {
        const barLength = data.syncBar.barLength;
        const critZoneSize = data.syncBar.critZoneSize;
        const critZoneCenter = barLength / 2;
        const critZoneStart = Math.floor(critZoneCenter - critZoneSize / 2);
        const critZoneEnd = Math.floor(critZoneCenter + critZoneSize / 2);

        const hitMarker1 = Math.floor(barLength * 0.25);
        const hitMarker2 = Math.floor(barLength * 0.75);

        let bar = '[';
        for (let i = 0; i < barLength; i++) {
            if (i === cursorPos) {
                bar += '*';
            } else if (i >= critZoneStart && i <= critZoneEnd) {
                bar += '=';
            } else if (i === hitMarker1 || i === hitMarker2) {
                bar += '|';
            } else {
                bar += '-';
            }
        }
        bar += ']';
        return bar;
    }, []);

    useEffect(() => {
        const handleCombatSync = (data: CombatSyncData) => {
            setCombatData(data);
            setIsActive(true);
            cursorPositionRef.current = 0;
            directionRef.current = 1;
            lastRenderedPosRef.current = -1;
            lastTimeRef.current = performance.now();
        };

        socket.on('combat-sync', handleCombatSync);

        return () => {
            socket.off('combat-sync', handleCombatSync);
        };
    }, [socket]);

    useEffect(() => {
        if (!isActive || !combatData) {
            onSyncBarUpdate('');
            return;
        }

        const animate = (currentTime: number) => {
            const deltaTime = currentTime - lastTimeRef.current;
            lastTimeRef.current = currentTime;

            const speed = combatData.syncBar.speed;
            const barLength = combatData.syncBar.barLength;
            const jitter = combatData.syncBar.jitter;

            // Update cursor position using ref
            const jitterAmount = Math.random() < jitter ? (Math.random() - 0.5) * 2 : 0;
            let newPos = cursorPositionRef.current + (directionRef.current * speed * deltaTime / 100) + jitterAmount;

            // Bounce at edges
            if (newPos >= barLength) {
                newPos = barLength;
                directionRef.current = -1;
            } else if (newPos <= 0) {
                newPos = 0;
                directionRef.current = 1;
            }

            cursorPositionRef.current = newPos;

            // Only update the bar if cursor moved to a new integer position
            const currentIntPos = Math.floor(newPos);
            if (currentIntPos !== lastRenderedPosRef.current) {
                lastRenderedPosRef.current = currentIntPos;
                const bar = buildBar(currentIntPos, combatData);
                onSyncBarUpdate(bar);
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive, combatData, onSyncBarUpdate, buildBar]);

    useEffect(() => {
        if (!isActive || !combatData) return;

        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'f') {
                e.preventDefault();

                const barLength = combatData.syncBar.barLength;
                const critZoneSize = combatData.syncBar.critZoneSize;
                const critZoneCenter = barLength / 2;
                const critZoneStart = critZoneCenter - critZoneSize / 2;
                const critZoneEnd = critZoneCenter + critZoneSize / 2;

                const hitMarkers = [barLength * 0.25, barLength * 0.75];
                const hitTolerance = 0.5;

                let hitType: 'crit' | 'hit' | 'miss';
                const currentPos = cursorPositionRef.current;

                if (currentPos >= critZoneStart && currentPos <= critZoneEnd) {
                    hitType = 'crit';
                } else if (
                    Math.abs(currentPos - hitMarkers[0]) < hitTolerance ||
                    Math.abs(currentPos - hitMarkers[1]) < hitTolerance
                ) {
                    hitType = 'hit';
                } else {
                    hitType = 'miss';
                }

                socket.emit('combat-result', {
                    targetId: combatData.targetId,
                    hitType: hitType
                });

                setIsActive(false);
                setCombatData(null);
                onSyncBarUpdate('');
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [isActive, combatData, socket, onSyncBarUpdate]);

    return null;
};
