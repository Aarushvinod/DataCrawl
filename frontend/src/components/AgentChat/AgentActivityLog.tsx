import { useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  XCircle,
  OctagonX,
  DollarSign,
  Clock,
} from 'lucide-react';
import api from '../../services/api';

interface AgentStep {
  id: string;
  agent_name: string;
  action: string;
  status: string;
  duration_seconds?: number;
  cost?: number;
  details?: string;
}

interface AgentActivityLogProps {
  projectId: string;
  runId: string;
  steps: AgentStep[];
  budgetSpent: number;
  budgetTotal: number;
  runStatus: string;
  onKilled: () => void;
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'completed':
      return <CheckCircle2 size={14} color="var(--color-success)" />;
    case 'failed':
      return <XCircle size={14} color="var(--color-error)" />;
    default:
      return <Clock size={14} color="var(--text-secondary)" />;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function AgentActivityLog({
  projectId,
  runId,
  steps,
  budgetSpent,
  budgetTotal,
  runStatus,
  onKilled,
}: AgentActivityLogProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [killing, setKilling] = useState(false);

  function toggleStep(stepId: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }

  async function handleKillRun() {
    if (!confirm('Are you sure you want to kill this run?')) return;
    setKilling(true);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/kill`);
      onKilled();
    } catch {
      // Kill failed
    } finally {
      setKilling(false);
    }
  }

  const budgetPct = budgetTotal > 0
    ? Math.min((budgetSpent / budgetTotal) * 100, 100)
    : 0;

  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-blue)';

  const isRunning = runStatus === 'running' || runStatus === 'awaiting_approval';

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Agent Activity</span>
          {isRunning && (
            <button
              className="btn btn--danger"
              onClick={handleKillRun}
              disabled={killing}
              style={{ padding: '4px 12px', fontSize: 12 }}
            >
              <OctagonX size={14} />
              {killing ? 'Killing...' : 'Kill Run'}
            </button>
          )}
        </div>

        {/* Budget meter */}
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <DollarSign size={12} />
              Budget
            </span>
            <span className="mono">
              ${budgetSpent.toFixed(2)} / ${budgetTotal.toFixed(2)}
            </span>
          </div>
          <div className="budget-meter">
            <div
              className="budget-meter__fill"
              style={{
                width: `${budgetPct}%`,
                backgroundColor: budgetColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        {steps.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              padding: '24px 0',
              fontSize: 13,
            }}
          >
            No agent steps yet.
          </div>
        )}
        {steps.map((step) => {
          const isExpanded = expandedSteps.has(step.id);
          return (
            <div
              key={step.id}
              style={{
                marginBottom: 6,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              <div
                onClick={() => toggleStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {isExpanded ? (
                  <ChevronDown size={14} color="var(--text-secondary)" />
                ) : (
                  <ChevronRight size={14} color="var(--text-secondary)" />
                )}
                <Bot size={14} color="var(--accent-blue)" />
                <span
                  style={{
                    flex: 1,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {step.agent_name}
                </span>
                <StepStatusIcon status={step.status} />
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}
                >
                  {formatDuration(step.duration_seconds)}
                </span>
                {step.cost !== undefined && (
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 45, textAlign: 'right' }}
                  >
                    ${step.cost.toFixed(3)}
                  </span>
                )}
              </div>

              {isExpanded && (
                <div
                  style={{
                    padding: '0 12px 10px 38px',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <strong>Action:</strong> {step.action}
                  </div>
                  {step.details && (
                    <pre
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        backgroundColor: 'var(--bg-surface)',
                        padding: 8,
                        borderRadius: 'var(--radius-sm)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        marginTop: 6,
                      }}
                    >
                      {step.details}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
