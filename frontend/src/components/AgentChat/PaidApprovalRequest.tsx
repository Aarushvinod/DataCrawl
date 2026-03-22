import { CreditCard, DollarSign, ExternalLink, ShieldAlert, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import api, { getApiErrorMessage } from '../../services/api';
import type { PaymentMethod } from '../../types/billing';
import { isSolanaWallet, paymentMethodLabel } from '../../types/billing';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import SignalStrip from '../Workspace/SignalStrip';

interface SolanaPaymentRequestPayload {
  recipient?: string;
  amount?: string;
  network?: string;
  mint?: string;
  memo?: string;
  reference?: string;
}

interface PaidApprovalPayload {
  request_id: string;
  provider?: string;
  live_price?: {
    amount?: number;
    currency?: string;
    cadence?: string;
    source?: string;
  };
  reason?: string;
  payment_unlocks?: string;
  free_alternatives?: string[];
  requires_manual_checkout?: boolean;
  checkout_url?: string;
  supported_payment_methods?: string[];
  solana_payment_request?: SolanaPaymentRequestPayload | null;
}

interface PaidApprovalRequestProps {
  projectId: string;
  runId: string;
  request: PaidApprovalPayload;
  onResolved: () => void;
  showSpiderAccent?: boolean;
}

function supportsMethod(request: PaidApprovalPayload, method: PaymentMethod) {
  const supported = (request.supported_payment_methods || ['stripe']).map((item) => item.toLowerCase());
  if (isSolanaWallet(method)) {
    return supported.includes('solana');
  }
  return supported.includes('stripe');
}

export default function PaidApprovalRequest({
  projectId,
  runId,
  request,
  onResolved,
  showSpiderAccent = true,
}: PaidApprovalRequestProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useMemo(
    () => (request.supported_payment_methods || ['stripe']).map((item) => item.toLowerCase()),
    [request.supported_payment_methods],
  );
  const approvalSignals = [
    {
      label: 'Provider',
      value: request.provider || 'Paid option',
      note: 'approval required',
      tone: 'primary' as const,
    },
    {
      label: 'Price',
      value: request.live_price?.amount !== undefined ? `${request.live_price.amount} ${request.live_price.currency || 'USD'}` : 'Unavailable',
      note: request.live_price?.cadence ? request.live_price.cadence.replace(/_/g, ' ') : 'one time',
      tone: 'warning' as const,
    },
    {
      label: 'Supported rails',
      value: supported.join(' + ').toUpperCase(),
      note: 'for this provider step',
      tone: supported.includes('solana') ? 'secondary' as const : 'primary' as const,
    },
  ];

  useEffect(() => {
    let cancelled = false;

    async function fetchMethods() {
      try {
        const data = await api.get<PaymentMethod[]>('/api/billing/payment-methods');
        if (!cancelled) {
          const filtered = data.filter((method) => supportsMethod(request, method));
          setPaymentMethods(filtered);
          if (filtered[0]) {
            setSelectedMethodId(filtered[0].id);
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingMethods(false);
        }
      }
    }

    void fetchMethods();
    return () => {
      cancelled = true;
    };
  }, [request]);

  const selectedMethod = useMemo(
    () => paymentMethods.find((method) => method.id === selectedMethodId) || null,
    [paymentMethods, selectedMethodId],
  );

  async function handleDecision(approved: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/approve-paid`, {
        request_id: request.request_id,
        approved,
        selected_payment_method_id: approved ? selectedMethodId : undefined,
      });
      onResolved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update this approval.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card dc-approval-card">
      {showSpiderAccent && <ActionSpiderAccent variant="watch" className="dc-approval-card__spider" />}

      <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
        <p className="dc-section__eyebrow">Review paid option</p>
        <h2 className="dc-section__title" style={{ fontSize: '1.8rem' }}>This source may need a paid step.</h2>
      </div>

      <SignalStrip items={approvalSignals} compact />

      <div className="dc-approval-grid">
        <div className="dc-info-grid">
          <div className="dc-info-card">
            <div className="dc-info-card__label">Service</div>
            <div style={{ fontWeight: 700 }}>{request.provider || 'Paid option'}</div>
          </div>
          <div className="dc-info-card">
            <div className="dc-info-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarSign size={14} /> Current price
            </div>
            <div style={{ fontWeight: 700 }}>
              {request.live_price?.amount !== undefined ? `${request.live_price.amount} ${request.live_price.currency || 'USD'}` : 'Unavailable'}
            </div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
              {request.live_price?.cadence ? request.live_price.cadence.replace(/_/g, ' ') : 'one time'}
              {request.live_price?.source ? ` - ${request.live_price.source}` : ''}
            </div>
          </div>
        </div>

        {request.reason && <div className="dc-info-card">{request.reason}</div>}
        {request.payment_unlocks && <div className="dc-info-card">Includes: {request.payment_unlocks}</div>}

        {(request.free_alternatives || []).length > 0 && (
          <div className="dc-info-card">
            <div className="dc-info-card__label">Why this may still be needed</div>
            <div className="dc-form-grid">
              {(request.free_alternatives || []).map((item) => <div key={item} style={{ color: 'var(--text-secondary)' }}>{item}</div>)}
            </div>
          </div>
        )}

        <div className="dc-info-card">
          <div className="dc-info-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {supported.includes('solana') ? <Wallet size={14} /> : <CreditCard size={14} />} Saved payment methods
          </div>

          {loadingMethods ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading payment methods...</div>
          ) : paymentMethods.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>
              No compatible payment methods are saved yet. Add one in Billing before approving this option.
            </div>
          ) : (
            <div className="dc-form-grid">
              {paymentMethods.map((method) => (
                <label key={method.id} className="dc-info-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="radio"
                    checked={selectedMethodId === method.id}
                    onChange={() => setSelectedMethodId(method.id)}
                    style={{ width: 16 }}
                  />
                  <span style={{ flex: 1 }}>{paymentMethodLabel(method)}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {isSolanaWallet(method)
                      ? `${method.asset || 'USDC'} • ${(method.network || 'devnet').toUpperCase()}`
                      : `${String(method.exp_month || '').padStart(2, '0')}/${method.exp_year}`}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {request.supported_payment_methods?.includes('solana') && request.solana_payment_request && (
          <div className="dc-info-card">
            Solana is available for this step. After approval, DataCrawl will show a USDC payment request and wait for on-chain confirmation before the run continues.
          </div>
        )}

        {selectedMethod && !isSolanaWallet(selectedMethod) && request.requires_manual_checkout && (
          <div className="dc-info-card">
            Checkout stays in your hands. After approval, DataCrawl will pause and ask you to finish payment on the service website before work continues.
            {request.checkout_url && (
              <div style={{ marginTop: 10 }}>
                <a href={request.checkout_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Open checkout page <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)', marginTop: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary"
          disabled={submitting || loadingMethods || paymentMethods.length === 0 || !selectedMethodId}
          onClick={() => void handleDecision(true)}
          style={{ flex: 1 }}
        >
          <ShieldAlert size={16} />
          {selectedMethod && isSolanaWallet(selectedMethod) ? 'Use Solana wallet' : 'Use this option'}
        </button>
        <button className="btn btn--danger" disabled={submitting} onClick={() => void handleDecision(false)} style={{ flex: 1 }}>
          Keep looking
        </button>
      </div>
    </div>
  );
}
