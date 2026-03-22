import { useEffect, useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CreditCard, Trash2, Plus } from 'lucide-react';
import api from '../../services/api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

function AddPaymentMethodForm({ onAdded }: { onAdded: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    try {
      // Get setup intent client secret from API
      const { client_secret } = await api.post<{ client_secret: string }>(
        '/api/billing/setup-intent'
      );

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const result = await stripe.confirmCardSetup(client_secret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (result.error) {
        setError(result.error.message || 'Failed to add payment method');
      } else {
        cardElement.clear();
        onAdded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          padding: 12,
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-primary)',
          marginBottom: 12,
        }}
      >
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '14px',
                color: '#e6edf3',
                '::placeholder': {
                  color: '#8b949e',
                },
              },
              invalid: {
                color: '#f85149',
              },
            },
          }}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--color-error)', fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn--primary"
        disabled={!stripe || submitting}
      >
        <Plus size={16} />
        {submitting ? 'Adding...' : 'Add Payment Method'}
      </button>
    </form>
  );
}

function brandIcon(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'MC';
    case 'amex':
      return 'Amex';
    default:
      return brand;
  }
}

export default function Billing() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMethods = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<PaymentMethod[]>('/api/billing/payment-methods');
      setPaymentMethods(data);
    } catch {
      // Fetch failed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  async function handleRemove(id: string) {
    if (!confirm('Remove this payment method?')) return;
    setRemovingId(id);
    try {
      await api.delete(`/api/billing/payment-methods/${id}`);
      await fetchMethods();
    } catch {
      // Remove failed
    } finally {
      setRemovingId(null);
    }
  }

  function handleAdded() {
    setShowAddForm(false);
    fetchMethods();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Billing</h1>

      {/* Payment Methods */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
          Saved Stripe payment methods are used when a paid financial-data provider requires explicit approval during an agent run.
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Payment Methods</h2>
          {!showAddForm && (
            <button
              className="btn btn--secondary"
              onClick={() => setShowAddForm(true)}
              style={{ fontSize: 13 }}
            >
              <Plus size={14} />
              Add New
            </button>
          )}
        </div>

        {loading && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>
            Loading payment methods...
          </div>
        )}

        {!loading && paymentMethods.length === 0 && !showAddForm && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '12px 0' }}>
            No payment methods added yet.
          </div>
        )}

        {paymentMethods.map((pm) => (
          <div
            key={pm.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <CreditCard size={20} color="var(--text-secondary)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>
                {brandIcon(pm.brand)} ending in {pm.last4}
                {pm.is_default && (
                  <span
                    className="badge badge--completed"
                    style={{ marginLeft: 8, fontSize: 11 }}
                  >
                    Default
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Expires {String(pm.exp_month).padStart(2, '0')}/{pm.exp_year}
              </div>
            </div>
            <button
              className="btn btn--ghost"
              onClick={() => handleRemove(pm.id)}
              disabled={removingId === pm.id}
              style={{ padding: 6, color: 'var(--color-error)' }}
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {showAddForm && (
          <div style={{ paddingTop: 16 }}>
            <Elements stripe={stripePromise}>
              <AddPaymentMethodForm onAdded={handleAdded} />
            </Elements>
            <button
              className="btn btn--ghost"
              onClick={() => setShowAddForm(false)}
              style={{ marginTop: 8, fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
