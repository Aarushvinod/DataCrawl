import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../../services/api';
import ChatMessage from './ChatMessage';
import PlanApproval from './PlanApproval';
import AgentActivityLog from './AgentActivityLog';
import LiveReasoningPanel from './LiveReasoningPanel';
import RunInputRequest from './RunInputRequest';
import PaidApprovalRequest from './PaidApprovalRequest';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

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

interface PlanStep {
  description: string;
  agent?: string;
  estimated_cost?: number;
}

interface StructuredRequest {
  request_id: string;
  type?: string;
  title?: string;
  instructions?: string;
  fields?: Array<{
    id: string;
    label?: string;
    input_type?: string;
    placeholder?: string;
    required?: boolean;
    help_text?: string;
  }>;
  provider?: string;
}

interface PaidApprovalRequestPayload {
  request_id: string;
  provider?: string;
  live_price?: {
    amount?: number;
    currency?: string;
    cadence?: string;
    source?: string;
  };
  planned_price?: number | null;
  reason?: string;
  payment_unlocks?: string;
  free_alternatives?: string[];
  requires_manual_checkout?: boolean;
  manual_checkout_instructions?: string;
  checkout_url?: string;
}

interface RunDoc {
  id: string;
  status: string;
  messages: Message[];
  agent_logs: AgentStep[];
  budget_spent: number;
  budget_total: number;
  current_phase: string;
  current_agent: string;
  current_task?: Record<string, unknown> | null;
  pending_input_request?: StructuredRequest | null;
  pending_paid_approval?: PaidApprovalRequestPayload | null;
  budget_analysis?: Record<string, unknown> | null;
  plan_version?: number;
  active_plan_step_id?: string | null;
  retry_counters?: Record<string, number>;
  progress_percent: number;
  total_steps: number;
  completed_steps: number;
  error?: string | null;
  plan?: {
    description?: string;
    steps: PlanStep[];
    estimated_cost?: number;
  };
}

export default function AgentChat() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [run, setRun] = useState<RunDoc | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchFallback = useCallback(async () => {
    if (!projectId || !runId) return;
    try {
      const data = await api.get<RunDoc>(`/api/projects/${projectId}/runs/${runId}`);
      setRun(data);
    } catch {
      // Failed to fetch
    }
  }, [projectId, runId]);

  useEffect(() => {
    fetchFallback();
  }, [fetchFallback]);

  useEffect(() => {
    if (!run || !projectId || !runId) return;
    if (!['planning', 'awaiting_approval', 'approved', 'running', 'awaiting_user_input', 'awaiting_paid_approval'].includes(run.status)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchFallback();
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [fetchFallback, projectId, run, runId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [run?.messages]);

  async function handleSend() {
    if (!inputValue.trim() || !projectId || !runId || sending) return;

    const message = inputValue.trim();
    setInputValue('');
    setSending(true);

    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/message`, {
        message,
      });
      await fetchFallback();
    } catch {
      // Send failed
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleApproved() {
    void fetchFallback();
  }

  const messages = run?.messages || [];
  const steps = run?.agent_logs || [];
  const isAwaitingApproval = run?.status === 'awaiting_approval';
  const isAwaitingStructuredInput = run?.status === 'awaiting_user_input' && Boolean(run?.pending_input_request);
  const isAwaitingPaidApproval = run?.status === 'awaiting_paid_approval' && Boolean(run?.pending_paid_approval);
  const isActive =
    run?.status === 'planning' ||
    run?.status === 'running' ||
    run?.status === 'awaiting_approval' ||
    run?.status === 'approved';
  const inputPlaceholder = messages.length === 0
    ? 'Describe what data you want to collect...'
    : isActive
      ? 'Type a message...'
      : 'Run is not active';

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', margin: '-24px -32px' }}>
      {/* Left: Chat */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            className="btn btn--ghost"
            onClick={() => navigate(`/projects/${projectId}`)}
            style={{ padding: 4 }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Run {runId?.slice(0, 8)}</div>
            {run && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span
                  className={`badge badge--${run.status === 'running' ? 'running' : run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : run.status === 'awaiting_approval' ? 'awaiting' : 'pending'}`}
                  style={{ fontSize: 11 }}
                >
                  {run.status.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {run.current_agent ? `Current agent: ${run.current_agent}` : run.current_phase}
                </span>
              </div>
            )}
          </div>
        </div>

        {run && (
          <div
            style={{
              padding: '10px 20px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              <span>{run.current_phase || 'idle'}</span>
              <span>{run.progress_percent}%</span>
            </div>
            <div className="budget-meter">
              <div
                className="budget-meter__fill"
                style={{
                  width: `${run.progress_percent}%`,
                  backgroundColor: 'var(--accent-blue)',
                }}
              />
            </div>
          </div>
        )}

        {run && (
          <LiveReasoningPanel
            runStatus={run.status}
            currentAgent={run.current_agent}
            currentPhase={run.current_phase}
            currentTask={run.current_task}
            steps={steps}
          />
        )}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 20px',
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                padding: '40px 0',
                fontSize: 14,
              }}
            >
              Send a message to start the agent run. Describe what data you want to collect.
            </div>
          )}

          {messages.map((msg, index) => (
            <ChatMessage
              key={msg.id || `${msg.role}-${index}`}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}

          {isAwaitingApproval && run?.plan && projectId && runId && (
            <PlanApproval
              projectId={projectId}
              runId={runId}
              plan={run.plan}
              onApproved={handleApproved}
            />
          )}

          {isAwaitingStructuredInput && projectId && runId && run?.pending_input_request && (
            <RunInputRequest
              projectId={projectId}
              runId={runId}
              request={run.pending_input_request}
              onResolved={handleApproved}
            />
          )}

          {isAwaitingPaidApproval && projectId && runId && run?.pending_paid_approval && (
            <PaidApprovalRequest
              projectId={projectId}
              runId={runId}
              request={run.pending_paid_approval}
              onResolved={handleApproved}
            />
          )}

          {run?.error && run.status === 'failed' && (
            <div
              className="card"
              style={{ marginTop: 12, borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
            >
              {run.error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              disabled={(!isActive && messages.length > 0) || isAwaitingStructuredInput || isAwaitingPaidApproval}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                minHeight: 40,
                maxHeight: 120,
                padding: '10px 14px',
              }}
            />
            <button
              className="btn btn--primary"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending || !isActive || isAwaitingStructuredInput || isAwaitingPaidApproval}
              style={{ height: 40, width: 40, padding: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Activity Log */}
      <div style={{ width: 380, minWidth: 380 }}>
        <AgentActivityLog
          projectId={projectId || ''}
          runId={runId || ''}
          steps={steps}
          budgetSpent={run?.budget_spent || 0}
          budgetTotal={run?.budget_total || 0}
          runStatus={run?.status || 'pending'}
          progressPercent={run?.progress_percent || 0}
          currentAgent={run?.current_agent || ''}
          currentPhase={run?.current_phase || 'idle'}
          completedSteps={run?.completed_steps || 0}
          totalSteps={run?.total_steps || 0}
          onKilled={handleApproved}
        />
      </div>
    </div>
  );
}
