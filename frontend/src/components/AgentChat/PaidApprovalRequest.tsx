import { useEffect, useState } from 'react';
import { CreditCard, DollarSign, ExternalLink, ShieldAlert } from 'lucide-react';
import api from '../../services/api';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
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
  planned_price?: number | null;
  reason?: string;
  payment_unlocks?: string;
  free_alternatives?: string[];
  requires_manual_checkout?: boolean;
  manual_checkout_instructions?: string;
  checkout_url?: string;
}

interface PaidApprovalRequestProps {
  projectId: string;
  runId: string;
  request: PaidApprovalPayload;
  onResolved: () => void;
}

function paymentLabel(method: PaymentMethod): string {
  return `${method.brand.toUpperCase()} ending in ${method.last4}`;
}

export default function PaidApprovalRequest({
  projectId,
  runId,
  request,
  onResolved,
}: PaidApprovalRequestProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchMethods() {
      try {
        setLoadingMethods(true);
        const data = await api.get<PaymentMethod[]>('/api/billing/payment-methods');
        if (!cancelled) {
          setPaymentMethods(data);
          if (data[0]) {
            setSelectedMethodId(data[0].id);
          }
        }
      } catch {
        if (!cancelled) {
          setPaymentMethods([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMethods(false);
        }
      }
    }

    fetchMethods();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDecision(approved: boolean) {
    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/approve-paid`, {
        request_id: request.request_id,
        approved,
        selected_payment_method_id: approved ? selectedMethodId : undefined,
      });
      onResolved();
    } catch {
      // Paid approval failed
    } finally {
      setSubmitting(false);
    }
  }

  const livePrice = request.live_price || {};

  return (
    <div
      className="card"
      style={{
        margin: '12px 0',
        borderColor: 'var(--color-warning)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ShieldAlert size={18} color="var(--color-warning)" />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Paid approval required</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Provider
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {request.provider || 'Paid provider'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <DollarSign size={14} color="var(--text-secondary)" />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Exact live price</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {livePrice.amount !== undefined ? `${livePrice.amount} ${livePrice.currency || 'USD'}` : 'Unavailable'}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            {livePrice.cadence || 'one_time'}
            {livePrice.source ? ` • Source: ${livePrice.source}` : ''}
          </div>
        </div>

        {request.reason && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {request.reason}
          </div>
        )}

        {request.payment_unlocks && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Unlocks: {request.payment_unlocks}
          </div>
        )}

        {(request.free_alternatives || []).length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Free alternatives rejected
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(request.free_alternatives || []).map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    padding: '8px 10px',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <CreditCard size={14} color="var(--text-secondary)" />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saved Stripe payment methods</span>
          </div>

          {loadingMethods ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Loading payment methods...
            </div>
          ) : paymentMethods.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              No saved Stripe payment methods are available. Add one in Billing before approving this paid option.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {paymentMethods.map((method) => (
                <label
                  key={method.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    padding: '10px 12px',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="radio"
                    checked={selectedMethodId === method.id}
                    onChange={() => setSelectedMethodId(method.id)}
                  />
                  <span style={{ flex: 1 }}>{paymentLabel(method)}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {String(method.exp_month).padStart(2, '0')}/{method.exp_year}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {request.requires_manual_checkout && (
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
            Checkout will remain manual. After approval, DataCrawl will pause and ask you to complete payment on the provider site before execution resumes.
            {request.checkout_url && (
              <div style={{ marginTop: 8 }}>
                <a href={request.checkout_url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)' }}>
                  Open provider checkout <ExternalLink size={12} style={{ verticalAlign: 'text-bottom' }} />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          className="btn btn--primary"
          disabled={submitting || loadingMethods || paymentMethods.length === 0 || !selectedMethodId}
          onClick={() => handleDecision(true)}
          style={{ flex: 1 }}
        >
          Approve paid option
        </button>
        <button
          className="btn btn--danger"
          disabled={submitting}
          onClick={() => handleDecision(false)}
          style={{ flex: 1 }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
