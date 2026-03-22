import { useMemo, useState } from 'react';
import { Check, ClipboardList, DollarSign, RefreshCcw, X } from 'lucide-react';
import api from '../../services/api';

interface OutputContract {
  format?: string;
  required_columns?: string[];
  optional_columns?: string[];
  row_count_target?: number;
  row_count_range?: { min?: number; max?: number };
  time_range?: string;
  granularity?: string;
  symbols_or_entities?: string[];
}

interface SourceStrategyItem {
  provider?: string;
  source_mode?: string;
  endpoint_or_url?: string;
  why_selected?: string;
  requires_account?: boolean;
  requires_api_key?: boolean;
  requires_paid_plan?: boolean;
  free_vs_paid_rank?: string;
}

interface BudgetLineItem {
  provider?: string;
  kind?: string;
  estimated_cost?: number;
  calculation?: string;
  pricing_source?: string;
}

interface PlanStep {
  id?: string;
  description?: string;
  agent?: string;
  goal?: string;
  inputs?: Record<string, unknown>;
  expected_outputs?: string[];
  success_criteria?: string[];
  fallback_step_ids?: string[];
  estimated_cost?: number;
}

interface UserInputRequirement {
  label?: string;
  input_type?: string;
  provider?: string;
  required?: boolean;
}

interface DetailedPlan {
  description?: string;
  financial_request_summary?: string;
  output_contract?: OutputContract;
  source_strategy?: SourceStrategyItem[];
  budget_analysis?: {
    budget_total?: number;
    estimated_total_cost?: number;
    within_budget?: boolean;
    line_items?: BudgetLineItem[];
  };
  user_inputs_required?: UserInputRequirement[];
  steps: PlanStep[];
  risks_and_fallbacks?: string[];
  synthetic_data_usage?: { allowed?: boolean; reason?: string };
  approval_gate_summary?: { approvable?: boolean; reason?: string };
  paid_execution_notice?: {
    may_require_paid_approval?: boolean;
    candidate_paid_providers?: string[];
    expected_price_range?: string;
    manual_checkout_required?: boolean;
    supported_payment_methods?: string[];
  };
}

interface PlanApprovalProps {
  projectId: string;
  runId: string;
  plan: DetailedPlan;
  onApproved: () => void;
}

function formatMoney(value?: number): string {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : '$0.00';
}

function toAgentLabel(value?: string): string {
  return value ? value.replace(/_/g, ' ') : 'agent';
}

function renderKeyValueEntries(payload?: Record<string, unknown>): string[] {
  if (!payload) {
    return [];
  }
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

export default function PlanApproval({ projectId, runId, plan, onApproved }: PlanApprovalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [budgetValue, setBudgetValue] = useState(String(plan.budget_analysis?.budget_total ?? ''));
  const lineItems = plan.budget_analysis?.line_items || [];
  const approvable = plan.approval_gate_summary?.approvable !== false && plan.budget_analysis?.within_budget !== false;
  const approvalReason = plan.approval_gate_summary?.reason || (
    approvable ? 'Review the source plan and approve when ready.' : 'This plan needs budget or scope changes before it can run.'
  );

  const summarizedInputs = useMemo(
    () => (plan.user_inputs_required || []).map((item) => (
      `${item.label || item.input_type || 'input'}${item.provider ? ` • ${item.provider}` : ''}`
    )),
    [plan.user_inputs_required],
  );

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
    } catch {
      // Decision failed
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
        feedback: `Please rebuild the financial-data plan using the updated budget of $${parsedBudget.toFixed(2)}.`,
      });
      onApproved();
    } catch {
      // Replan failed
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        borderColor: approvable ? 'var(--border-color)' : 'var(--color-warning)',
        margin: '12px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ClipboardList size={18} color="var(--color-warning)" />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Plan approval required</span>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {plan.description || 'Review the proposed financial-data collection plan.'}
          </div>
          {plan.financial_request_summary && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {plan.financial_request_summary}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-primary)',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Output contract
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <div>Format: {plan.output_contract?.format || 'csv'}</div>
              <div>Required columns: {(plan.output_contract?.required_columns || []).join(', ') || 'n/a'}</div>
              <div>
                Rows: {plan.output_contract?.row_count_target || 'n/a'}
                {plan.output_contract?.row_count_range && (
                  <> ({plan.output_contract.row_count_range.min}–{plan.output_contract.row_count_range.max})</>
                )}
              </div>
              {plan.output_contract?.time_range && <div>Time range: {plan.output_contract.time_range}</div>}
              {plan.output_contract?.symbols_or_entities && plan.output_contract.symbols_or_entities.length > 0 && (
                <div>Entities: {plan.output_contract.symbols_or_entities.join(', ')}</div>
              )}
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-primary)',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <DollarSign size={14} color="var(--text-secondary)" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Budget analysis</span>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <div>Total budget: {formatMoney(plan.budget_analysis?.budget_total)}</div>
              <div>Estimated total: {formatMoney(plan.budget_analysis?.estimated_total_cost)}</div>
              <div>Status: {plan.budget_analysis?.within_budget === false ? 'Over budget' : 'Within budget'}</div>
            </div>
          </div>
        </div>

        {lineItems.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Budget provenance
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {lineItems.map((item, index) => (
                <div
                  key={`${item.provider || 'line'}-${index}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    padding: 10,
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {item.provider || 'Cost item'} • {item.kind || 'cost'}
                  </div>
                  <div>{formatMoney(item.estimated_cost)}</div>
                  {item.calculation && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{item.calculation}</div>}
                  {item.pricing_source && <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Source: {item.pricing_source}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(plan.source_strategy || []).length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Source strategy
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(plan.source_strategy || []).map((source, index) => (
                <div
                  key={`${source.provider || 'source'}-${index}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {source.provider || 'Source'} • {toAgentLabel(source.source_mode)}
                  </div>
                  {source.endpoint_or_url && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, wordBreak: 'break-word' }}>
                      {source.endpoint_or_url}
                    </div>
                  )}
                  {source.why_selected && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                      {source.why_selected}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Execution steps
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {(plan.steps || []).map((step, index) => (
              <div
                key={step.id || `${step.agent}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '26px 1fr',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: index < plan.steps.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {step.goal || step.description || 'Planned step'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Agent: {toAgentLabel(step.agent)}
                    {step.estimated_cost !== undefined && <> • Est. cost: {formatMoney(step.estimated_cost)}</>}
                  </div>
                  {renderKeyValueEntries(step.inputs).length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Inputs: {renderKeyValueEntries(step.inputs).join(' • ')}
                    </div>
                  )}
                  {(step.success_criteria || []).length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Success: {(step.success_criteria || []).join(' • ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {summarizedInputs.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Possible user inputs during execution
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {summarizedInputs.map((item, index) => (
                <div key={`${item}-${index}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.paid_execution_notice?.may_require_paid_approval && (
          <div
            style={{
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              backgroundColor: 'var(--bg-primary)',
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            This plan may require a paid provider as a last resort. A second approval will be required at execution time with the exact live price, a Stripe payment-method selection, and a manual checkout pause.
          </div>
        )}

        {(plan.risks_and_fallbacks || []).length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Risks and fallbacks
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(plan.risks_and_fallbacks || []).map((item, index) => (
                <div key={`${item}-${index}`} style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Approval gate
          </div>
          <div style={{ fontSize: 13, color: approvable ? 'var(--text-primary)' : 'var(--color-warning)', lineHeight: 1.6 }}>
            {approvalReason}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetValue}
            onChange={(event) => setBudgetValue(event.target.value)}
            placeholder="Budget"
            style={{
              width: 160,
              height: 38,
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '0 12px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            className="btn btn--secondary"
            onClick={handleBudgetReplan}
            disabled={submitting}
          >
            <RefreshCcw size={14} />
            Update budget and replan
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button
          className="btn btn--primary"
          onClick={() => handleDecision(true)}
          disabled={submitting || !approvable}
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
