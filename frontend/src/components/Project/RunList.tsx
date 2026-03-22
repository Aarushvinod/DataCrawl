import { AlertCircle, CheckCircle2, Clock, Play, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { RunSummary } from '../../services/normalizers';
import { formatGenerationModeLabel, formatStatusLabel } from '../AgentChat/uiLabels';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';

interface RunListProps {
  projectId: string;
  runs: RunSummary[];
  onDeleted: () => void;
}

function statusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Play size={14} color="var(--accent-primary)" />;
    case 'completed':
      return <CheckCircle2 size={14} color="var(--color-success)" />;
    case 'failed':
      return <XCircle size={14} color="var(--color-error)" />;
    case 'awaiting_approval':
      return <AlertCircle size={14} color="var(--color-warning)" />;
    default:
      return <Clock size={14} color="var(--text-secondary)" />;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'running':
      return 'badge badge--running';
    case 'completed':
      return 'badge badge--completed';
    case 'failed':
      return 'badge badge--failed';
    case 'awaiting_approval':
      return 'badge badge--awaiting';
    default:
      return 'badge badge--pending';
  }
}

function canDeleteRun(status: string) {
  return ![
    'planning',
    'approved',
    'running',
    'awaiting_approval',
    'awaiting_user_input',
    'awaiting_paid_approval',
  ].includes(status);
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export default function RunList({ projectId, runs, onDeleted }: RunListProps) {
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(event: React.MouseEvent, runId: string) {
    event.stopPropagation();
    if (!confirm('Delete this run? Datasets that were already created will stay in place.')) {
      return;
    }

    setDeletingId(runId);
    try {
      await api.delete(`/api/projects/${projectId}/runs/${runId}`);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (runs.length === 0) {
    return (
      <div className="dc-empty-state">
        <div className="dc-empty-state__spider" />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No runs yet</div>
          <div style={{ color: 'var(--text-secondary)' }}>Start a run to collect real data or generate a synthetic dataset.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dc-list">
      {runs.map((run) => {
        const isLive = ['running', 'planning', 'awaiting_approval', 'approved'].includes(run.status);
        const runModeClass = run.generation_mode === 'synthetic' ? 'dc-run-row--synthetic' : 'dc-run-row--real';
        return (
          <div
            key={run.id}
            className={`card dc-run-row ${runModeClass}${isLive ? ' dc-run-row--live' : ''}`}
            onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate(`/projects/${projectId}/runs/${run.id}`);
              }
            }}
          >
            {isLive && run.generation_mode !== 'synthetic' && (
              <ActionSpiderAccent variant="trace" className="dc-run-row__spider" />
            )}
            {(isLive || run.generation_mode === 'synthetic') && (
              <ConsoleAmbientDigits
                variant="card"
                tone={run.generation_mode === 'synthetic' ? 'secondary' : 'primary'}
                className="dc-run-row__ambient"
              />
            )}

            <div className="dc-run-row__top">
              <div>
                <h3 className="dc-run-row__title">{run.name}</h3>
                <div className="dc-run-mode" style={{ marginTop: 8 }}>
                  {run.generation_mode === 'synthetic' ? 'Synthetic finance build' : 'Market crawl route'}
                </div>
              </div>
              <span className={statusBadge(run.status)}>{formatStatusLabel(run.status)}</span>
            </div>

            <div className="dc-run-row__meta">
              <div style={{ color: 'var(--text-secondary)' }}>
                {run.created_at ? new Date(run.created_at).toLocaleString() : 'Ready to start'}
              </div>
              <div className="dc-run-row__signal-grid">
                <div className="dc-run-row__signal">
                  <span className="dc-run-row__signal-label">Mode</span>
                  <strong>{formatGenerationModeLabel(run.generation_mode)}</strong>
                </div>
                <div className="dc-run-row__signal">
                  <span className="dc-run-row__signal-label">Time in motion</span>
                  <strong>{formatDuration(run.duration_seconds)}</strong>
                </div>
                <div className="dc-run-row__signal">
                  <span className="dc-run-row__signal-label">Spend</span>
                  <strong>{run.cost !== undefined ? `$${run.cost.toFixed(2)}` : 'Pending'}</strong>
                </div>
              </div>
              <div className="dc-run-row__footer">
                <span className="dc-tag">{statusIcon(run.status)} {isLive ? 'Route in motion' : 'Route recorded'}</span>
                <span className="dc-tag">{formatGenerationModeLabel(run.generation_mode)}</span>
                {canDeleteRun(run.status) && (
                  <button
                    className="btn btn--ghost"
                    onClick={(event) => void handleDelete(event, run.id)}
                    disabled={deletingId === run.id}
                    title="Delete run"
                    style={{ paddingInline: 12, color: 'var(--color-error)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
