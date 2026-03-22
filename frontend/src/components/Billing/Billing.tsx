import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useWalletConnection, useWalletSession } from '@solana/react-hooks';
import { CreditCard, Link as LinkIcon, Plus, ShieldCheck, Trash2, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getApiErrorMessage } from '../../services/api';
import { bytesToBase64, getSolanaNetwork, shortenAddress } from '../../services/solana';
import type { PaymentMethod } from '../../types/billing';
import { isSolanaWallet } from '../../types/billing';
import ConsoleAmbientDigits from '../Workspace/ConsoleAmbientDigits';
import SignalStrip from '../Workspace/SignalStrip';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface SolanaChallengeResponse {
  challenge_id: string;
  message: string;
  expires_at: string;
}

function brandIcon(brand: string) {
  switch (brand.toLowerCase()) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'MC';
    case 'amex':
      return 'Amex';
    case 'solana':
      return 'SOL';
    default:
      return brand;
  }
}

function AddCardPaymentMethodForm({ onAdded }: { onAdded: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { client_secret } = await api.post<{ client_secret: string }>('/api/billing/setup-intent');
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        return;
      }

      const result = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card: cardElement },
      });

      if (result.error) {
        setError(result.error.message || 'Could not save this payment method');
      } else {
        cardElement.clear();
        onAdded();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save this payment method'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="dc-form-grid" onSubmit={handleSubmit}>
      <div className="dc-info-card">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '14px',
                color: '#eefcf3',
                fontFamily: '"Space Grotesk", sans-serif',
                '::placeholder': { color: '#9eb8aa' },
              },
              invalid: { color: '#ff7d7d' },
            },
          }}
        />
      </div>

      {error && <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn--primary" type="submit" disabled={!stripe || submitting}>
          <Plus size={16} />
          {submitting ? 'Saving...' : 'Save card'}
        </button>
      </div>
    </form>
  );
}

function SolanaWalletSection({ onAdded }: { onAdded: () => void }) {
  const { connectors, connect, disconnect, status, wallet, isReady, currentConnector } = useWalletConnection();
  const session = useWalletSession();
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = session?.account.address?.toString() || '';
  const network = getSolanaNetwork();

  async function handleSaveWallet() {
    if (!wallet?.signMessage || !address) {
      setError('This wallet cannot sign a verification message.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const challenge = await api.post<SolanaChallengeResponse>('/api/billing/solana/challenge', {
        address,
        label,
      });
      const signature = await wallet.signMessage(new TextEncoder().encode(challenge.message));
      await api.post('/api/billing/solana/wallets', {
        challenge_id: challenge.challenge_id,
        address,
        signature_base64: bytesToBase64(signature),
        label,
      });
      setLabel('');
      onAdded();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save this Solana wallet'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card dc-section-card">
      <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
        <p className="dc-section__eyebrow">Solana wallet</p>
        <h2 className="dc-section__title">Connect a USDC-ready Solana wallet</h2>
        <p className="dc-section__copy">
          Save a wallet once so provider steps that support USDC on Solana can offer it alongside cards.
        </p>
      </div>

      <div className="dc-info-grid" style={{ marginBottom: 18 }}>
        <div className="dc-info-card">
          <div className="dc-info-card__label">Network</div>
          <div style={{ fontWeight: 700 }}>{network}</div>
        </div>
        <div className="dc-info-card">
          <div className="dc-info-card__label">Wallet status</div>
          <div style={{ fontWeight: 700 }}>{status}</div>
          {currentConnector?.name && <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>{currentConnector.name}</div>}
        </div>
      </div>

      {!isReady && <div className="dc-info-card">Checking for supported wallets...</div>}

      {isReady && status !== 'connected' && (
        <div className="dc-form-grid">
          {connectors.length === 0 ? (
            <div className="dc-info-card">No Wallet Standard wallet was detected in this browser.</div>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.id}
                className="btn btn--secondary"
                onClick={() => void connect(connector.id)}
                disabled={saving || status === 'connecting'}
              >
                <LinkIcon size={14} />
                {status === 'connecting' ? 'Connecting...' : `Connect ${connector.name}`}
              </button>
            ))
          )}
        </div>
      )}

      {status === 'connected' && address && (
        <div className="dc-form-grid">
          <div className="dc-info-card">
            <div className="dc-info-card__label">Connected address</div>
            <div className="mono" style={{ wordBreak: 'break-word', fontSize: 13 }}>{address}</div>
          </div>

          <label className="dc-form-grid">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Label</span>
            <div className="dc-info-card">
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Trading wallet, Treasury wallet, etc."
                style={{ border: 'none', background: 'transparent', padding: 0 }}
              />
            </div>
          </label>

          {error && <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => void handleSaveWallet()} disabled={saving}>
              <Wallet size={16} />
              {saving ? 'Saving wallet...' : 'Save wallet'}
            </button>
            <button className="btn btn--ghost" onClick={() => void disconnect()} disabled={saving}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Billing() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMethods = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<PaymentMethod[]>('/api/billing/payment-methods');
      setPaymentMethods(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMethods();
  }, [fetchMethods]);

  async function handleRemove(id: string) {
    if (!confirm('Remove this payment method?')) {
      return;
    }

    setRemovingId(id);
    try {
      await api.delete(`/api/billing/payment-methods/${encodeURIComponent(id)}`);
      await fetchMethods();
    } finally {
      setRemovingId(null);
    }
  }

  const walletCount = useMemo(
    () => paymentMethods.filter((method) => method.type === 'solana_wallet').length,
    [paymentMethods],
  );
  const cardCount = paymentMethods.length - walletCount;
  const billingSignals = [
    {
      label: 'Saved methods',
      value: paymentMethods.length.toLocaleString(),
      note: 'cards and wallets ready',
      icon: <CreditCard size={12} />,
      tone: 'success' as const,
    },
    {
      label: 'Card rail',
      value: String(cardCount),
      note: 'Stripe payment methods',
      icon: <ShieldCheck size={12} />,
      tone: cardCount > 0 ? 'primary' as const : 'warning' as const,
    },
    {
      label: 'Solana rail',
      value: String(walletCount),
      note: 'USDC wallets saved',
      icon: <Wallet size={12} />,
      tone: walletCount > 0 ? 'secondary' as const : 'warning' as const,
    },
  ];

  return (
    <div className="dc-page-stack" style={{ maxWidth: 960 }}>
      <section className="dc-page-header">
        <ConsoleAmbientDigits variant="header" tone="mixed" className="dc-page-header__ambient" />
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Billing</p>
          <h1 className="dc-page-header__title">Keep card and Solana payment rails ready for paid data sources.</h1>
          <p className="dc-page-header__subtitle">
            DataCrawl only asks for approval when a paid source becomes necessary. Saving a card or a Solana wallet keeps those approvals smoother later.
          </p>
          <SignalStrip items={billingSignals} className="dc-page-header__signals" compact />
        </div>
      </section>

      <section className="card dc-section-card">
        <div className="dc-page-header__copy">
          <p className="dc-section__eyebrow">Saved methods</p>
          <h2 className="dc-section__title">Payment methods</h2>
        </div>

        {!showAddCardForm && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn--secondary" onClick={() => setShowAddCardForm(true)}>
              <Plus size={16} />
              Add card
            </button>
          </div>
        )}

        {loading && <div className="dc-empty-state" style={{ minHeight: 200 }}><div>Loading payment methods...</div></div>}

        {!loading && paymentMethods.length === 0 && !showAddCardForm && (
          <div className="dc-empty-state" style={{ minHeight: 220 }}>
            <div className="dc-empty-state__spider" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No payment methods saved yet</div>
              <div style={{ color: 'var(--text-secondary)' }}>Add a card or connect a Solana wallet so paid-source approvals stay smooth later.</div>
            </div>
          </div>
        )}

        {!loading && paymentMethods.length > 0 && (
          <div className="dc-list">
            {paymentMethods.map((paymentMethod) => {
              const solanaWallet = isSolanaWallet(paymentMethod);
              return (
                <div key={paymentMethod.id} className="card dc-run-row">
                  <ConsoleAmbientDigits variant="card" tone="secondary" className="dc-run-row__ambient" />
                  <div className="dc-run-row__top">
                    <div>
                      <h3 className="dc-run-row__title">
                        {solanaWallet
                          ? `${paymentMethod.label || 'Solana wallet'} • ${shortenAddress(paymentMethod.wallet_address)}`
                          : `${brandIcon(paymentMethod.brand)} ending in ${paymentMethod.last4}`}
                      </h3>
                      <div className="dc-run-mode" style={{ marginTop: 8 }}>
                        {solanaWallet
                          ? `${paymentMethod.asset || 'USDC'} on ${paymentMethod.network || getSolanaNetwork()}`
                          : `Expires ${String(paymentMethod.exp_month || '').padStart(2, '0')}/${paymentMethod.exp_year}`}
                      </div>
                    </div>
                    {paymentMethod.is_default && <span className="badge badge--completed">Default</span>}
                  </div>
                  <div className="dc-run-row__signal-grid">
                    <div className="dc-run-row__signal">
                      <span className="dc-run-row__signal-label">Payment rail</span>
                      <strong>{solanaWallet ? 'Solana' : brandIcon(paymentMethod.brand)}</strong>
                    </div>
                    <div className="dc-run-row__signal">
                      <span className="dc-run-row__signal-label">Identifier</span>
                      <strong>{solanaWallet ? shortenAddress(paymentMethod.wallet_address) : paymentMethod.last4}</strong>
                    </div>
                    <div className="dc-run-row__signal">
                      <span className="dc-run-row__signal-label">Approval state</span>
                      <strong>{paymentMethod.is_default ? 'Default' : 'Available'}</strong>
                    </div>
                  </div>
                  <div className="dc-run-row__footer">
                    <span className="dc-tag">
                      {solanaWallet ? <Wallet size={14} /> : <CreditCard size={14} />}
                      {solanaWallet ? 'Saved for Solana approvals' : 'Saved for card approvals'}
                    </span>
                    <button
                      className="btn btn--ghost"
                      onClick={() => void handleRemove(paymentMethod.id)}
                      disabled={removingId === paymentMethod.id}
                      style={{ paddingInline: 12, color: 'var(--color-error)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showAddCardForm && (
          <div className="card">
            <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
              <p className="dc-section__eyebrow">Add new card</p>
              <h2 className="dc-section__title">Secure checkout details</h2>
            </div>
            <Elements stripe={stripePromise}>
              <AddCardPaymentMethodForm onAdded={() => {
                setShowAddCardForm(false);
                void fetchMethods();
              }} />
            </Elements>
            <button className="btn btn--ghost" onClick={() => setShowAddCardForm(false)} style={{ marginTop: 12 }}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <SolanaWalletSection onAdded={() => void fetchMethods()} />
    </div>
  );
}
