import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CombatOverlay } from './CombatOverlay';
import { InventoryDisplay } from './InventoryDisplay';
import { ScoreDisplay } from './ScoreDisplay';
import { SheetDisplay } from './SheetDisplay';
import { TerminalDisplay } from './TerminalDisplay';
import { GuideOverlay } from './GuideOverlay';
import { MapDisplay } from './MapDisplay';
import { MiniMap } from './MiniMap';
import { StatusBar, RoundtimeIndicator, HandsDisplay, CombatStatusDisplay, MomentumBar } from './StatusHUD';
import { CombatBufferDisplay } from './CombatBufferDisplay';
import './Terminal.css';


const SOCKET_URL = 'http://localhost:3000';

interface TerminalLine {
    id: string;
    text: string;
    type: 'output' | 'input' | 'system' | 'inventory' | 'score' | 'sheet' | 'terminal' | 'map' | 'info' | 'error' | 'success' | 'action' | 'combat' | 'room_desc';
    data?: any;
}

// Helper function to parse messages (moved outside component to be accessible)
import { ParseMessage } from './InteractiveText';

const TerminalLineItem = React.memo(({ line, socket }: { line: TerminalLine, socket: Socket | null }) => {
    return (
        <div className={`terminal-line ${line.type}`}>
            {line.type === 'inventory' && line.data ? (
                <InventoryDisplay data={line.data} socket={socket} />
            ) : line.type === 'score' && line.data ? (
                <ScoreDisplay data={line.data} />
            ) : line.type === 'sheet' && line.data ? (
                <SheetDisplay data={line.data} />
            ) : line.type === 'map' && line.data ? (
                <MapDisplay data={line.data} />
            ) : (
                <ParseMessage text={line.text} socket={socket} />
            )}
        </div>
    );
}, (prev, next) => prev.line.id === next.line.id);

export const Terminal: React.FC = () => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);

    const outputRef = useRef<HTMLDivElement>(null);
    const [autocompleteData, setAutocompleteData] = useState<{
        spawnables: string[];
        roomObjects: string[];
        roomItems: string[];
        roomNPCs: string[];
        inventory: string[];
        containers: string[];
        equipped: string[];
        stats: string[];
        skills: string[];
    }>({ spawnables: [], roomObjects: [], roomItems: [], roomNPCs: [], inventory: [], containers: [], equipped: [], stats: [], skills: [] });

    const [playerStats, setPlayerStats] = useState<{
        hp: number;
        maxHp: number;
        stance: string;
        roundtime?: number;
        maxRoundtime?: number;
        balance?: number;
        fatigue?: number;
        maxFatigue?: number;
        engagement?: string;
        momentum?: number;
        hasKatana?: boolean;
        leftHand?: string;
        rightHand?: string;
        leftHandDetails?: any;
        rightHandDetails?: any;
    } | null>({
        hp: 100,
        maxHp: 100,
        stance: 'standing',
        engagement: 'disengaged',
        leftHand: 'Empty',
        rightHand: 'Empty'
    });

    const [terminalData, setTerminalData] = useState<any>(null);
    const [guideContent, setGuideContent] = useState<string | null>(null);
    const [isMatrixMode, setIsMatrixMode] = useState(false);
    const [isGlitching, setIsGlitching] = useState(false);
    const [miniMapData, setMiniMapData] = useState<any>(null);

    const triggerGlitch = () => {
        if (!isMatrixMode) return;
        setIsGlitching(true);
        setTimeout(() => setIsGlitching(false), 50);
    };

    // ... (rest of Terminal component)

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            addSystemLine('Connected to Ouroboro Server...');
            // Request initial map data
            setTimeout(() => {
                newSocket.emit('command', 'map');
            }, 500);
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
                // Update mini-map if this is map data
                if (message.type === 'map' && message.payload) {
                    setMiniMapData(message.payload);
                    // Don't add map to terminal output - it's only for the mini-map
                    return;
                }

                // Handle structured message
                addLine({
                    id: (message.timestamp || Date.now()).toString() + Math.random(),
                    text: message.content,
                    type: message.type,
                    data: message.payload
                });
            }
        });

        newSocket.on('autocomplete-data', (data: { spawnables: string[], stats?: string[], skills?: string[] }) => {
            setAutocompleteData(prev => ({
                ...prev,
                spawnables: data.spawnables,
                stats: data.stats || [],
                skills: data.skills || []
            }));
        });

        newSocket.on('autocomplete-update', (data: { type: 'room' | 'inventory', items?: string[], objects?: string[], containers?: string[], npcs?: string[], equipped?: string[] }) => {
            if (data.type === 'room') {
                setAutocompleteData(prev => ({
                    ...prev,
                    roomObjects: data.objects || [],
                    roomItems: data.items || [],
                    roomNPCs: data.npcs || []
                }));
            } else if (data.type === 'inventory') {
                setAutocompleteData(prev => ({
                    ...prev,
                    inventory: data.items || [],
                    containers: data.containers || [],
                    equipped: data.equipped || []
                }));
            }
        });

        newSocket.on('stats-update', (data: any) => {
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

        newSocket.on('cyberspace-state', (data: { active: boolean }) => {
            setIsMatrixMode(data.active);
            // Refresh map data to reflect new mode
            newSocket.emit('command', 'map');
        });

        // Listen for position updates to refresh mini-map
        newSocket.on('position-update', () => {
            // Request fresh map data
            newSocket.emit('command', 'map');
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
            if (newLines.length > 2000) {
                return newLines.slice(newLines.length - 2000);
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
        'god', 'admin', 'help', '?', 'map', 'm', 'sheet', 'stats', 'score', 'skills', 'weather', 'sky',
        'stow', 'put', 'swap', 'switch', 'use', 'sit', 'stand', 'st', 'lie', 'rest', 'sleep',
        'wear', 'equip', 'remove', 'unequip', 'takeoff',
        'turn', 'rotate', 'jack_in', 'jack_out', 'jackin', 'jackout',
        'maneuver', 'man', 'target', 'stance', 'appraise', 'app',
        'advance', 'adv', 'retreat', 'flee', 'hangback', 'reload', 'ammo', 'stop', 'assess',
        'dash', 'slash', 'parry', 'thrust', 'upload', 'execute',
        'punch', 'jab', 'headbutt', 'uppercut', 'iaijutsu', 'iai', 'slice'
    ];

    const [completionState, setCompletionState] = useState<{
        active: boolean;
        prefix: string;
        matches: string[];
        index: number;
    }>({ active: false, prefix: '', matches: [], index: 0 });

    const getUsage = (input: string): string | null => {
        const parts = input.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === 'god') {
            if (parts.length === 1) return "Usage: god <subcommand>";
            const sub = parts[1];
            if (!sub) return "Usage: god <subcommand>";

            if ('spawn'.startsWith(sub)) return "Usage: god spawn <item_name | npc_name>";
            if ('money'.startsWith(sub)) return "Usage: god money <amount> [target]";
            if ('set-stat'.startsWith(sub)) return "Usage: god set-stat [target] <stat> <value>";
            if ('set-skill'.startsWith(sub)) return "Usage: god set-skill [target] <skill> <value>";
            if ('view'.startsWith(sub)) return "Usage: god view [target]";
            if ('reset'.startsWith(sub)) return "Usage: god reset <skills|health>";
            if ('weather'.startsWith(sub)) return "Usage: god weather <clear|rain|storm|fog>";
            if ('pacify'.startsWith(sub)) return "Usage: god pacify [target]";
            if ('registry'.startsWith(sub)) return "Usage: god registry";
        }
        if (['look', 'l', 'la'].includes(cmd)) return "Usage: look [at <target> | in <container>]";
        if (['get', 'g', 'take'].includes(cmd)) return "Usage: get <item> [from <container>]";
        if (['drop', 'd'].includes(cmd)) return "Usage: drop <item>";
        if (['inventory', 'inv', 'i'].includes(cmd)) return "Usage: inventory";
        if (['attack', 'kill', 'fight'].includes(cmd)) return "Usage: attack <target>";
        if (['punch', 'jab', 'headbutt', 'uppercut', 'slice', 'iaijutsu'].includes(cmd)) return `Usage: ${cmd} <target>`;
        if (['maneuver', 'man'].includes(cmd)) return "Usage: maneuver <close|withdraw> [target]";
        if (['put', 'stow'].includes(cmd)) return "Usage: put <item> in <container>";
        if (cmd === 'target') return "Usage: target <body_part>";
        if (cmd === 'stance') return "Usage: stance <type>";
        if (cmd === 'flee') return "Usage: flee <direction>";
        if (['appraise', 'app'].includes(cmd)) return "Usage: appraise <target>";
        if (['advance', 'adv'].includes(cmd)) return "Usage: advance <target>";
        if (['read', 'scan'].includes(cmd)) return "Usage: read <target>";
        if (['turn', 'rotate'].includes(cmd)) return "Usage: turn <target>";
        if (['wear', 'equip'].includes(cmd)) return "Usage: wear <item>";
        if (['remove', 'unequip', 'takeoff'].includes(cmd)) return "Usage: remove <item>";
        if (['jack_in', 'jackin'].includes(cmd)) return "Usage: jack_in";
        if (['jack_out', 'jackout'].includes(cmd)) return "Usage: jack_out";
        if (cmd === 'dash') return "Usage: dash (Adds DASH to combat buffer)";
        if (cmd === 'slash') return "Usage: slash (Adds SLASH to combat buffer)";
        if (cmd === 'parry') return "Usage: parry (Adds PARRY to combat buffer)";
        if (cmd === 'thrust') return "Usage: thrust (Adds THRUST to combat buffer)";
        if (['upload', 'execute'].includes(cmd)) return "Usage: upload (Executes combat buffer)";
        if (cmd === 'god' && parts[1] === 'find') return "Usage: god find <query>";
        if (cmd === 'god' && parts[1] === 'spawn') return "Usage: god spawn <item_name | npc_name>";
        if (cmd === 'god' && parts[1] === 'money') return "Usage: god money <amount> [target]";
        if (cmd === 'god' && parts[1] === 'set-stat') return "Usage: god set-stat [target] <stat> <value>";
        if (cmd === 'god' && parts[1] === 'set-skill') return "Usage: god set-skill [target] <skill> <value>";
        if (cmd === 'god' && parts[1] === 'view') return "Usage: god view [target]";
        if (cmd === 'god' && parts[1] === 'reset') return "Usage: god reset <skills|health>";
        if (cmd === 'god' && parts[1] === 'weather') return "Usage: god weather <clear|rain|storm|fog>";
        if (cmd === 'god' && parts[1] === 'pacify') return "Usage: god pacify [target]";
        if (cmd === 'god' && parts[1] === 'registry') return "Usage: god registry";

        return null;
    };

    const getMatches = (input: string): { matches: string[], baseString: string } => {
        const parts = input.toLowerCase().split(' ');
        const rawParts = input.split(' ');
        let matches: string[] = [];
        let baseString = '';

        const matchCandidate = (candidate: string, search: string) => {
            const lowerCandidate = candidate.toLowerCase();
            const lowerSearch = search.toLowerCase();
            if (lowerCandidate.startsWith(lowerSearch)) return true;
            const words = lowerCandidate.split(' ');
            return words.some(word => word.startsWith(lowerSearch));
        };

        if (parts.length === 1) {
            matches = COMMANDS.filter(cmd => cmd.startsWith(parts[0]));
        } else {
            const cmd = parts[0];
            const lastArg = parts[parts.length - 1];
            baseString = rawParts.slice(0, rawParts.length - 1).join(' ') + ' ';

            if (cmd === 'god') {
                if (parts.length === 2) {
                    matches = ['spawn', 'reset', 'set-stat', 'set-skill', 'view', 'weather', 'pacify', 'registry', 'money'].filter(s => s.startsWith(lastArg));
                } else if (parts.length >= 3) {
                    if (parts[1] === 'spawn') {
                        const search = parts.slice(2).join(' ');
                        matches = autocompleteData.spawnables.filter(s => matchCandidate(s, search));
                        baseString = rawParts.slice(0, 2).join(' ') + ' ';
                    } else if (parts[1] === 'reset') {
                        matches = ['skills', 'health', 'score', 'hp'].filter(s => s.startsWith(lastArg));
                        baseString = rawParts.slice(0, 2).join(' ') + ' ';
                    } else if (parts[1] === 'set-stat' || parts[1] === 'set-skill') {
                        const isSkill = parts[1] === 'set-skill';
                        const pool = isSkill ? autocompleteData.skills : autocompleteData.stats;
                        const argsAfterCmd = parts.slice(2);

                        // Try to find if we've already completed a target
                        let targetWordCount = 0;
                        if (argsAfterCmd[0] === 'me' || argsAfterCmd[0] === 'self') {
                            targetWordCount = 1;
                        } else {
                            // Check for multi-word room objects
                            for (const obj of autocompleteData.roomObjects) {
                                const objParts = obj.toLowerCase().split(' ');
                                if (argsAfterCmd.length >= objParts.length) {
                                    const potentialMatch = argsAfterCmd.slice(0, objParts.length).join(' ');
                                    if (potentialMatch === obj.toLowerCase()) {
                                        targetWordCount = objParts.length;
                                        break;
                                    }
                                }
                            }
                        }

                        if (targetWordCount > 0 && argsAfterCmd.length > targetWordCount) {
                            // Target is complete, and we have started the next arg
                            const targetName = argsAfterCmd.slice(0, targetWordCount).join(' ').toLowerCase();
                            const isPlayer = targetName === 'me' || targetName === 'self';

                            let filteredPool = pool;
                            if (!isSkill) {
                                if (isPlayer) {
                                    filteredPool = ['STR', 'CON', 'AGI', 'CHA', 'HP', 'MAXHP'];
                                } else {
                                    filteredPool = ['ATTACK', 'DEFENSE', 'HP', 'MAXHP'];
                                }
                            }

                            const search = argsAfterCmd.slice(targetWordCount).join(' ');
                            matches = filteredPool.filter(s => matchCandidate(s, search));
                            baseString = rawParts.slice(0, 2 + targetWordCount).join(' ') + ' ';
                        } else {
                            // Still typing target OR typing stat/skill (defaulting to 'me')
                            const search = argsAfterCmd.join(' ');
                            const targets = ['me', ...autocompleteData.roomObjects];

                            // If typing the first arg, show targets AND player stats (since target defaults to 'me')
                            const playerStats = isSkill ? autocompleteData.skills : ['STR', 'CON', 'AGI', 'CHA', 'HP', 'MAXHP'];

                            matches = [
                                ...targets.filter(t => matchCandidate(t, search)),
                                ...playerStats.filter(p => matchCandidate(p, search))
                            ];
                            baseString = rawParts.slice(0, 2).join(' ') + ' ';
                        }
                        // Deduplicate matches
                        matches = Array.from(new Set(matches));
                    } else if (parts[1] === 'view') {
                        if (parts.length === 3) {
                            const search = lastArg;
                            const targets = ['me', ...autocompleteData.roomObjects];
                            matches = targets.filter(s => matchCandidate(s, search));
                            baseString = rawParts.slice(0, 2).join(' ') + ' ';
                        }
                    } else if (parts[1] === 'pacify') {
                        const search = parts.slice(2).join(' ');
                        matches = [...autocompleteData.roomNPCs, 'me', 'self'].filter(s => matchCandidate(s, search));
                        baseString = rawParts.slice(0, 2).join(' ') + ' ';
                    } else if (parts[1] === 'money') {
                        if (parts.length >= 4) {
                            const search = parts.slice(3).join(' ');
                            const targets = ['me', ...autocompleteData.roomObjects];
                            matches = targets.filter(s => matchCandidate(s, search));
                            baseString = rawParts.slice(0, 3).join(' ') + ' ';
                        }
                    }
                }
            } else if (['get', 'g', 'take'].includes(cmd)) {
                const fromIndex = parts.indexOf('from');
                if (fromIndex === -1) {
                    const candidates = Array.from(new Set([...autocompleteData.roomItems, ...autocompleteData.inventory]));
                    const search = parts.slice(1).join(' ');
                    matches = candidates.filter(s => matchCandidate(s, search));
                    if ('from'.startsWith(search.toLowerCase()) && autocompleteData.containers.length > 0 && search.length > 0) {
                        matches.push('from');
                    }
                    baseString = rawParts[0] + ' ';
                } else {
                    const search = parts.slice(fromIndex + 1).join(' ');
                    matches = autocompleteData.containers.filter(s => matchCandidate(s, search));
                    baseString = rawParts.slice(0, fromIndex + 1).join(' ') + ' ';
                }
            } else if (['look', 'l', 'la'].includes(cmd)) {
                const inIndex = parts.indexOf('in');
                if (inIndex !== -1) {
                    const search = parts.slice(inIndex + 1).join(' ');
                    matches = autocompleteData.containers.filter(s => matchCandidate(s, search));
                    baseString = rawParts.slice(0, inIndex + 1).join(' ') + ' ';
                } else {
                    let searchStartIndex = 1;
                    if (cmd === 'look' && parts[1] === 'at') searchStartIndex = 2;
                    const roomTargets = [...autocompleteData.roomObjects, ...autocompleteData.roomItems];
                    const candidates = Array.from(new Set([...roomTargets, ...autocompleteData.inventory]));
                    const search = parts.slice(searchStartIndex).join(' ');
                    matches = candidates.filter(s => matchCandidate(s, search));
                    if (searchStartIndex === 1 && 'in'.startsWith(search.toLowerCase()) && autocompleteData.containers.length > 0 && search.length > 0) {
                        matches.push('in');
                    }
                    if (cmd === 'look' && searchStartIndex === 1 && 'at'.startsWith(search.toLowerCase()) && search.length > 0) {
                        matches.push('at');
                    }
                    baseString = rawParts.slice(0, searchStartIndex).join(' ') + ' ';
                }
            } else if (['punch', 'jab', 'headbutt', 'uppercut', 'slice', 'iaijutsu'].includes(cmd)) {
                const candidates = autocompleteData.roomNPCs;
                const search = parts.slice(1).join(' ');
                matches = candidates.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            } else if (['attack', 'kill', 'fight', 'read', 'scan', 'turn', 'rotate', 'appraise', 'app', 'advance', 'adv', 'retreat'].includes(cmd)) {
                const candidates = Array.from(new Set([...autocompleteData.roomObjects, ...autocompleteData.roomItems]));
                if (['read', 'scan'].includes(cmd)) {
                    candidates.push('guide', 'compendium', 'areas');
                }
                const search = parts.slice(1).join(' ');
                matches = candidates.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            } else if (cmd === 'maneuver' || cmd === 'man') {
                if (parts[1] === 'close' || parts[1] === 'withdraw') {
                    const search = parts.slice(2).join(' ');
                    matches = [...autocompleteData.roomNPCs, 'me', 'self'].filter(s => matchCandidate(s, search));
                    baseString = rawParts.slice(0, 2).join(' ') + ' ';
                } else {
                    const search = parts.slice(1).join(' ');
                    matches = ['close', 'withdraw'].filter(s => s.startsWith(search.toLowerCase()));
                    baseString = rawParts[0] + ' ';
                }
            } else if (cmd === 'flee') {
                const search = parts.slice(1).join(' ');
                const directions = ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'];
                matches = directions.filter(s => s.startsWith(search.toLowerCase()));
                baseString = rawParts[0] + ' ';
            } else if (cmd === 'target') {
                const search = parts.slice(1).join(' ');
                const bodyParts = ['head', 'neck', 'chest', 'abdomen', 'back', 'r_arm', 'l_arm', 'r_leg', 'l_leg', 'eyes'];
                matches = bodyParts.filter(s => s.startsWith(search.toLowerCase()));
                baseString = rawParts[0] + ' ';
            } else if (cmd === 'stance') {
                const search = parts.slice(1).join(' ');
                matches = ['offensive', 'defensive', 'neutral', 'evasion', 'parry', 'shield', 'custom'].filter(s => s.startsWith(search.toLowerCase()));
                baseString = rawParts[0] + ' ';
            } else if (cmd === 'put' || cmd === 'stow') {
                const inIndex = parts.indexOf('in');
                if (inIndex === -1) {
                    const search = parts.slice(1).join(' ');
                    matches = autocompleteData.inventory.filter(s => matchCandidate(s, search));
                    if ('in'.startsWith(search.toLowerCase()) && autocompleteData.containers.length > 0 && search.length > 0) {
                        matches.push('in');
                    }
                    baseString = rawParts[0] + ' ';
                } else {
                    const search = parts.slice(inIndex + 1).join(' ');
                    matches = autocompleteData.containers.filter(s => matchCandidate(s, search));
                    baseString = rawParts.slice(0, inIndex + 1).join(' ') + ' ';
                }
            } else if (['wear', 'equip'].includes(cmd)) {
                // Autocomplete with inventory items and items on ground
                const candidates = Array.from(new Set([...autocompleteData.inventory, ...autocompleteData.roomItems]));
                const search = parts.slice(1).join(' ');
                matches = candidates.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            } else if (['remove', 'unequip', 'takeoff'].includes(cmd)) {
                // Autocomplete with equipped items only
                const search = parts.slice(1).join(' ');
                matches = autocompleteData.equipped.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            } else if (['use', 'u'].includes(cmd)) {
                // Autocomplete with inventory items only
                const search = parts.slice(1).join(' ');
                matches = autocompleteData.inventory.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            } else if (['drop', 'd'].includes(cmd)) {
                // Autocomplete with inventory items only
                const search = parts.slice(1).join(' ');
                matches = autocompleteData.inventory.filter(s => matchCandidate(s, search));
                baseString = rawParts[0] + ' ';
            }
        }
        return { matches, baseString };
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        triggerGlitch();
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
            const { matches, baseString } = getMatches(inputValue);

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
            <div className="terminal-input-area">
                <div className="status-indicators-row">
                    {playerStats && <RoundtimeIndicator stats={playerStats} />}
                    {playerStats && <MomentumBar stats={playerStats} />}
                </div>
                <div className="terminal-input-row">
                    <span className="prompt">
                        {'>'}
                    </span>
                    <input
                        type="text"
                        className="terminal-input"
                        value={inputValue}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val.endsWith('?')) {
                                const inputWithoutQuestion = val.slice(0, -1);

                                // If typing '?' at the root, show the full help list from server
                                if (inputWithoutQuestion.trim() === '') {
                                    if (socket) socket.emit('command', 'help');
                                    setCompletionState({ active: false, prefix: '', matches: [], index: 0 });
                                    return;
                                }

                                const { matches } = getMatches(inputWithoutQuestion);
                                const usage = getUsage(inputWithoutQuestion);

                                let helpText = '';
                                if (usage) {
                                    helpText += `<info>${usage}</info>\n`;
                                }

                                // Display the help output
                                if (matches.length > 0) {
                                    helpText += `<title>[Available Options]</title>\n`;
                                    const optionsWithUsage = matches.map(m => {
                                        const usage = getUsage(inputWithoutQuestion + ' ' + m);
                                        return usage ? `<info>${m}</info> -> ${usage}` : `<info>${m}</info>`;
                                    });
                                    const hasUsage = optionsWithUsage.some(o => o.includes('->'));
                                    helpText += optionsWithUsage.join(hasUsage ? '\n' : ', ');
                                } else if (!usage) {
                                    helpText = 'No options found.';
                                }

                                if (helpText) addSystemLine(helpText);

                                // Do NOT update input with the '?', just clear completion state
                                setCompletionState({ active: false, prefix: '', matches: [], index: 0 });
                                return;
                            }
                            triggerGlitch();
                            setInputValue(val);
                            setCompletionState({ active: false, prefix: '', matches: [], index: 0 });
                        }}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                </div>
            </div>
            {playerStats && <StatusBar stats={playerStats} />}
        </div>
    );
};
