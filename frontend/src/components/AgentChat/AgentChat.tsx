import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../../services/api';
import { useFirestoreDoc } from '../../hooks/useFirestoreDoc';
import ChatMessage from './ChatMessage';
import PlanApproval from './PlanApproval';
import AgentActivityLog from './AgentActivityLog';

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
  duration_seconds?: number;
  cost?: number;
  details?: string;
}

interface PlanStep {
  description: string;
  agent?: string;
  estimated_cost?: number;
}

interface RunDoc {
  id: string;
  status: string;
  messages: Message[];
  steps: AgentStep[];
  budget_spent: number;
  budget_total: number;
  plan?: {
    summary: string;
    steps: PlanStep[];
    estimated_total_cost?: number;
  };
}

export default function AgentChat() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real-time Firestore subscription
  const firestorePath = projectId && runId ? `runs/${runId}` : null;
  const { data: runDoc } = useFirestoreDoc<RunDoc>(firestorePath);

  // Fallback: fetch from API if Firestore not available
  const [fallbackData, setFallbackData] = useState<RunDoc | null>(null);

  const fetchFallback = useCallback(async () => {
    if (runDoc || !projectId || !runId) return;
    try {
      const data = await api.get<RunDoc>(`/api/projects/${projectId}/runs/${runId}`);
      setFallbackData(data);
    } catch {
      // Failed to fetch
    }
  }, [projectId, runId, runDoc]);

  useEffect(() => {
    fetchFallback();
  }, [fetchFallback]);

  const run = runDoc || fallbackData;

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
      // If no Firestore, refetch
      if (!runDoc) {
        await fetchFallback();
      }
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
    if (!runDoc) {
      fetchFallback();
    }
  }

  const messages = run?.messages || [];
  const steps = run?.steps || [];
  const isAwaitingApproval = run?.status === 'awaiting_approval';
  const isActive =
    run?.status === 'planning' ||
    run?.status === 'running' ||
    run?.status === 'awaiting_approval';
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
              <span
                className={`badge badge--${run.status === 'running' ? 'running' : run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : run.status === 'awaiting_approval' ? 'awaiting' : 'pending'}`}
                style={{ fontSize: 11 }}
              >
                {run.status.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

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
              disabled={!isActive && messages.length > 0}
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
              disabled={!inputValue.trim() || sending}
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
          onKilled={handleApproved}
        />
      </div>
    </div>
  );
}
