import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

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

const AGENT_MODEL_LABELS: Record<string, string> = {
  orchestrator: 'gemini-3.1-pro-preview',
  compliance: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
  script_writer: 'Qwen/Qwen3.5-397B-A17B',
  web_crawler: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  synthetic_generator: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  normalizer: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
  validator: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
};

function getActiveStep(steps: AgentStep[]): AgentStep | null {
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

function getDetailsString(details: unknown, key: string): string {
  const value = getDetailsObject(details)?.[key];
  return typeof value === 'string' ? value : '';
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

function abbreviateSource(value: string): string {
  try {
    const parsed = new URL(value);
    const shortened = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
    return shortened.length > 68 ? `${shortened.slice(0, 65)}...` : shortened;
  } catch {
    return value.length > 68 ? `${value.slice(0, 65)}...` : value;
  }
}

function formatCurrentJob(
  currentTask: Record<string, unknown> | null | undefined,
  activeStep: AgentStep | null,
): string {
  const fragments: string[] = [];
  const action =
    typeof currentTask?.action === 'string'
      ? humanize(currentTask.action)
      : activeStep?.summary || (activeStep ? humanize(activeStep.action) : '');
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
  const sourceMode =
    currentTask?.source_mode === 'api_code'
      ? 'via API/code'
      : currentTask?.source_mode === 'web_scraping'
        ? 'via web scraping'
        : '';

  if (action) {
    fragments.push(action);
  }
  if (target) {
    fragments.push(target);
  }
  if (source) {
    fragments.push(`from ${abbreviateSource(source)}`);
  }
  if (sourceMode) {
    fragments.push(sourceMode);
  }

  return fragments.join(' • ') || 'Waiting for the next step';
}

export default function LiveReasoningPanel({
  runStatus,
  currentAgent,
  currentPhase,
  currentTask,
  steps,
}: LiveReasoningPanelProps) {
  const activeStep = getActiveStep(steps);
  const activeAgent = currentAgent || activeStep?.agent_name || '';
  const modelLabel =
    getDetailsString(activeStep?.details, 'model') ||
    getDetailsString(activeStep?.details, 'model_used') ||
    AGENT_MODEL_LABELS[activeAgent] ||
    '';
  const traceTarget = getDetailsString(activeStep?.details, 'thinking');
  const contentPreview = getDetailsString(activeStep?.details, 'content_preview');
  const [displayedTrace, setDisplayedTrace] = useState('');
  const traceViewportRef = useRef<HTMLDivElement>(null);
  const lastTraceKeyRef = useRef('');
  const isLiveRun = ['planning', 'awaiting_approval', 'approved', 'running'].includes(runStatus);
  const traceKey = activeStep ? `${activeStep.id}:${activeAgent}` : activeAgent;

  useEffect(() => {
    if (!traceTarget) {
      setDisplayedTrace('');
      lastTraceKeyRef.current = traceKey;
      return;
    }

    if (lastTraceKeyRef.current !== traceKey) {
      lastTraceKeyRef.current = traceKey;
      setDisplayedTrace('');
      return;
    }

    setDisplayedTrace((previous) => (
      traceTarget.startsWith(previous) ? previous : ''
    ));
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
        const increment = remaining > 160 ? 10 : remaining > 60 ? 6 : remaining > 20 ? 3 : 1;
        return traceTarget.slice(0, previous.length + increment);
      });
    }, 18);

    return () => window.clearInterval(intervalId);
  }, [traceKey, traceTarget]);

  useEffect(() => {
    const viewport = traceViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [displayedTrace]);

  if (!isLiveRun && !traceTarget && !contentPreview && !currentTask && !activeStep) {
    return null;
  }

  const jobLabel = formatCurrentJob(currentTask, activeStep);
  const traceText = displayedTrace || '';
  const emptyState = contentPreview || (isLiveRun ? 'Waiting for a live reasoning trace…' : 'No live reasoning recorded.');
  const showCaret = isLiveRun && Boolean(traceTarget);

  return (
    <div
      style={{
        padding: '12px 20px 14px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      <style>{`
        @keyframes trace-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div
        style={{
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Current job
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.4,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
              }}
            >
              {jobLabel}
            </div>
          </div>
          <div
            style={{
              minWidth: 160,
              textAlign: 'right',
              color: 'var(--text-secondary)',
              fontSize: 12,
            }}
          >
            <div>{activeAgent || currentPhase || 'idle'}</div>
            {modelLabel && (
              <div
                className="mono"
                style={{
                  marginTop: 4,
                  wordBreak: 'break-word',
                }}
              >
                {modelLabel}
              </div>
            )}
          </div>
        </div>

        <div
          ref={traceViewportRef}
          style={{
            minHeight: 132,
            maxHeight: 196,
            overflow: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            padding: '12px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {traceText ? (
            <>
              {traceText}
              {showCaret && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    marginLeft: 1,
                    animation: 'trace-caret 1s steps(1) infinite',
                  }}
                >
                  |
                </span>
              )}
            </>
          ) : (
            <span
              style={{
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isLiveRun && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {emptyState}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
