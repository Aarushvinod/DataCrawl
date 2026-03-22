import { ArrowLeft, Database, Radar, Send, Wallet } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import AgentActivityLog from './AgentActivityLog';
import ChatMessage from './ChatMessage';
import LiveReasoningPanel from './LiveReasoningPanel';
import PaidApprovalRequest from './PaidApprovalRequest';
import PlanApproval from './PlanApproval';
import RunInputRequest from './RunInputRequest';
import SolanaPaymentRequest from './SolanaPaymentRequest';
import {
  formatAgentLabel,
  formatGenerationModeLabel,
  formatPhaseLabel,
  formatStatusLabel,
} from './uiLabels';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

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
  provider?: string;
  instructions?: string;
  payment_url?: string;
  amount?: string;
  amount_base_units?: number;
  asset?: string;
  network?: string;
  mint?: string;
  recipient?: string;
  reference?: string;
  memo?: string;
  expected_payer?: string;
  expires_at?: string;
  selected_payment_method_id?: string;
  selected_payment_method?: Record<string, unknown>;
  fields?: Array<{
    id: string;
    label?: string;
    input_type?: string;
    placeholder?: string;
    required?: boolean;
    help_text?: string;
  }>;
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
  supported_payment_methods?: string[];
  solana_payment_request?: {
    recipient?: string;
    amount?: string;
    network?: string;
    mint?: string;
    memo?: string;
    reference?: string;
  } | null;
}

interface RunDoc {
  id: string;
  status: string;
  generation_mode?: string;
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
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reviewSurfaceRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const reviewScrollTopRef = useRef<number | null>(null);
  const lastReviewKeyRef = useRef('idle');
  const previousRunStatusRef = useRef<string | null>(null);
  const messages = run?.messages || [];
  const steps = run?.agent_logs || [];

  const fetchRun = useCallback(async () => {
    if (!projectId || !runId) {
      return;
    }

    const data = await api.get<RunDoc>(`/api/projects/${projectId}/runs/${runId}`);
    setRun(data);
  }, [projectId, runId]);

  useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    if (!run) {
      return undefined;
    }

    if (!['planning', 'approved', 'running'].includes(run.status)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void fetchRun();
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [fetchRun, run]);

  const lastMessage = messages.at(-1);
  const lastMessageKey = lastMessage
    ? `${lastMessage.id || ''}:${lastMessage.timestamp || ''}:${lastMessage.content.length}`
    : 'empty';

  const isAwaitingApproval = run?.status === 'awaiting_approval';
  const isAwaitingStructuredInput = run?.status === 'awaiting_user_input' && Boolean(run?.pending_input_request);
  const isAwaitingPaidApproval = run?.status === 'awaiting_paid_approval' && Boolean(run?.pending_paid_approval);
  const isAwaitingSolanaPayment = run?.pending_input_request?.type === 'solana_payment_confirmation';
  const isActive = run ? ['planning', 'running', 'awaiting_approval', 'approved'].includes(run.status) : false;
  const canContinueFinishedRun = run ? ['completed', 'failed', 'killed'].includes(run.status) : false;
  const canSendMessage = isActive || canContinueFinishedRun;
  const isSyntheticRun = run?.generation_mode === 'synthetic';
  const freezeChatAutoscroll = isAwaitingApproval || isAwaitingStructuredInput || isAwaitingPaidApproval;
  const reviewStateKey = run
    ? `${run.status}:${run.plan_version ?? 0}:${run.pending_input_request?.request_id ?? ''}:${run.pending_paid_approval?.request_id ?? ''}:${messages.length}`
    : 'idle';
  const headerSignals = run
    ? [
        {
          label: 'Route mode',
          value: formatGenerationModeLabel(run.generation_mode || 'real'),
          note: isSyntheticRun ? 'simulated finance build' : 'market crawl',
          icon: <Radar size={12} />,
          tone: isSyntheticRun ? 'secondary' as const : 'primary' as const,
        },
        {
          label: 'Progress',
          value: `${run.progress_percent}%`,
          note: run.total_steps > 0 ? `${run.completed_steps}/${run.total_steps} steps` : 'path warming up',
          icon: <Database size={12} />,
          tone: 'success' as const,
        },
        {
          label: 'Budget used',
          value: `$${run.budget_spent.toFixed(2)}`,
          note: `of $${run.budget_total.toFixed(2)}`,
          icon: <Wallet size={12} />,
          tone: run.budget_total > 0 && run.budget_spent / run.budget_total > 0.7 ? 'warning' as const : 'secondary' as const,
        },
      ]
    : [];
  const showActionSpider = !isSyntheticRun && Boolean(run && ['planning', 'awaiting_approval', 'approved', 'running'].includes(run.status));
  const inputPlaceholder = messages.length === 0
    ? isSyntheticRun
      ? 'Describe the synthetic finance data you want to create...'
      : 'Describe the data you want to collect...'
    : canContinueFinishedRun
      ? isSyntheticRun
        ? 'Describe the changes for the next synthetic dataset...'
        : 'Describe the changes for the next dataset...'
      : isActive
        ? 'Send a note to the run...'
        : 'This run is not active right now.';

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateStickiness = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 96;
      if (freezeChatAutoscroll) {
        reviewScrollTopRef.current = viewport.scrollTop;
      }
    };

    updateStickiness();
    viewport.addEventListener('scroll', updateStickiness);
    return () => viewport.removeEventListener('scroll', updateStickiness);
  }, [freezeChatAutoscroll]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.style.height = '0px';
    input.style.height = `${Math.min(140, Math.max(46, input.scrollHeight))}px`;
  }, [inputValue]);

  useEffect(() => {
    if (freezeChatAutoscroll || !shouldStickToBottomRef.current) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [freezeChatAutoscroll, lastMessageKey]);

  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      previousRunStatusRef.current = run?.status || null;
      lastReviewKeyRef.current = reviewStateKey;
      return;
    }

    const moveViewportTo = (top: number, behavior: ScrollBehavior) => {
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top, behavior });
      } else {
        viewport.scrollTop = top;
      }
    };

    const enteredPlanReview = previousRunStatusRef.current !== 'awaiting_approval' && run?.status === 'awaiting_approval';
    const reviewChanged = lastReviewKeyRef.current !== reviewStateKey;

    if (freezeChatAutoscroll) {
      if (enteredPlanReview && reviewSurfaceRef.current) {
        const top = Math.max(reviewSurfaceRef.current.offsetTop - 12, 0);
        moveViewportTo(top, 'smooth');
        reviewScrollTopRef.current = top;
        shouldStickToBottomRef.current = false;
      } else if (reviewChanged && reviewScrollTopRef.current !== null) {
        moveViewportTo(reviewScrollTopRef.current, 'auto');
      }
    }

    previousRunStatusRef.current = run?.status || null;
    lastReviewKeyRef.current = reviewStateKey;
  }, [freezeChatAutoscroll, reviewStateKey, run?.status]);

  async function handleSend() {
    if (!inputValue.trim() || !projectId || !runId || sending) {
      return;
    }

    const message = inputValue.trim();
    setInputValue('');
    setSending(true);

    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/message`, { message });
      await fetchRun();
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className={`dc-chat-layout${isSyntheticRun ? ' dc-chat-layout--synthetic' : ''}`}>
      <div className="dc-chat-panel">
        <div className="dc-chat-header">
          <ConsoleAmbientDigits
            variant="header"
            tone={isSyntheticRun ? 'secondary' : 'mixed'}
            className="dc-chat-header__ambient"
          />
          {showActionSpider && <ActionSpiderAccent variant="trace" className="dc-chat-header__spider" />}

          <div className="dc-chat-header__top">
            <button className="btn btn--ghost" onClick={() => navigate(`/projects/${projectId}`)} style={{ paddingInline: 12 }}>
              <ArrowLeft size={16} />
              Back to project
            </button>
            <span className={`badge badge--${run?.status === 'running' ? 'running' : run?.status === 'completed' ? 'completed' : run?.status === 'failed' ? 'failed' : run?.status === 'awaiting_approval' ? 'awaiting' : 'pending'}`}>
              {formatStatusLabel(run?.status || 'pending')}
            </span>
            {run && <span className="dc-tag">{formatGenerationModeLabel(run.generation_mode || 'real')}</span>}
          </div>

          <div className="dc-chat-header__meta">
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Route</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{runId?.slice(0, 8)}</div>
            </div>
            {run && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Search focus</div>
                <div>{run.current_agent ? formatAgentLabel(run.current_agent) : formatPhaseLabel(run.current_phase)}</div>
              </div>
            )}
          </div>

          {run && <SignalStrip items={headerSignals} compact className="dc-chat-header__signals" />}

          {run && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{formatPhaseLabel(run.current_phase || 'idle')}</span>
                <span>{run.progress_percent}%</span>
              </div>
              <div className="budget-meter">
                <div className="budget-meter__fill" style={{ width: `${run.progress_percent}%`, backgroundColor: 'var(--accent-primary)' }} />
              </div>
            </div>
          )}
        </div>

        {run && (
          <LiveReasoningPanel
            runStatus={run.status}
            currentAgent={run.current_agent}
            currentPhase={run.current_phase}
            currentTask={run.current_task}
            steps={steps}
          />
        )}

        <div ref={messagesViewportRef} className="dc-chat-stream">
          {messages.length === 0 && !freezeChatAutoscroll && (
            <div className="dc-empty-state" style={{ minHeight: 240 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>This run is ready for its first instruction</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {isSyntheticRun
                    ? 'Describe the synthetic finance dataset you want and DataCrawl will start shaping it.'
                    : 'Describe the dataset you want to collect and DataCrawl will start planning the crawl.'}
                </div>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <ChatMessage
              key={message.id || `${message.role}-${index}`}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
            />
          ))}

          {isAwaitingApproval && run?.plan && projectId && runId && (
            <div ref={reviewSurfaceRef} className="dc-chat-review-surface">
              <PlanApproval
                projectId={projectId}
                runId={runId}
                plan={run.plan}
                showSpiderAccent={!isSyntheticRun}
                onApproved={() => void fetchRun()}
              />
            </div>
          )}

          {isAwaitingStructuredInput && projectId && runId && run?.pending_input_request && (
            <div ref={reviewSurfaceRef} className="dc-chat-review-surface">
              {isAwaitingSolanaPayment ? (
                <SolanaPaymentRequest
                  projectId={projectId}
                  runId={runId}
                  request={run.pending_input_request}
                  showSpiderAccent={!isSyntheticRun}
                  onResolved={() => void fetchRun()}
                />
              ) : (
                <RunInputRequest
                  projectId={projectId}
                  runId={runId}
                  request={run.pending_input_request}
                  showSpiderAccent={!isSyntheticRun}
                  onResolved={() => void fetchRun()}
                />
              )}
            </div>
          )}

          {isAwaitingPaidApproval && projectId && runId && run?.pending_paid_approval && (
            <div ref={reviewSurfaceRef} className="dc-chat-review-surface">
              <PaidApprovalRequest
                projectId={projectId}
                runId={runId}
                request={run.pending_paid_approval}
                showSpiderAccent={!isSyntheticRun}
                onResolved={() => void fetchRun()}
              />
            </div>
          )}

          {run?.error && run.status === 'failed' && (
            <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>
              {`The run hit a problem: ${run.error}`}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="dc-chat-input">
          <div className="dc-chat-input__row">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              disabled={!canSendMessage || isAwaitingStructuredInput || isAwaitingPaidApproval}
              rows={1}
            />
            <button
              className="btn btn--primary"
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || sending || !canSendMessage || isAwaitingStructuredInput || isAwaitingPaidApproval}
              style={{ width: 46, minWidth: 46, paddingInline: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="dc-chat-rail">
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
          generationMode={run?.generation_mode || 'real'}
          onKilled={() => void fetchRun()}
        />
      </div>
    </div>
  );
}
