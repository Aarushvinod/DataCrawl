import { useMemo, useState } from 'react';
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import api from '../../services/api';

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
}

function fieldType(inputType?: string): string {
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

export default function RunInputRequest({ projectId, runId, request, onResolved }: RunInputRequestProps) {
  const fields = request.fields || [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isManualCheckoutConfirmation = request.type === 'manual_checkout_confirmation';
  const primaryActionLabel = isManualCheckoutConfirmation ? 'I completed checkout' : 'Continue';

  const missingRequired = useMemo(
    () => fields.some((field) => field.required && !values[field.id]?.trim()),
    [fields, values],
  );

  async function handleSubmit() {
    setSubmitting(true);
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
    } catch {
      // Input submission failed
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        margin: '12px 0',
        borderColor: 'var(--border-color)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
        {request.title || 'Input Required'}
      </div>
      {request.instructions && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          {request.instructions}
        </div>
      )}

      {fields.length > 0 && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
          {fields.map((field) => (
            <label key={field.id} style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {field.label || field.id}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-primary)',
                  padding: '0 12px',
                }}
              >
                {fieldIcon(field.input_type)}
                <input
                  type={fieldType(field.input_type)}
                  value={values[field.id] || ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={field.placeholder || ''}
                  style={{
                    flex: 1,
                    height: 40,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                />
              </div>
              {field.help_text && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {field.help_text}
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <button
        className="btn btn--primary"
        onClick={handleSubmit}
        disabled={submitting || (!isManualCheckoutConfirmation && missingRequired)}
      >
        {primaryActionLabel}
      </button>
    </div>
  );
}
