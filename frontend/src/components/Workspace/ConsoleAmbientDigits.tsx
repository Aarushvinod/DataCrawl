import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

type AmbientVariant = 'header' | 'rail' | 'card';
type AmbientTone = 'primary' | 'secondary' | 'mixed';

interface ConsoleAmbientDigitsProps {
  variant?: AmbientVariant;
  tone?: AmbientTone;
  className?: string;
}

const DIGIT_ROWS: Record<AmbientVariant, string[]> = {
  header: [
    '1042 7721 0844 19.8',
    '5510 2418 0712 0034',
    '09 441 3188 526 182',
    '4418 0917 7602 14.3',
  ],
  rail: [
    '22 410 08 551 73',
    '0418 77 214 09 62',
    '118 504 276 09 11',
    '440 18 090 771 24',
    '07 219 644 18 552',
  ],
  card: [
    '118 09 44 71',
    '52.6 18 04 91',
    '302 77 14 08',
  ],
};

export default function ConsoleAmbientDigits({
  variant = 'header',
  tone = 'mixed',
  className = '',
}: ConsoleAmbientDigitsProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const rows = DIGIT_ROWS[variant];

  return (
    <div
      aria-hidden="true"
      className={[
        'dc-console-ambient',
        `dc-console-ambient--${variant}`,
        `dc-console-ambient--${tone}`,
        prefersReducedMotion ? 'is-reduced' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {rows.map((row, index) => (
        <span
          key={`${variant}-${index}`}
          className="dc-console-ambient__row"
          style={prefersReducedMotion ? undefined : { animationDelay: `${index * 320}ms` }}
        >
          {row}
        </span>
      ))}
    </div>
  );
}
