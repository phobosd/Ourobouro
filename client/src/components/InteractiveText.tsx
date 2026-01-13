import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Socket } from 'socket.io-client';
import { ItemTooltip, type ItemDetails } from './ItemTooltip';

// Interactive Tag Component
export const InteractiveTag: React.FC<{ tag: string; content: string; attributes?: string; socket: Socket | null }> = ({ tag, content, attributes, socket }) => {
    const [details, setDetails] = useState<ItemDetails | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'top' });
    const triggerRef = useRef<HTMLSpanElement>(null);

    const handleMouseEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const placement = rect.top < 200 ? 'bottom' : 'top';
            setCoords({
                top: placement === 'top' ? rect.top - 10 : rect.bottom + 10,
                left: rect.left + rect.width / 2,
                placement
            });
        }

        setIsHovering(true);
        if (!details && socket) {
            // Extract ID if present
            let entityId: string | undefined;
            if (attributes) {
                const idMatch = attributes.match(/id="([^"]+)"/);
                if (idMatch) {
                    entityId = idMatch[1];
                }
            }

            if (tag === 'item' || tag === 'weapon' || tag === 'armor' || tag === 'container') {
                const cleanContent = content.replace(/\(x\d+\)/, '').trim();
                socket.emit('get-item-details', { id: entityId, name: cleanContent }, (data: ItemDetails) => {
                    setDetails(data);
                });
            } else if (tag === 'npc' || tag === 'enemy') {
                socket.emit('get-npc-details', { id: entityId, name: content }, (data: ItemDetails) => {
                    setDetails(data);
                });
            }
        }
    };

    const handleMouseLeave = () => {
        setIsHovering(false);
    };

    return (
        <>
            <span
                ref={triggerRef}
                className={`text-${tag} interactive-tag`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
            >
                {content}
            </span>
            {isHovering && details && createPortal(
                <div style={{
                    position: 'fixed',
                    top: coords.top,
                    left: coords.left,
                    transform: coords.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                    zIndex: 99999,
                    pointerEvents: 'none'
                }}>
                    <ItemTooltip
                        details={details}
                        visible={true}
                        style={{
                            position: 'relative',
                            top: 'auto',
                            left: 'auto',
                            transform: 'none',
                            marginTop: 0,
                            marginBottom: 0
                        }}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

// Helper function to parse messages
export const ParseMessage: React.FC<{ text: string; socket: Socket | null }> = ({ text, socket }) => {
    if (!text) return null;

    // Regex to match <tag attr="val">content</tag>
    const tagRegex = /<([a-zA-Z0-9-]+)(?:\s+([^>]*))?>([\s\S]*?)<\/\1>/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
        }

        const tag = match[1];
        const attributes = match[2];
        const content = match[3];

        // Check if nested tags exist
        if (/<([a-zA-Z0-9-]+)(?:\s+([^>]*))?>/.test(content)) {
            parts.push(
                <span key={`tag-${match.index}`} className={`text-${tag}`}>
                    <ParseMessage text={content} socket={socket} />
                </span>
            );
        } else {
            parts.push(
                <InteractiveTag key={`tag-${match.index}`} tag={tag} content={content} attributes={attributes} socket={socket} />
            );
        }

        lastIndex = tagRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>);
    }

    return <>{parts}</>;
};
