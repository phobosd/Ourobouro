import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TerminalLine } from '../components/TerminalLineItem';

const SOCKET_URL = 'http://localhost:3000';

export const useGameSocket = () => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [playerStats, setPlayerStats] = useState<any>({
        hp: 100,
        maxHp: 100,
        stance: 'standing',
        engagement: 'disengaged',
        leftHand: 'Empty',
        rightHand: 'Empty'
    });
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

    const [terminalData, setTerminalData] = useState<any>(null);
    const [guideContent, setGuideContent] = useState<string | null>(null);
    const [isMatrixMode, setIsMatrixMode] = useState(false);
    const [miniMapData, setMiniMapData] = useState<any>(null);

    const addLine = useCallback((newLine: TerminalLine) => {
        setLines(prev => {
            const newLines = [...prev, newLine];
            if (newLines.length > 1000) {
                return newLines.slice(newLines.length - 1000);
            }
            return newLines;
        });
    }, []);

    const addSystemLine = useCallback((text: string) => {
        addLine({ id: Date.now().toString() + Math.random(), text, type: 'system' });
    }, [addLine]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            addSystemLine('Connected to Zenith-9 Server...');
            // Request initial map data
            setTimeout(() => {
                newSocket.emit('command', 'map');
            }, 500);
        });

        newSocket.on('disconnect', () => {
            addSystemLine('Disconnected from server.');
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

        newSocket.on('position-update', () => {
            // Request fresh map data
            newSocket.emit('command', 'map');
        });

        return () => {
            newSocket.disconnect();
        };
    }, [addLine, addSystemLine]);

    return {
        socket,
        lines,
        playerStats,
        autocompleteData,
        terminalData,
        guideContent,
        isMatrixMode,
        miniMapData,
        addLine,
        addSystemLine,
        setTerminalData,
        setGuideContent
    };
};
