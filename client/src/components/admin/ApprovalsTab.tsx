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
                            <span className="proposal-id">{p.id}</span>
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
