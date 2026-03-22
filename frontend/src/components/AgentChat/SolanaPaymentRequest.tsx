import { useWaitForSignature, useWalletSession } from '@solana/react-hooks';
import { CheckCircle2, Copy, ExternalLink, QrCode, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useState } from 'react';
import api, { getApiErrorMessage } from '../../services/api';
import { shortenAddress } from '../../services/solana';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import SignalStrip from '../Workspace/SignalStrip';

interface SolanaPaymentRequestPayload {
  request_id: string;
  type?: string;
  title?: string;
  provider?: string;
  instructions?: string;
  network?: string;
  asset?: string;
  mint?: string;
  amount?: string;
  recipient?: string;
  reference?: string;
  memo?: string;
  expected_payer?: string;
  payment_url?: string;
  expires_at?: string;
}

interface SolanaPaymentRequestProps {
  projectId: string;
  runId: string;
  request: SolanaPaymentRequestPayload;
  onResolved: () => void;
  showSpiderAccent?: boolean;
}

function formatExpiry(value?: string) {
  if (!value) {
    return 'No expiry provided';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No expiry provided';
  }

  return date.toLocaleString();
}

export default function SolanaPaymentRequest({
  projectId,
  runId,
  request,
  onResolved,
  showSpiderAccent = true,
}: SolanaPaymentRequestProps) {
  const session = useWalletSession();
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const trimmedSignature = signature.trim();
  const waitState = useWaitForSignature(trimmedSignature || undefined, {
    disabled: !trimmedSignature,
    commitment: 'confirmed',
  });

  const connectedAddress = session?.account.address?.toString() || '';
  const expectedPayer = request.expected_payer || '';
  const payerMatches = Boolean(connectedAddress && expectedPayer && connectedAddress === expectedPayer);
  const requestSignals = useMemo(
    () => [
      {
        label: 'Asset',
        value: `${request.amount || '0'} ${request.asset || 'USDC'}`,
        note: 'settlement amount',
        tone: 'secondary' as const,
      },
      {
        label: 'Network',
        value: (request.network || 'devnet').toUpperCase(),
        note: 'Solana settlement rail',
        tone: 'primary' as const,
      },
      {
        label: 'Status',
        value:
          waitState.waitStatus === 'success'
            ? 'Detected'
            : waitState.waitStatus === 'waiting'
              ? 'Checking'
              : 'Waiting',
        note: 'transaction signature state',
        tone:
          waitState.waitStatus === 'success'
            ? 'success' as const
            : waitState.waitStatus === 'error'
              ? 'warning' as const
              : 'secondary' as const,
      },
    ],
    [request.amount, request.asset, request.network, waitState.waitStatus],
  );

  async function copyValue(label: string, value?: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1500);
    } catch {
      setCopiedField(null);
    }
  }

  async function handleConfirm() {
    if (!trimmedSignature) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/runs/${runId}/confirm-solana-payment`, {
        request_id: request.request_id,
        signature: trimmedSignature,
      });
      onResolved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not confirm this Solana payment.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card dc-approval-card">
      {showSpiderAccent && <ActionSpiderAccent variant="watch" className="dc-approval-card__spider" />}

      <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
        <p className="dc-section__eyebrow">Complete payment</p>
        <h2 className="dc-section__title" style={{ fontSize: '1.8rem' }}>
          {request.title || 'Finish the Solana payment to continue.'}
        </h2>
        <p className="dc-section__copy">
          {request.instructions || 'Open the wallet request, complete the USDC payment, then paste the transaction signature below.'}
        </p>
      </div>

      <SignalStrip items={requestSignals} compact />

      <div className="dc-approval-grid">
        <div className="dc-info-grid">
          <div className="dc-info-card">
            <div className="dc-info-card__label">Provider</div>
            <div style={{ fontWeight: 700 }}>{request.provider || 'Paid source'}</div>
          </div>
          <div className="dc-info-card">
            <div className="dc-info-card__label">Recipient</div>
            <div className="mono" style={{ wordBreak: 'break-word', fontSize: 13 }}>
              {request.recipient || 'Unavailable'}
            </div>
          </div>
        </div>

        <div className="dc-info-grid">
          <div className="dc-info-card">
            <div className="dc-info-card__label">Expected wallet</div>
            <div style={{ fontWeight: 700 }}>
              {expectedPayer ? shortenAddress(expectedPayer) : 'Saved wallet'}
            </div>
            {connectedAddress && (
              <div style={{ color: payerMatches ? 'var(--color-success)' : 'var(--text-secondary)', marginTop: 8 }}>
                Connected now: {shortenAddress(connectedAddress)}
                {payerMatches ? ' - matches the saved wallet' : ''}
              </div>
            )}
          </div>
          <div className="dc-info-card">
            <div className="dc-info-card__label">Reference</div>
            <div className="mono" style={{ wordBreak: 'break-word', fontSize: 13 }}>
              {request.reference || 'Unavailable'}
            </div>
            {request.memo && <div style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Memo: {request.memo}</div>}
          </div>
        </div>

        <div className="dc-info-grid" style={{ alignItems: 'stretch' }}>
          <div className="dc-info-card" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div className="dc-info-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <QrCode size={14} />
              Wallet request
            </div>
            {request.payment_url ? (
              <QRCodeSVG
                value={request.payment_url}
                size={168}
                bgColor="transparent"
                fgColor="#eafdf0"
                level="M"
                includeMargin={false}
              />
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>No QR code is available for this request.</div>
            )}
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
              Expires: {formatExpiry(request.expires_at)}
            </div>
          </div>

          <div className="dc-info-card" style={{ display: 'grid', gap: 12 }}>
            <div className="dc-info-card__label">How to finish this step</div>
            <div style={{ color: 'var(--text-secondary)' }}>
              1. Open the wallet request or scan the QR code.
              <br />
              2. Send the exact USDC amount from the saved wallet.
              <br />
              3. Paste the Solana transaction signature below so DataCrawl can verify it on-chain.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {request.payment_url ? (
                <a className="btn btn--primary" href={request.payment_url}>
                  <Wallet size={16} />
                  Open wallet request
                </a>
              ) : (
                <button className="btn btn--primary" disabled>
                  <Wallet size={16} />
                  Open wallet request
                </button>
              )}
              <button className="btn btn--secondary" onClick={() => void copyValue('payment-url', request.payment_url)}>
                <Copy size={14} />
                {copiedField === 'payment-url' ? 'Copied link' : 'Copy payment link'}
              </button>
              <button className="btn btn--ghost" onClick={() => void copyValue('recipient', request.recipient)}>
                <ExternalLink size={14} />
                {copiedField === 'recipient' ? 'Copied recipient' : 'Copy recipient'}
              </button>
            </div>
          </div>
        </div>

        <div className="dc-info-card">
          <label className="dc-form-grid">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Transaction signature</span>
            <div className="dc-info-card">
              <input
                type="text"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="Paste the Solana transaction signature"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
              />
            </div>
          </label>

          <div style={{ color: 'var(--text-secondary)', marginTop: 10 }}>
            {waitState.waitStatus === 'success' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success)' }}>
                <CheckCircle2 size={14} />
                This signature is visible on the configured Solana network.
              </span>
            )}
            {waitState.waitStatus === 'waiting' && 'Checking the transaction signature on Solana...'}
            {waitState.waitStatus === 'error' && 'The signature has not been detected yet. You can still submit it once the transaction lands.'}
            {!trimmedSignature && 'If your wallet does not hand the signature back automatically, paste it here after the transaction confirms.'}
          </div>
        </div>
      </div>

      {error && <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)', marginTop: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn--primary" disabled={!trimmedSignature || submitting} onClick={() => void handleConfirm()} style={{ flex: 1 }}>
          <CheckCircle2 size={16} />
          {submitting ? 'Confirming payment...' : 'Confirm payment and continue'}
        </button>
      </div>
    </div>
  );
}
