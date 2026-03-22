import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatAgentLabel, formatPhaseLabel } from './uiLabels';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';

interface AgentStep {
  id: string;
  agent_name: string;
  action: string;
  status: string;
  summary?: string;
  details?: unknown;
}

interface LiveReasoningPanelProps {
  runStatus: string;
  currentAgent: string;
  currentPhase: string;
  currentTask?: Record<string, unknown> | null;
  steps: AgentStep[];
}

function getActiveStep(steps: AgentStep[]) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].status === 'running') {
      return steps[index];
    }
  }
  return steps.length > 0 ? steps[steps.length - 1] : null;
}

function getDetailsObject(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  return details as Record<string, unknown>;
}

function getDetailsString(details: unknown, key: string) {
  const value = getDetailsObject(details)?.[key];
  return typeof value === 'string' ? value : '';
}

function abbreviateSource(value: string) {
  try {
    const parsed = new URL(value);
    const shortened = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
    return shortened.length > 72 ? `${shortened.slice(0, 69)}...` : shortened;
  } catch {
    return value.length > 72 ? `${value.slice(0, 69)}...` : value;
  }
}

function formatCurrentJob(
  currentTask: Record<string, unknown> | null | undefined,
  activeStep: AgentStep | null,
) {
  const action =
    typeof currentTask?.action === 'string'
      ? currentTask.action.replace(/_/g, ' ')
      : activeStep?.summary || activeStep?.action?.replace(/_/g, ' ') || '';
  const target =
    typeof currentTask?.target_data === 'string'
      ? currentTask.target_data
      : typeof currentTask?.task_description === 'string'
        ? currentTask.task_description
        : typeof currentTask?.use_case === 'string'
          ? currentTask.use_case
          : '';
  const source =
    typeof currentTask?.source === 'string'
      ? currentTask.source
      : typeof currentTask?.url === 'string'
        ? currentTask.url
        : '';

  const parts = [action, target, source ? `from ${abbreviateSource(source)}` : ''].filter(Boolean);
  return parts.join(' | ') || 'Waiting for the next step';
}

export default function LiveReasoningPanel({
  runStatus,
  currentAgent,
  currentPhase,
  currentTask,
  steps,
}: LiveReasoningPanelProps) {
  const isLiveRun = ['planning', 'awaiting_approval', 'approved', 'running'].includes(runStatus);
  const activeStep = isLiveRun ? getActiveStep(steps) : null;
  const activeAgent = currentAgent || activeStep?.agent_name || '';
  const traceTarget = getDetailsString(activeStep?.details, 'thinking');
  const contentPreview = getDetailsString(activeStep?.details, 'content_preview');
  const [displayedTrace, setDisplayedTrace] = useState('');
  const traceViewportRef = useRef<HTMLDivElement>(null);
  const lastTraceKeyRef = useRef('');
  const traceKey = activeStep ? `${activeStep.id}:${activeAgent}` : activeAgent;

  useEffect(() => {
    if (!traceTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedTrace('');
      lastTraceKeyRef.current = traceKey;
      return;
    }

    if (lastTraceKeyRef.current !== traceKey) {
      lastTraceKeyRef.current = traceKey;
      setDisplayedTrace('');
      return;
    }

    setDisplayedTrace((previous) => (traceTarget.startsWith(previous) ? previous : ''));
  }, [traceKey, traceTarget]);

  useEffect(() => {
    if (!traceTarget) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setDisplayedTrace((previous) => {
        if (!traceTarget.startsWith(previous)) {
          return '';
        }
        if (previous.length >= traceTarget.length) {
          return previous;
        }
        const remaining = traceTarget.length - previous.length;
        const increment = remaining > 160 ? 5 : remaining > 60 ? 3 : remaining > 20 ? 2 : 1;
        return traceTarget.slice(0, previous.length + increment);
      });
    }, 72);

    return () => window.clearInterval(intervalId);
  }, [traceKey, traceTarget]);

  useEffect(() => {
    const viewport = traceViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [displayedTrace]);

  if (!isLiveRun) {
    return null;
  }

  const jobLabel = formatCurrentJob(currentTask, activeStep);
  const showCaret = isLiveRun && Boolean(traceTarget);
  const emptyState = contentPreview || (isLiveRun ? 'Waiting for the next update...' : 'No live notes were recorded for this step.');

  return (
    <div className="dc-live-notes">
      <ConsoleAmbientDigits variant="card" tone="mixed" className="dc-live-notes__ambient" />
      <div className="dc-page-header__copy" style={{ gap: 6 }}>
        <p className="dc-section__eyebrow">Search notes</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '70%' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Current route</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{jobLabel}</div>
          </div>
          <div style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>
            <div>{formatAgentLabel(activeAgent) || 'Assistant'}</div>
            <div style={{ marginTop: 4 }}>{formatPhaseLabel(currentPhase || 'idle')}</div>
          </div>
        </div>
      </div>

      <div ref={traceViewportRef} className="dc-live-notes__viewer">
        {displayedTrace ? (
          <>
            {displayedTrace}
            {showCaret && <span style={{ display: 'inline-block', marginLeft: 3 }}>|</span>}
          </>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
            {isLiveRun && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {emptyState}
          </span>
        )}
      </div>
    </div>
  );
}
