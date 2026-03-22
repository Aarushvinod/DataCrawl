import SpiderMark from './SpiderMark';

interface BrandWordmarkProps {
  size?: 'nav' | 'hero' | 'section';
  className?: string;
}

function SpiderGlyph() {
  return (
    <span className="dc-wordmark__spider" aria-hidden="true">
      <SpiderMark />
    </span>
  );
}

export default function BrandWordmark({
  size = 'nav',
  className = '',
}: BrandWordmarkProps) {
  return (
    <span
      className={`dc-wordmark dc-wordmark--${size} ${className}`.trim()}
      aria-label="DataCrawl"
    >
      <span className="dc-wordmark__letter">D</span>
      <SpiderGlyph />
      <span className="dc-wordmark__letter">t</span>
      <SpiderGlyph />
      <span className="dc-wordmark__letter">C</span>
      <span className="dc-wordmark__letter">r</span>
      <SpiderGlyph />
      <span className="dc-wordmark__letter">w</span>
      <span className="dc-wordmark__letter">l</span>
    </span>
  );
}
