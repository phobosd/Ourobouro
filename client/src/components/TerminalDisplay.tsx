import React, { useState, useEffect } from 'react';
import './TerminalDisplay.css';

interface ItemData {
    name: string;
    weight: number;
    size: string;
    legality: string;
    attributes: string;
    description: string;
    cost: number;
    type?: string;
}

interface TerminalData {
    title: string;
    items: ItemData[];
}

interface Props {
    data: TerminalData;
    socket: any;
    onClose: () => void;
}

export const TerminalDisplay: React.FC<Props> = ({ data, socket, onClose }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Create a flat array of items in display order (grouped by type)
    const displayItems = React.useMemo(() => {
        const grouped: { [key: string]: ItemData[] } = {};
        data.items.forEach(item => {
            const type = item.type || 'item';
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push(item);
        });

        const categories = [
            { key: 'weapon' },
            { key: 'armor' },
            { key: 'item' },
            { key: 'cyberware' },
            { key: 'container' }
        ];

        const flatItems: ItemData[] = [];
        categories.forEach(category => {
            if (grouped[category.key]) {
                flatItems.push(...grouped[category.key]);
            }
        });
        return flatItems;
    }, [data.items]);

    // Scroll selected item into view
    useEffect(() => {
        const selectedRow = document.querySelector(`tr[data-index="${selectedIndex}"]`);
        if (selectedRow) {
            selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedIndex]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(0, prev - 1));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(displayItems.length - 1, prev + 1));
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const item = displayItems[selectedIndex];
                if (item) {
                    socket.emit('terminal-buy', { itemName: item.name, cost: item.cost });
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [displayItems, selectedIndex, socket, onClose]);

    return (
        <div className="term-overlay">
            <div className="term-window">
                <div className="term-header">
                    <div className="term-title">{data.title}</div>
                    <div className="term-close" onClick={onClose}>[X]</div>
                </div>
                <div className="term-body">
                    <table className="term-table">
                        <thead>
                            <tr>
                                <th>ITEM NAME</th>
                                <th>WEIGHT</th>
                                <th>SIZE</th>
                                <th>LEGALITY</th>
                                <th>ATTRIBUTES / NOTES</th>
                                <th>COST</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                // Group items by type
                                const grouped: { [key: string]: ItemData[] } = {};
                                data.items.forEach(item => {
                                    const type = item.type || 'item';
                                    if (!grouped[type]) grouped[type] = [];
                                    grouped[type].push(item);
                                });

                                // Define category order and labels
                                const categories = [
                                    { key: 'weapon', label: '═══ WEAPONS ═══' },
                                    { key: 'armor', label: '═══ ARMOR ═══' },
                                    { key: 'item', label: '═══ AMMUNITION & ITEMS ═══' },
                                    { key: 'cyberware', label: '═══ CYBERWARE ═══' },
                                    { key: 'container', label: '═══ CONTAINERS ═══' }
                                ];

                                let globalIndex = 0;
                                return categories.map(category => {
                                    if (!grouped[category.key]) return null;

                                    const items = grouped[category.key];
                                    return (
                                        <React.Fragment key={category.key}>
                                            <tr className="term-category-header">
                                                <td colSpan={6}>{category.label}</td>
                                            </tr>
                                            {items.map((item) => {
                                                const idx = globalIndex++;
                                                return (
                                                    <tr
                                                        key={idx}
                                                        data-index={idx}
                                                        className={idx === selectedIndex ? 'selected' : ''}
                                                    >
                                                        <td className="term-name">
                                                            {idx === selectedIndex && <span className="term-cursor">&gt; </span>}
                                                            {item.name}
                                                        </td>
                                                        <td>{item.weight} kg</td>
                                                        <td>{item.size}</td>
                                                        <td className={`term-legality ${item.legality.toLowerCase()}`}>{item.legality}</td>
                                                        <td className="term-attr">{item.attributes}</td>
                                                        <td className="term-cost">{item.cost} CR</td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
                <div className="term-footer">
                    [ARROW KEYS] Navigate  [ENTER] Buy  [ESC] Close
                </div>
            </div>
        </div>
    );
};
