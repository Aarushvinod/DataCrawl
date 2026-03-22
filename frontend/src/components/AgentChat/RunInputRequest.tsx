import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import api, { getApiErrorMessage } from '../../services/api';
import ActionSpiderAccent from '../Workspace/ActionSpiderAccent';
import SignalStrip from '../Workspace/SignalStrip';

interface InputField {
  id: string;
  label?: string;
  input_type?: string;
  placeholder?: string;
  required?: boolean;
  help_text?: string;
}

interface RunInputRequestPayload {
  request_id: string;
  type?: string;
  title?: string;
  provider?: string;
  instructions?: string;
  fields?: InputField[];
}

interface RunInputRequestProps {
  projectId: string;
  runId: string;
  request: RunInputRequestPayload;
  onResolved: () => void;
  showSpiderAccent?: boolean;
}

function fieldType(inputType?: string) {
  switch (inputType) {
    case 'email':
      return 'email';
    case 'password':
    case 'secret':
    case 'api_key':
    case 'otp':
      return 'password';
    default:
      return 'text';
  }
}

function fieldIcon(inputType?: string) {
  switch (inputType) {
    case 'email':
      return <Mail size={14} color="var(--text-secondary)" />;
    case 'otp':
      return <ShieldCheck size={14} color="var(--text-secondary)" />;
    case 'api_key':
      return <KeyRound size={14} color="var(--text-secondary)" />;
    default:
      return <LockKeyhole size={14} color="var(--text-secondary)" />;
  }
}

export default function RunInputRequest({
  projectId,
  runId,
  request,
  onResolved,
  showSpiderAccent = true,
}: RunInputRequestProps) {
  const fields = useMemo(() => request.fields || [], [request.fields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isManualCheckoutConfirmation = request.type === 'manual_checkout_confirmation';
  const requestSignals = [
    {
      label: 'Fields',
      value: String(fields.length),
      note: 'details requested',
      tone: 'secondary' as const,
    },
    {
      label: 'Provider',
      value: request.provider || 'Run input',
      note: isManualCheckoutConfirmation ? 'manual confirmation' : 'search can resume after this',
      tone: 'primary' as const,
    },
  ];

  const missingRequired = useMemo(
    () => fields.some((field) => field.required && !values[field.id]?.trim()),
    [fields, values],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (isManualCheckoutConfirmation) {
        await api.post(`/api/projects/${projectId}/runs/${runId}/confirm-checkout`, {
          request_id: request.request_id,
          confirmed: true,
        });
      } else {
        await api.post(`/api/projects/${projectId}/runs/${runId}/provide-input`, {
          request_id: request.request_id,
          values,
        });
      }
      onResolved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not continue this run.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card dc-input-card">
      {showSpiderAccent && <ActionSpiderAccent variant="watch" className="dc-approval-card__spider" />}

      <div className="dc-page-header__copy" style={{ marginBottom: 18 }}>
        <p className="dc-section__eyebrow">More details needed</p>
        <h2 className="dc-section__title" style={{ fontSize: '1.8rem' }}>{request.title || 'A few details are needed before the run can continue.'}</h2>
        {request.instructions && <p className="dc-section__copy">{request.instructions}</p>}
      </div>

      <SignalStrip items={requestSignals} compact />

      {fields.length > 0 && (
        <div className="dc-form-grid" style={{ marginBottom: 18 }}>
          {fields.map((field) => (
            <label key={field.id} className="dc-form-grid">
              <span style={{ fontSize: 13, fontWeight: 600 }}>{field.label || field.id}</span>
              <div className="dc-info-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {fieldIcon(field.input_type)}
                <input
                  type={fieldType(field.input_type)}
                  value={values[field.id] || ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={field.placeholder || ''}
                  style={{ border: 'none', background: 'transparent', padding: 0 }}
                />
              </div>
              {field.help_text && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{field.help_text}</span>}
            </label>
          ))}
        </div>
      )}

      {error && <div className="card" style={{ borderColor: 'rgba(255, 125, 125, 0.24)', color: 'var(--color-error)', marginBottom: 18 }}>{error}</div>}

      <button
        className="btn btn--primary"
        onClick={() => void handleSubmit()}
        disabled={submitting || (!isManualCheckoutConfirmation && missingRequired)}
      >
        {isManualCheckoutConfirmation ? 'I finished checkout' : 'Continue'}
      </button>
    </div>
  );
}
