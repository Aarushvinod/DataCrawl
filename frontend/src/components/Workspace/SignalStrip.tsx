import type { ReactNode } from 'react';

type SignalTone = 'primary' | 'secondary' | 'success' | 'warning';

export interface SignalItem {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  tone?: SignalTone;
}

interface SignalStripProps {
  items: SignalItem[];
  className?: string;
  compact?: boolean;
}

export default function SignalStrip({
  items,
  className = '',
  compact = false,
}: SignalStripProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={['dc-signal-strip', compact ? 'dc-signal-strip--compact' : '', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          className={['dc-signal-pill', item.tone ? `dc-signal-pill--${item.tone}` : ''].filter(Boolean).join(' ')}
        >
          <div className="dc-signal-pill__meta">
            {item.icon ? <span className="dc-signal-pill__icon">{item.icon}</span> : null}
            <span>{item.label}</span>
          </div>
          <div className="dc-signal-pill__value">{item.value}</div>
          {item.note ? <div className="dc-signal-pill__note">{item.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
