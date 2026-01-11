import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CombatOverlay } from './CombatOverlay';
import { InventoryDisplay } from './InventoryDisplay';
import { ScoreDisplay } from './ScoreDisplay';
import { SheetDisplay } from './SheetDisplay';
import { TerminalDisplay } from './TerminalDisplay';
import { GuideOverlay } from './GuideOverlay';
import { MapDisplay } from './MapDisplay';
import './Terminal.css';


const SOCKET_URL = 'http://localhost:3000';

interface TerminalLine {
    id: string;
    text: string;
    type: 'output' | 'input' | 'system' | 'inventory' | 'score' | 'sheet' | 'terminal' | 'map';
    data?: any;
}

export const Terminal: React.FC = () => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);

    const outputRef = useRef<HTMLDivElement>(null);
    const [autocompleteData, setAutocompleteData] = useState<{
        spawnables: string[];
        roomObjects: string[];
        roomItems: string[];
        inventory: string[];
        containers: string[];
    }>({ spawnables: [], roomObjects: [], roomItems: [], inventory: [], containers: [] });

    const [playerStats, setPlayerStats] = useState<{ hp: number; maxHp: number; stance: string } | null>(null);

    const [terminalData, setTerminalData] = useState<any>(null);
    const [guideContent, setGuideContent] = useState<string | null>(null);

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            addSystemLine('Connected to Ouroboro Server...');
        });

        newSocket.on('disconnect', () => {
            addSystemLine('Disconnected from server.');
        });

        newSocket.on('tick', () => {
            // console.log('Tick:', data);
        });

        newSocket.on('message', (message: string | any) => {
            if (typeof message === 'string') {
                addSystemLine(message);
            } else {
                // Handle structured message
                addLine({
                    id: (message.timestamp || Date.now()).toString() + Math.random(),
                    text: message.content,
                    type: message.type,
                    data: message.payload
                });
            }
        });

        newSocket.on('autocomplete-data', (data: { spawnables: string[] }) => {
            setAutocompleteData(prev => ({ ...prev, spawnables: data.spawnables }));
        });

        newSocket.on('autocomplete-update', (data: { type: 'room' | 'inventory', items?: string[], objects?: string[], containers?: string[] }) => {
            if (data.type === 'room') {
                setAutocompleteData(prev => ({
                    ...prev,
                    roomObjects: data.objects || [],
                    roomItems: data.items || []
                }));
            } else if (data.type === 'inventory') {
                setAutocompleteData(prev => ({
                    ...prev,
                    inventory: data.items || [],
                    containers: data.containers || []
                }));
            }
        });

        newSocket.on('stats-update', (data: { hp: number; maxHp: number; stance: string }) => {
            setPlayerStats(data);
        });

        newSocket.on('inventory-data', (data: any) => {
            // Add inventory as a special terminal line
            addLine({
                id: Date.now().toString() + Math.random(),
                text: '',
                type: 'inventory' as any,
                data: data
            });
        });

        newSocket.on('score-data', (data: any) => {
            addLine({
                id: Date.now().toString() + Math.random(),
                text: '',
                type: 'score' as any,
                data: data
            });
        });

        newSocket.on('sheet-data', (data: any) => {
            addLine({
                id: Date.now().toString() + Math.random(),
                text: '',
                type: 'sheet' as any,
                data: data
            });
        });

        newSocket.on('terminal-data', (data: any) => {
            setTerminalData(data);
        });

        newSocket.on('open-guide', (data: { content: string }) => {
            setGuideContent(data.content);
        });

        return () => {
            newSocket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    const addLine = (newLine: TerminalLine) => {
        setLines(prev => {
            const newLines = [...prev, newLine];
            if (newLines.length > 1000) {
                return newLines.slice(newLines.length - 1000);
            }
            return newLines;
        });
    };

    const addSystemLine = (text: string) => {
        addLine({ id: Date.now().toString() + Math.random(), text, type: 'system' });
    };


    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const COMMANDS = [
        'look', 'l', 'la', 'north', 'n', 'south', 's', 'east', 'e', 'west', 'w',
        'get', 'g', 'take', 'drop', 'd', 'inventory', 'inv', 'i', 'glance', 'gl',
        'attack', 'kill', 'fight', 'read', 'scan',
        'god', 'admin', 'help', '?', 'map', 'm', 'sheet', 'stats', 'score', 'skills',
        'stow', 'put', 'swap', 'switch', 'use', 'sit', 'stand', 'st', 'lie', 'rest', 'sleep',
        'turn', 'rotate', 'jack_in', 'jack_out', 'jackin', 'jackout'
    ];

    const [completionState, setCompletionState] = useState<{
        active: boolean;
        prefix: string;
        matches: string[];
        index: number;
    }>({ active: false, prefix: '', matches: [], index: 0 });

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (inputValue.trim()) {
                // Add to history
                setHistory(prev => [...prev, inputValue]);
                setHistoryIndex(-1);

                if (socket) {
                    socket.emit('command', inputValue);
                }
                setInputValue('');
                setCompletionState({ active: false, prefix: '', matches: [], index: 0 });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (e.ctrlKey) {
                if (socket) socket.emit('command', 'north');
            } else if (history.length > 0) {
                const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(newIndex);
                setInputValue(history[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (e.ctrlKey) {
                if (socket) socket.emit('command', 'south');
            } else if (historyIndex !== -1) {
                const newIndex = historyIndex + 1;
                if (newIndex >= history.length) {
                    setHistoryIndex(-1);
                    setInputValue('');
                } else {
                    setHistoryIndex(newIndex);
                    setInputValue(history[newIndex]);
                }
            }
        } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
            e.preventDefault();
            if (socket) socket.emit('command', 'west');
        } else if (e.key === 'ArrowRight' && e.ctrlKey) {
            e.preventDefault();
            if (socket) socket.emit('command', 'east');
        } else if (e.key === 'Tab') {
            e.preventDefault();

            // Check if we are continuing a cycle
            if (completionState.active && inputValue === completionState.prefix + completionState.matches[completionState.index]) {
                const nextIndex = (completionState.index + 1) % completionState.matches.length;
                setCompletionState({ ...completionState, index: nextIndex });
                setInputValue(completionState.prefix + completionState.matches[nextIndex]);
                return;
            }

            // Start new completion
            const input = inputValue.toLowerCase();
            const parts = input.split(' ');

            let matches: string[] = [];
            let baseString = '';

            if (parts.length === 1) {
                matches = COMMANDS.filter(cmd => cmd.startsWith(input));
            } else {
                const cmd = parts[0];
                const lastArg = parts[parts.length - 1];
                // preserve the exact casing of the command part
                const rawParts = inputValue.split(' ');
                baseString = rawParts.slice(0, rawParts.length - 1).join(' ') + ' ';

                if (cmd === 'god') {
                    if (parts.length === 2) {
                        matches = ['spawn', 'reset'].filter(s => s.startsWith(lastArg));
                    } else if (parts.length >= 3) {
                        if (parts[1] === 'spawn') {
                            const search = parts.slice(2).join(' ');
                            matches = autocompleteData.spawnables.filter(s => s.startsWith(search));
                            baseString = rawParts.slice(0, 2).join(' ') + ' ';
                        } else if (parts[1] === 'reset') {
                            matches = ['skills', 'health', 'score', 'hp'].filter(s => s.startsWith(lastArg));
                            baseString = rawParts.slice(0, 2).join(' ') + ' ';
                        }
                    }
                } else if (['get', 'g', 'take'].includes(cmd)) {
                    // Check if we're before or after "from"
                    const fromIndex = parts.indexOf('from');
                    if (fromIndex === -1) {
                        // Completing the item name (before "from")
                        // Only suggest items in the room for 'get'
                        const candidates = Array.from(new Set([...autocompleteData.roomItems]));
                        const search = parts.slice(1).join(' ');
                        matches = candidates.filter(s => s.startsWith(search));

                        // Also suggest 'from' if we have containers
                        if ('from'.startsWith(search) && autocompleteData.containers.length > 0 && search.length > 0) {
                            matches.push('from');
                        }

                        baseString = rawParts[0] + ' ';
                    } else {
                        // Completing the container name (after "from")
                        const search = parts.slice(fromIndex + 1).join(' ');
                        matches = autocompleteData.containers.filter(s => s.startsWith(search));
                        baseString = rawParts.slice(0, fromIndex + 1).join(' ') + ' ';
                    }
                } else if (['look', 'l', 'la'].includes(cmd)) {
                    const inIndex = parts.indexOf('in');
                    if (inIndex !== -1) {
                        // Completing container name after "in"
                        const search = parts.slice(inIndex + 1).join(' ');
                        matches = autocompleteData.containers.filter(s => s.startsWith(search));
                        baseString = rawParts.slice(0, inIndex + 1).join(' ') + ' ';
                    } else {
                        // Completing item/NPC name or "in"
                        const roomTargets = [...autocompleteData.roomObjects, ...autocompleteData.roomItems];
                        const candidates = Array.from(new Set([...roomTargets, ...autocompleteData.inventory]));
                        const search = parts.slice(1).join(' ');
                        matches = candidates.filter(s => s.startsWith(search));

                        // Only suggest 'in' if it matches and we have containers
                        if ('in'.startsWith(search) && autocompleteData.containers.length > 0 && search.length > 0) {
                            matches.push('in');
                        }

                        baseString = rawParts[0] + ' ';
                    }
                } else if (['attack', 'kill', 'fight', 'read', 'scan', 'turn', 'rotate'].includes(cmd)) {
                    // These commands usually target NPCs or room objects
                    const candidates = Array.from(new Set([...autocompleteData.roomObjects, ...autocompleteData.roomItems]));
                    const search = parts.slice(1).join(' ');
                    matches = candidates.filter(s => s.startsWith(search));
                    baseString = rawParts[0] + ' ';
                }
                else if (cmd === 'put' || cmd === 'stow') {
                    // Check if we're before or after "in"
                    const inIndex = parts.indexOf('in');
                    if (inIndex === -1) {
                        // Completing the item name (before "in")
                        const search = parts.slice(1).join(' ');
                        matches = autocompleteData.inventory.filter(s => s.startsWith(search));
                        baseString = rawParts[0] + ' ';
                    } else {
                        // Completing the container name (after "in")
                        const search = parts.slice(inIndex + 1).join(' ');
                        // Use containers list for equipped containers
                        matches = autocompleteData.containers.filter(s => s.startsWith(search));
                        baseString = rawParts.slice(0, inIndex + 1).join(' ') + ' ';
                    }
                }
            }

            if (matches.length > 0) {
                // Start cycling
                setCompletionState({
                    active: true,
                    prefix: baseString,
                    matches: matches,
                    index: 0
                });
                setInputValue(baseString + matches[0]);
            }
        }
    };

    const parseMessage = (text: string) => {
        const parts = text.split(/(<[^>]+>[\s\S]*?<\/[^>]+>)/g);
        return parts.map((part, index) => {
            const match = part.match(/<([a-zA-Z0-9-]+)>([\s\S]*?)<\/\1>/);
            if (match) {
                const tag = match[1];
                const content = match[2];

                return <span key={index} className={`text-${tag}`}>{content}</span>;
            }
            return <span key={index}>{part}</span>;
        });
    };

    return (
        <div className="terminal-container">
            {socket && <CombatOverlay socket={socket} />}
            {terminalData && socket && (
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
                    <div key={line.id} className={`terminal-line ${line.type}`}>
                        {line.type === 'inventory' && line.data ? (
                            <InventoryDisplay data={line.data} />
                        ) : line.type === 'score' && line.data ? (
                            <ScoreDisplay data={line.data} />
                        ) : line.type === 'sheet' && line.data ? (
                            <SheetDisplay data={line.data} />
                        ) : line.type === 'map' && line.data ? (
                            <MapDisplay data={line.data} />
                        ) : (
                            parseMessage(line.text)
                        )}
                    </div>
                ))}
            </div>
            <div className="terminal-input-area">

                <div className="terminal-input-row">
                    <span className="prompt">
                        {playerStats ? `[HP: ${playerStats.hp}/${playerStats.maxHp}]${playerStats.stance !== 'standing' ? ` (${playerStats.stance})` : ''} >` : '>'}
                    </span>
                    <input
                        type="text"
                        className="terminal-input"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setCompletionState({ active: false, prefix: '', matches: [], index: 0 });
                        }}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
};
