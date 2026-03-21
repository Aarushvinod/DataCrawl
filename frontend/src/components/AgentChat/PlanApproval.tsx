import { useState } from 'react';
import { ClipboardList, Check, X } from 'lucide-react';
import api from '../../services/api';

interface PlanStep {
  description: string;
  agent?: string;
  estimated_cost?: number;
}

interface PlanApprovalProps {
  projectId: string;
  runId: string;
  plan: {
    summary: string;
    steps: PlanStep[];
    estimated_total_cost?: number;
  };
  onApproved: () => void;
}

export default function PlanApproval({ projectId, runId, plan, onApproved }: PlanApprovalProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDecision(approved: boolean) {
    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/approve`, {
        approved,
      });
      onApproved();
    } catch {
      // Decision failed
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        borderColor: 'var(--color-warning)',
        margin: '12px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <ClipboardList size={18} color="var(--color-warning)" />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Plan Approval Required</span>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
        {plan.summary}
      </p>

      <div style={{ marginBottom: 16 }}>
        {plan.steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 0',
              borderBottom:
                i < plan.steps.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{step.description}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {step.agent && <span>Agent: {step.agent}</span>}
                {step.estimated_cost !== undefined && (
                  <span style={{ marginLeft: step.agent ? 12 : 0 }}>
                    Est. cost: ${step.estimated_cost.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {plan.estimated_total_cost !== undefined && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginBottom: 16,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Estimated total cost: ${plan.estimated_total_cost.toFixed(2)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn--primary"
          onClick={() => handleDecision(true)}
          disabled={submitting}
          style={{ flex: 1 }}
        >
          <Check size={16} />
          Approve
        </button>
        <button
          className="btn btn--danger"
          onClick={() => handleDecision(false)}
          disabled={submitting}
          style={{ flex: 1 }}
        >
          <X size={16} />
          Reject
        </button>
      </div>
    </div>
  );
}
