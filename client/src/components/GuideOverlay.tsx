import React, { useState, useEffect, useRef } from 'react';
import './GuideOverlay.css';

interface GuideOverlayProps {
    content: string;
    onClose: () => void;
}

interface Chapter {
    id: string;
    title: string;
    level: number;
}

export const GuideOverlay: React.FC<GuideOverlayProps> = ({ content, onClose }) => {
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Parse chapters from headers
        // Handle both CRLF and LF line endings
        const lines = content.split(/\r?\n/);
        const extractedChapters: Chapter[] = [];

        lines.forEach((line, index) => {
            const match = line.trim().match(/^(#{1,3})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const title = match[2].trim();
                const id = `chapter-${index}`;
                extractedChapters.push({ id, title, level });
            }
        });

        setChapters(extractedChapters);
    }, [content]);

    const scrollToChapter = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const highlightText = (text: string): React.ReactNode => {
        if (!searchTerm) return text;
        const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === searchTerm.toLowerCase()
                ? <mark key={i} className="search-highlight">{part}</mark>
                : part
        );
    };

    const parseInlineStyles = (text: string): React.ReactNode => {
        // Split by code blocks, bold, and italic
        // Order matters: code first (to preserve * inside code), then bold, then italic
        const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

        return parts.map((part, index) => {
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={index}>{highlightText(part.slice(1, -1))}</code>;
            }
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} style={{ color: '#fff', fontWeight: 'bold' }}>{highlightText(part.slice(2, -2))}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={index}>{highlightText(part.slice(1, -1))}</em>;
            }
            return <span key={index}>{highlightText(part)}</span>;
        });
    };

    const renderContent = () => {
        const lines = content.split(/\r?\n/);
        let inTable = false;

        const elements: React.ReactNode[] = [];

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            const matchesSearch = !searchTerm || line.toLowerCase().includes(searchTerm.toLowerCase());

            // Headers
            const headerMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
            if (headerMatch) {
                if (matchesSearch) {
                    const level = headerMatch[1].length;
                    const Tag = `h${level}` as any;
                    elements.push(<Tag key={index} id={`chapter-${index}`}>{highlightText(headerMatch[2])}</Tag>);
                }
                return;
            }

            // Tables
            if (trimmedLine.startsWith('|')) {
                const cells = line.split(/(?<!\\)\|/).filter(c => c.trim() !== '').map(c => c.trim().replace(/\\\|/g, '|'));

                if (line.includes('---')) {
                    inTable = true;
                    return;
                }

                if (!inTable) {
                    inTable = true;
                }

                if (matchesSearch) {
                    elements.push(
                        <div key={index} className="table-row" style={{ display: 'flex', borderBottom: '1px solid #333', padding: '5px 0' }}>
                            {cells.map((cell, i) => (
                                <div key={i} style={{ flex: 1, padding: '0 5px', borderRight: i < cells.length - 1 ? '1px solid #333' : 'none' }}>
                                    {parseInlineStyles(cell)}
                                </div>
                            ))}
                        </div>
                    );
                }
                return;
            } else {
                inTable = false;
            }

            // Lists
            if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                if (matchesSearch) {
                    elements.push(<li key={index} style={{ marginLeft: '20px' }}>{parseInlineStyles(trimmedLine.replace(/^[\*\-]\s+/, ''))}</li>);
                }
                return;
            }

            // Empty lines
            if (trimmedLine === '') {
                if (!searchTerm) elements.push(<br key={index} />);
                return;
            }

            // Default Paragraph
            if (matchesSearch) {
                elements.push(<p key={index}>{parseInlineStyles(line)}</p>);
            }
        });

        return elements;
    };

    return (
        <div className="guide-overlay">
            <div className="guide-header">
                <div className="guide-title">USER'S GUIDE v1.0</div>
                <div className="guide-search">
                    <input
                        type="text"
                        placeholder="Search guide..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="guide-search-input"
                    />
                </div>
                <button className="guide-close-btn" onClick={onClose}>[CLOSE]</button>
            </div>
            <div className="guide-body">
                <div className="guide-toc">
                    {chapters
                        .filter(chapter => !searchTerm || chapter.title.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(chapter => (
                            <div
                                key={chapter.id}
                                className="guide-toc-item"
                                style={{ paddingLeft: `${(chapter.level - 1) * 10 + 5}px` }}
                                onClick={() => scrollToChapter(chapter.id)}
                            >
                                {highlightText(chapter.title)}
                            </div>
                        ))
                    }
                </div>
                <div className="guide-content" ref={contentRef}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};
