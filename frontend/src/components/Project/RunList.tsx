import { useNavigate } from 'react-router-dom';
import { Play, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { RunSummary } from '../../services/normalizers';

interface RunListProps {
  projectId: string;
  runs: RunSummary[];
}

function statusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Play size={14} color="var(--accent-blue)" />;
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

function statusBadge(status: string): string {
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

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function RunList({ projectId, runs }: RunListProps) {
  const navigate = useNavigate();

  if (runs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
        No runs yet. Start a new run to begin collecting data.
      </div>
    );
  }

  return (
    <div>
      {runs.map((run) => (
        <div
          key={run.id}
          className="card"
          onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
          style={{
            cursor: 'pointer',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-blue)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
          }}
        >
          {statusIcon(run.status)}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{run.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {run.created_at ? new Date(run.created_at).toLocaleString() : 'Not started yet'}
            </div>
          </div>

          <span className={statusBadge(run.status)}>{run.status.replace('_', ' ')}</span>

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              minWidth: 60,
              textAlign: 'right',
            }}
          >
            {formatDuration(run.duration_seconds)}
          </div>

          {run.cost !== undefined && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                minWidth: 60,
                textAlign: 'right',
              }}
            >
              ${run.cost.toFixed(2)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
