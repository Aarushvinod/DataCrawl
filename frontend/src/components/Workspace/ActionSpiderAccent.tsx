import SpiderMark from '../Brand/SpiderMark';

type AccentVariant = 'capture' | 'trace' | 'watch';

interface ActionSpiderAccentProps {
  variant?: AccentVariant;
  className?: string;
}

export default function ActionSpiderAccent({
  variant = 'capture',
  className = '',
}: ActionSpiderAccentProps) {
  return (
    <div
      aria-hidden="true"
      className={['dc-action-spider', `dc-action-spider--${variant}`, className].filter(Boolean).join(' ')}
    >
      <span className="dc-action-spider__silk" />
      <span className="dc-action-spider__mark">
        <SpiderMark />
      </span>
    </div>
  );
}
