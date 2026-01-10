import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CombatOverlay } from './CombatOverlay';
import './Terminal.css';

const SOCKET_URL = 'http://localhost:3000';

interface TerminalLine {
    id: string;
    text: string;
    type: 'output' | 'input' | 'system';
}

export const Terminal: React.FC = () => {
    const [lines, setLines] = useState<TerminalLine[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [socket, setSocket] = useState<Socket | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            addSystemLine('Connected to Ouroboro Server...');
        });

        newSocket.on('disconnect', () => {
            addSystemLine('Disconnected from server.');
        });

        newSocket.on('tick', (data: any) => {
            // console.log('Tick:', data);
        });

        newSocket.on('message', (message: string) => {
            addSystemLine(message);
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

    const addSystemLine = (text: string) => {
        setLines(prev => [...prev, { id: Date.now().toString() + Math.random(), text, type: 'system' }]);
    };

    const addInputLine = (text: string) => {
        setLines(prev => [...prev, { id: Date.now().toString() + Math.random(), text: `> ${text}`, type: 'input' }]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (inputValue.trim()) {
                // addInputLine(inputValue); // Don't echo input
                if (socket) {
                    socket.emit('command', inputValue);
                }
                setInputValue('');
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
            <div className="terminal-output" ref={outputRef}>
                {lines.map(line => (
                    <div key={line.id} className={`terminal-line ${line.type}`}>
                        {parseMessage(line.text)}
                    </div>
                ))}
            </div>
            <div className="terminal-input-area">
                <span className="prompt">{'>'}</span>
                <input
                    type="text"
                    className="terminal-input"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>
        </div>
    );
};
