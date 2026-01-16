import React from 'react';
import type { LogEntry } from '../AdminDashboard';

interface LogsTabProps {
    logs: LogEntry[];
}

export const LogsTab: React.FC<LogsTabProps> = ({ logs }) => {
    return (
        <div className="admin-card" style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginBottom: '1rem' }}>Activity Log</h2>
            <div className="log-content" style={{
                overflowY: 'auto',
                flex: 1,
                maxHeight: 'calc(100vh - 300px)',
                paddingRight: '10px'
            }}>
                {logs.map((log, i) => (
                    <div key={i} className={`log-entry log-${log.level}`}>
                        <div className="log-meta">
                            <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span className={`log-source ${log.source === 'server' ? 'source-server' : 'source-director'}`}>
                                {log.source ? log.source.toUpperCase() : 'SYSTEM'}
                            </span>
                        </div>
                        <div className="log-message">
                            {log.message}
                            {log.context && (
                                <pre className="log-context">
                                    {JSON.stringify(log.context, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
