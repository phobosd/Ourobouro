import React from 'react';

interface SnapshotsTabProps {
    snapshots: string[];
    createSnapshot: () => void;
    handleSnapshotAction: (type: 'restore' | 'delete', id: string) => void;
    confirmAction: { type: 'restore' | 'delete', id: string, step: number } | null;
}

export const SnapshotsTab: React.FC<SnapshotsTabProps> = ({ snapshots, createSnapshot, handleSnapshotAction, confirmAction }) => {
    return (
        <div className="admin-grid">
            <div className="admin-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0 }}>System Snapshots</h2>
                    <button className="action-btn" onClick={createSnapshot}>CREATE SNAPSHOT</button>
                </div>
                <div className="snapshot-list">
                    {snapshots.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No snapshots found.</div>
                    ) : (
                        snapshots.map(id => (
                            <div key={id} className="snapshot-item">
                                <span className="snapshot-name">{id}</span>
                                <div className="snapshot-actions">
                                    <button
                                        className="btn-restore"
                                        onClick={() => handleSnapshotAction('restore', id)}
                                        disabled={confirmAction !== null && confirmAction.id !== id}
                                    >
                                        {confirmAction?.id === id && confirmAction?.type === 'restore'
                                            ? (confirmAction.step === 1 ? 'CONFIRM?' : 'REALLY?')
                                            : 'RESTORE'
                                        }
                                    </button>
                                    <button
                                        className="btn-delete"
                                        onClick={() => handleSnapshotAction('delete', id)}
                                        disabled={confirmAction !== null && confirmAction.id !== id}
                                    >
                                        {confirmAction?.id === id && confirmAction?.type === 'delete'
                                            ? (confirmAction.step === 1 ? 'CONFIRM?' : 'REALLY?')
                                            : 'DELETE'
                                        }
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
