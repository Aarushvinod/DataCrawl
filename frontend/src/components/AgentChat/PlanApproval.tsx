import { Check, RefreshCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import api from '../../services/api';
import { formatAgentLabel } from './uiLabels';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import SignalStrip from '../Workspace/SignalStrip';

interface OutputContract {
  format?: string;
  required_columns?: string[];
  row_count_target?: number;
  row_count_range?: { min?: number; max?: number };
  time_range?: string;
  symbols_or_entities?: string[];
}

interface PlanStep {
  id?: string;
  description?: string;
  agent?: string;
  goal?: string;
  inputs?: Record<string, unknown>;
  success_criteria?: string[];
  estimated_cost?: number;
}

interface DetailedPlan {
  description?: string;
  financial_request_summary?: string;
  output_contract?: OutputContract;
  source_strategy?: Array<{
    provider?: string;
    source_mode?: string;
    endpoint_or_url?: string;
    why_selected?: string;
  }>;
  budget_analysis?: {
    budget_total?: number;
    estimated_total_cost?: number;
    within_budget?: boolean;
    line_items?: Array<{
      provider?: string;
      kind?: string;
      estimated_cost?: number;
      calculation?: string;
      pricing_source?: string;
    }>;
  };
  user_inputs_required?: Array<{ label?: string; input_type?: string; provider?: string }>;
  steps: PlanStep[];
  risks_and_fallbacks?: string[];
  approval_gate_summary?: { approvable?: boolean; reason?: string };
  paid_execution_notice?: { may_require_paid_approval?: boolean };
}

interface PlanApprovalProps {
  projectId: string;
  runId: string;
  plan: DetailedPlan;
  onApproved: () => void;
  showSpiderAccent?: boolean;
}

function formatMoney(value?: number) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '$0.00';
}

function renderKeyValueEntries(payload?: Record<string, unknown>) {
  if (!payload) {
    return [];
  }

  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

export default function PlanApproval({
  projectId,
  runId,
  plan,
  onApproved,
  showSpiderAccent = true,
}: PlanApprovalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [budgetValue, setBudgetValue] = useState(String(plan.budget_analysis?.budget_total ?? ''));
  const approvable = plan.approval_gate_summary?.approvable !== false && plan.budget_analysis?.within_budget !== false;
  const approvalReason = plan.approval_gate_summary?.reason || (
    approvable
      ? 'Review the plan and start when you are ready.'
      : 'This plan needs budget or scope changes before it can start.'
  );

  const requestedInputs = useMemo(
    () => (plan.user_inputs_required || []).map((item) => `${item.label || item.input_type || 'detail'}${item.provider ? ` - ${item.provider}` : ''}`),
    [plan.user_inputs_required],
  );
  const planSignals = [
    {
      label: 'Path steps',
      value: String((plan.steps || []).length),
      note: 'stages in this route',
      tone: 'primary' as const,
    },
    {
      label: 'Sources',
      value: String((plan.source_strategy || []).length),
      note: 'research paths selected',
      tone: 'secondary' as const,
    },
    {
      label: 'Estimated spend',
      value: formatMoney(plan.budget_analysis?.estimated_total_cost),
      note: `budget ${formatMoney(plan.budget_analysis?.budget_total)}`,
      tone: plan.budget_analysis?.within_budget === false ? 'warning' as const : 'success' as const,
    },
  ];

  async function handleDecision(approved: boolean) {
    setSubmitting(true);
    try {
      if (approved) {
        await api.post(`/api/projects/${projectId}/runs/${runId}/approve`, {});
      } else {
        await api.post(`/api/projects/${projectId}/runs/${runId}/message`, {
          message: 'Please revise the proposed plan.',
        });
      }
      onApproved();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBudgetReplan() {
    const parsedBudget = Number(budgetValue);
    if (Number.isNaN(parsedBudget) || parsedBudget < 0) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/replan`, {
        budget_override: parsedBudget,
        feedback: `Please rebuild the plan using the updated budget of $${parsedBudget.toFixed(2)}.`,
      });
      onApproved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card dc-approval-card">
      {showSpiderAccent && <ActionSpiderAccent variant="trace" className="dc-approval-card__spider" />}

      <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
        <p className="dc-section__eyebrow">Review plan</p>
        <h2 className="dc-section__title" style={{ fontSize: '1.8rem' }}>Make sure this crawl path looks right.</h2>
        <p className="dc-section__copy">{plan.description || 'Review the proposed data plan before the run starts.'}</p>
      </div>

      <SignalStrip items={planSignals} compact />

      {plan.financial_request_summary && (
        <div className="dc-info-card" style={{ marginBottom: 14 }}>{plan.financial_request_summary}</div>
      )}

      <div className="dc-approval-grid">
        <div className="dc-info-grid">
          <div className="dc-info-card">
            <div className="dc-info-card__label">What you will receive</div>
            <div>Format: {plan.output_contract?.format || 'csv'}</div>
            <div>Required columns: {(plan.output_contract?.required_columns || []).join(', ') || 'n/a'}</div>
            <div>
              Rows: {plan.output_contract?.row_count_target || 'n/a'}
              {plan.output_contract?.row_count_range && ` (${plan.output_contract.row_count_range.min}-${plan.output_contract.row_count_range.max})`}
            </div>
            {plan.output_contract?.time_range && <div>Time range: {plan.output_contract.time_range}</div>}
            {plan.output_contract?.symbols_or_entities?.length ? <div>Entities: {plan.output_contract.symbols_or_entities.join(', ')}</div> : null}
          </div>

          <div className="dc-info-card">
            <div className="dc-info-card__label">Budget outlook</div>
            <div>Total budget: {formatMoney(plan.budget_analysis?.budget_total)}</div>
            <div>Estimated total: {formatMoney(plan.budget_analysis?.estimated_total_cost)}</div>
            <div>{plan.budget_analysis?.within_budget === false ? 'This version is over budget.' : 'This version fits the current budget.'}</div>
          </div>
        </div>

        {(plan.source_strategy || []).length > 0 && (
          <div className="dc-info-grid">
            {(plan.source_strategy || []).map((source, index) => (
              <div key={`${source.provider || 'source'}-${index}`} className="dc-info-card">
                <div className="dc-info-card__label">{source.provider || 'Source'}</div>
                <div style={{ fontWeight: 600 }}>{source.source_mode === 'api_code' ? 'Direct source' : source.source_mode === 'web_scraping' ? 'Website steps' : 'Planned approach'}</div>
                {source.endpoint_or_url && <div style={{ color: 'var(--text-secondary)', marginTop: 6, wordBreak: 'break-word' }}>{source.endpoint_or_url}</div>}
                {source.why_selected && <div style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{source.why_selected}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="dc-list">
          {(plan.steps || []).map((step, index) => (
            <div key={step.id || `${step.agent}-${index}`} className="dc-info-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, minWidth: 0, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, minWidth: 0, flex: '1 1 240px' }}>{step.goal || step.description || `Step ${index + 1}`}</div>
                <span className="dc-tag" style={{ flexShrink: 0 }}>{formatAgentLabel(step.agent || '') || 'Assistant'}</span>
              </div>
              {step.estimated_cost !== undefined && <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{`Estimated cost: ${formatMoney(step.estimated_cost)}`}</div>}
              {renderKeyValueEntries(step.inputs).length > 0 && <div style={{ color: 'var(--text-secondary)' }}>Details: {renderKeyValueEntries(step.inputs).join(' | ')}</div>}
              {step.success_criteria?.length ? <div style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Success looks like: {step.success_criteria.join(' | ')}</div> : null}
            </div>
          ))}
        </div>

        {requestedInputs.length > 0 && (
          <div className="dc-info-card">
            <div className="dc-info-card__label">You may be asked for</div>
            <div className="dc-tag-grid">
              {requestedInputs.map((item) => <span key={item} className="dc-tag">{item}</span>)}
            </div>
          </div>
        )}

        {(plan.risks_and_fallbacks || []).length > 0 && (
          <div className="dc-info-card">
            <div className="dc-info-card__label">Watch-outs and backup plans</div>
            <div className="dc-form-grid">
              {(plan.risks_and_fallbacks || []).map((item) => <div key={item} style={{ color: 'var(--text-secondary)' }}>{item}</div>)}
            </div>
          </div>
        )}

        {plan.paid_execution_notice?.may_require_paid_approval && (
          <div className="dc-info-card">
            If a paid source becomes necessary later, DataCrawl will pause and ask for a separate approval before it continues.
          </div>
        )}

        <div className="dc-info-card">
          <div className="dc-info-card__label">Before you start</div>
          <div style={{ color: approvable ? 'var(--text-primary)' : 'var(--color-warning)' }}>{approvalReason}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetValue}
            onChange={(event) => setBudgetValue(event.target.value)}
            placeholder="Updated budget"
            style={{ width: 180 }}
          />
          <button className="btn btn--secondary" onClick={() => void handleBudgetReplan()} disabled={submitting}>
            <RefreshCcw size={14} />
            Update budget and refresh plan
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" onClick={() => void handleDecision(true)} disabled={submitting || !approvable} style={{ flex: 1 }}>
          <Check size={16} />
          Start this plan
        </button>
        <button className="btn btn--danger" onClick={() => void handleDecision(false)} disabled={submitting} style={{ flex: 1 }}>
          <X size={16} />
          Ask for changes
        </button>
      </div>
    </div>
  );
}
