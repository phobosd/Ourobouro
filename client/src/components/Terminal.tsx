import React, { useState, useEffect, useRef } from 'react';
import { CombatOverlay } from './CombatOverlay';
import { TerminalDisplay } from './TerminalDisplay';
import { GuideOverlay } from './GuideOverlay';
import { MiniMap } from './MiniMap';
import { StatusBar, HandsDisplay, CombatStatusDisplay } from './StatusHUD';
import { CombatBufferDisplay } from './CombatBufferDisplay';
import { CombatDisplay } from './CombatDisplay';
import { TerminalLineItem } from './TerminalLineItem';
import { TerminalInput } from './TerminalInput';
import { useGameSocket } from '../hooks/useGameSocket';
import { useTerminalInput } from '../hooks/useTerminalInput';
import './Terminal.css';

export const Terminal: React.FC = () => {
    const {
        socket,
        lines,
        playerStats,
        autocompleteData,
        terminalData,
        guideContent,
        isMatrixMode,
        miniMapData,
        setTerminalData,
        setGuideContent,
        addSystemLine
    } = useGameSocket();

    const [isGlitching, setIsGlitching] = useState(false);

    const triggerGlitch = () => {
        if (!isMatrixMode) return;
        setIsGlitching(true);
        setTimeout(() => setIsGlitching(false), 50);
    };

    const {
        inputValue,
        handleInputChange,
        handleKeyDown
    } = useTerminalInput(socket, autocompleteData, triggerGlitch, addSystemLine);

    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    return (
        <div className={`terminal-container ${isMatrixMode ? 'matrix-mode' : ''} ${isGlitching ? 'glitch-active' : ''}`}>
            {playerStats && (
                <div className="top-status-bar">
                    <HandsDisplay stats={playerStats} />
                    <CombatStatusDisplay stats={playerStats} />
                </div>
            )}
            {socket && <CombatOverlay socket={socket} />}
            {socket && <CombatBufferDisplay socket={socket} />}
            {socket && <CombatDisplay socket={socket} />}
            <MiniMap data={miniMapData} />
            {terminalData && (
                <TerminalDisplay
                    data={terminalData}
                    socket={socket}
                    onClose={() => setTerminalData(null)}
                />
            )}
            {guideContent && (
                <GuideOverlay
                    content={guideContent}
                    onClose={() => setGuideContent(null)}
                />
            )}
            <div className="terminal-output" ref={outputRef}>
                {lines.map(line => (
                    <TerminalLineItem key={line.id} line={line} socket={socket} />
                ))}
            </div>
            <TerminalInput
                inputValue={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                playerStats={playerStats}
            />
            {playerStats && <StatusBar stats={playerStats} />}
        </div>
    );
};
