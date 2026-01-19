import React from 'react';
import type { Proposal } from '../AdminDashboard';
import { ProposalPreview } from './ProposalPreview';

interface ApprovalsTabProps {
    proposals: Proposal[];
    approveProposal: (id: string) => void;
    rejectProposal: (id: string) => void;
}

export const ApprovalsTab: React.FC<ApprovalsTabProps> = ({ proposals, approveProposal, rejectProposal }) => {
    return (
        <div className="admin-grid">
            {proposals.length === 0 ? (
                <div className="admin-card" style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                    <h3>No Pending Proposals</h3>
                    <p>The Director is either paused or generating content within safe limits.</p>
                </div>
            ) : (
                proposals.map(p => (
                    <div key={p.id} className="admin-card proposal-card">
                        <div className="proposal-header">
                            <span className="proposal-type">{p.type}</span>
                            <span className="proposal-source" style={{
                                marginLeft: '1rem',
                                display: 'flex',
                                gap: '0.5rem',
                                flexWrap: 'wrap'
                            }}>
                                {p.models ? (
                                    Object.entries(p.models).map(([role, model]) => (
                                        <span key={role} style={{
                                            fontSize: '0.7rem',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            color: role === 'Creative' ? '#00ffcc' : role === 'Logic' ? '#ffcc00' : '#ff00ff',
                                            border: `1px solid ${role === 'Creative' ? 'rgba(0, 255, 204, 0.2)' : role === 'Logic' ? 'rgba(255, 204, 0.2)' : 'rgba(255, 0, 255, 0.2)'}`
                                        }}>
                                            <span style={{ opacity: 0.5, marginRight: '4px' }}>{role}:</span>
                                            {model}
                                        </span>
                                    ))
                                ) : (
                                    <span style={{
                                        fontSize: '0.75rem',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        color: '#00ffcc',
                                        border: '1px solid rgba(0, 255, 204, 0.2)'
                                    }}>
                                        {p.generatedBy}
                                    </span>
                                )}
                                {p.models && p.generatedBy !== 'Director' && (
                                    <span style={{
                                        fontSize: '0.7rem',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        color: '#fff',
                                        opacity: 0.6
                                    }}>
                                        via {p.generatedBy}
                                    </span>
                                )}
                            </span>
                            <span className="proposal-id" style={{
                                marginLeft: 'auto',
                                opacity: 0.2,
                                fontSize: '0.6rem',
                                fontFamily: 'monospace'
                            }}>ID: {p.id}</span>
                        </div>
                        <div className="proposal-content">
                            <ProposalPreview proposal={p} />
                            {p.flavor?.rationale && (
                                <div className="proposal-rationale">
                                    <strong>Director's Rationale:</strong>
                                    <p>{p.flavor.rationale}</p>
                                </div>
                            )}
                        </div>
                        <div className="proposal-actions">
                            <button className="btn-approve" onClick={() => approveProposal(p.id)}>APPROVE & PUBLISH</button>
                            <button className="btn-reject" onClick={() => rejectProposal(p.id)}>REJECT</button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};
