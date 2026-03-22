import { useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Loader2,
  OctagonX,
  XCircle,
} from 'lucide-react';
import api from '../../services/api';
import { formatActionLabel, formatAgentLabel, formatPhaseLabel } from './uiLabels';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

interface AgentStep {
  id: string;
  agent_name: string;
  action: string;
  status: string;
  summary?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  cost?: number;
  details?: unknown;
}

interface AgentActivityLogProps {
  projectId: string;
  runId: string;
  steps: AgentStep[];
  budgetSpent: number;
  budgetTotal: number;
  runStatus: string;
  progressPercent: number;
  currentAgent: string;
  currentPhase: string;
  completedSteps: number;
  totalSteps: number;
  generationMode: string;
  onKilled: () => void;
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />;
    case 'completed':
      return <CheckCircle2 size={14} color="var(--color-success)" />;
    case 'killed':
      return <OctagonX size={14} color="var(--color-warning)" />;
    case 'failed':
      return <XCircle size={14} color="var(--color-error)" />;
    default:
      return <Clock size={14} color="var(--text-secondary)" />;
  }
}

function formatDuration(seconds?: number) {
  if (!seconds) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function sanitizeDetails(details: unknown) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return details;
  }

  const visibleDetails = { ...(details as Record<string, unknown>) };
  delete visibleDetails.thinking;
  delete visibleDetails.model;
  delete visibleDetails.model_used;
  delete visibleDetails.content_preview;
  delete visibleDetails.streaming;
  delete visibleDetails.script_preview;
  return Object.keys(visibleDetails).length > 0 ? visibleDetails : null;
}

export default function AgentActivityLog({
  projectId,
  runId,
  steps,
  budgetSpent,
  budgetTotal,
  runStatus,
  progressPercent,
  currentAgent,
  currentPhase,
  completedSteps,
  totalSteps,
  generationMode,
  onKilled,
}: AgentActivityLogProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState(false);
  const budgetPct = budgetTotal > 0 ? Math.min((budgetSpent / budgetTotal) * 100, 100) : 0;
  const budgetColor =
    budgetPct > 90
      ? 'var(--color-error)'
      : budgetPct > 70
        ? 'var(--color-warning)'
        : 'var(--accent-primary)';
  const isRunning = ['planning', 'awaiting_approval', 'approved', 'running'].includes(runStatus);
  const railSignals = [
    {
      label: 'Budget',
      value: `$${budgetSpent.toFixed(2)}`,
      note: `of $${budgetTotal.toFixed(2)}`,
      icon: <DollarSign size={12} />,
      tone: budgetPct > 70 ? 'warning' as const : 'secondary' as const,
    },
    {
      label: 'Current route',
      value: currentAgent ? formatAgentLabel(currentAgent) : formatPhaseLabel(currentPhase),
      note: formatPhaseLabel(currentPhase),
      icon: <Bot size={12} />,
      tone: 'primary' as const,
    },
    {
      label: 'Path progress',
      value: totalSteps > 0 ? `${completedSteps}/${totalSteps}` : `${progressPercent}%`,
      note: totalSteps > 0 ? 'steps completed' : 'route complete',
      icon: <Clock size={12} />,
      tone: 'success' as const,
    },
  ];

  async function handleKillRun() {
    if (!confirm('Stop this run?')) {
      return;
    }

    setStopping(true);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/kill`);
      onKilled();
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="dc-activity">
      <div className="dc-activity__header">
        <ConsoleAmbientDigits variant="card" tone="mixed" className="dc-activity__ambient" />
        {isRunning && generationMode !== 'synthetic' && (
          <ActionSpiderAccent variant="watch" className="dc-activity__spider" />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p className="dc-section__eyebrow" style={{ marginBottom: 8 }}>Run activity</p>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Search rail</h2>
          </div>
          {isRunning && (
            <button className="btn btn--danger" onClick={() => void handleKillRun()} disabled={stopping}>
              <OctagonX size={14} />
              {stopping ? 'Stopping...' : 'Stop run'}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <SignalStrip items={railSignals} compact />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DollarSign size={12} /> Budget</span>
              <span className="mono">{`$${budgetSpent.toFixed(2)} / $${budgetTotal.toFixed(2)}`}</span>
            </div>
            <div className="budget-meter"><div className="budget-meter__fill" style={{ width: `${budgetPct}%`, backgroundColor: budgetColor }} /></div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>{currentAgent ? `${formatPhaseLabel(currentPhase)} - ${formatAgentLabel(currentAgent)}` : formatPhaseLabel(currentPhase)}</span>
              <span className="mono">{totalSteps > 0 ? `${completedSteps}/${totalSteps}` : `${progressPercent}%`}</span>
            </div>
            <div className="budget-meter"><div className="budget-meter__fill" style={{ width: `${progressPercent}%`, backgroundColor: 'var(--accent-secondary)' }} /></div>
          </div>
        </div>
      </div>

      <div className="dc-activity__stream">
        {steps.length === 0 && <div className="dc-empty-state" style={{ minHeight: 220 }}><div>No updates yet.</div></div>}

        {steps.map((step) => {
          const isExpanded = expandedSteps.has(step.id);
          const visibleDetails = sanitizeDetails(step.details);
          return (
            <div key={step.id} className="dc-activity-step">
              <div
                className="dc-activity-step__summary"
                onClick={() => {
                  setExpandedSteps((current) => {
                    const next = new Set(current);
                    if (next.has(step.id)) {
                      next.delete(step.id);
                    } else {
                      next.add(step.id);
                    }
                    return next;
                  });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setExpandedSteps((current) => {
                      const next = new Set(current);
                      if (next.has(step.id)) {
                        next.delete(step.id);
                      } else {
                        next.add(step.id);
                      }
                      return next;
                    });
                  }
                }}
              >
                {isExpanded ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}
                <Bot size={14} color="var(--accent-primary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{formatAgentLabel(step.agent_name)}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{formatActionLabel(step.action)}</div>
                </div>
                <StepStatusIcon status={step.status} />
                <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDuration(step.duration_seconds)}</span>
                {step.cost !== undefined && <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{`$${step.cost.toFixed(3)}`}</span>}
              </div>

              {isExpanded && (
                <div className="dc-activity-step__details">
                  {step.summary && <div style={{ marginBottom: 8 }}><strong>Summary:</strong> {step.summary}</div>}
                  {visibleDetails !== null && visibleDetails !== undefined && (
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 14,
                        background: 'rgba(4, 8, 7, 0.92)',
                        border: '1px solid rgba(127, 255, 178, 0.12)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                      }}
                    >
                      {typeof visibleDetails === 'string' ? visibleDetails : JSON.stringify(visibleDetails, null, 2)}
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
