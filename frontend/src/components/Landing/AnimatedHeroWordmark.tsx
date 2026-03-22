import { useEffect, useMemo, useState } from 'react';
import BrandWordmark from '../Brand/BrandWordmark';
import SpiderMark from '../Brand/SpiderMark';

interface AnimatedHeroWordmarkProps {
  reducedMotion: boolean;
}

type HeroSlot =
  | { type: 'letter'; value: string }
  | { type: 'spider'; key: string };

const HERO_SLOTS: HeroSlot[] = [
  { type: 'letter', value: 'D' },
  { type: 'spider', key: 'a-1' },
  { type: 'letter', value: 't' },
  { type: 'spider', key: 'a-2' },
  { type: 'letter', value: 'C' },
  { type: 'letter', value: 'r' },
  { type: 'spider', key: 'a-3' },
  { type: 'letter', value: 'w' },
  { type: 'letter', value: 'l' },
];

type LoopPhase = 'typing' | 'holding' | 'streaming';

function buildDigitColumn(slotIndex: number, tick: number) {
  return Array.from({ length: 6 }, (_, digitIndex) => (
    ((slotIndex * 7 + tick * 3 + digitIndex * 5 + 1) % 10).toString()
  ));
}

export default function AnimatedHeroWordmark({ reducedMotion }: AnimatedHeroWordmarkProps) {
  const [phase, setPhase] = useState<LoopPhase>('typing');
  const [visibleCount, setVisibleCount] = useState(0);
  const [streamTick, setStreamTick] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    if (phase === 'typing') {
      if (visibleCount < HERO_SLOTS.length) {
        const timeoutId = window.setTimeout(() => {
          setVisibleCount((current) => current + 1);
        }, 92);
        return () => window.clearTimeout(timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        setPhase('holding');
      }, 520);
      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'holding') {
      const timeoutId = window.setTimeout(() => {
        setPhase('streaming');
        setStreamTick(0);
      }, 420);
      return () => window.clearTimeout(timeoutId);
    }

    if (streamTick < 11) {
      const timeoutId = window.setTimeout(() => {
        setStreamTick((current) => current + 1);
      }, 82);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setPhase('typing');
      setVisibleCount(0);
      setStreamTick(0);
    }, 90);
    return () => window.clearTimeout(timeoutId);
  }, [phase, reducedMotion, streamTick, visibleCount]);

  const columns = useMemo(
    () => HERO_SLOTS.map((_, index) => buildDigitColumn(index, streamTick)),
    [streamTick],
  );

  if (reducedMotion) {
    return <BrandWordmark size="hero" />;
  }

  return (
    <span className="dc-wordmark dc-wordmark--hero dc-hero-wordmark" aria-label="DataCrawl">
      {HERO_SLOTS.map((slot, index) => {
        const isVisible = phase === 'streaming' || index < visibleCount;
        const isStreaming = phase === 'streaming';

        return (
          <span
            key={slot.type === 'letter' ? `${slot.value}-${index}` : slot.key}
            className={`dc-hero-wordmark__slot${isVisible ? ' is-visible' : ''}${isStreaming ? ' is-streaming' : ''}${slot.type === 'spider' ? ' dc-hero-wordmark__slot--spider' : ''}`}
          >
            <span className="dc-hero-wordmark__typed" aria-hidden={isStreaming}>
              {slot.type === 'letter' ? (
                <span className="dc-wordmark__letter">{slot.value}</span>
              ) : (
                <span className="dc-wordmark__spider" aria-hidden="true">
                  <SpiderMark />
                </span>
              )}
            </span>

            <span className="dc-hero-wordmark__stream" aria-hidden={!isStreaming}>
              <span
                className="dc-hero-wordmark__stream-stack"
                style={{
                  animationDuration: `${460 + index * 22}ms`,
                  animationDelay: `${index * 28}ms`,
                }}
              >
                {columns[index].map((digit, digitIndex) => (
                  <span key={`${index}-${streamTick}-${digitIndex}`} className="dc-hero-wordmark__digit">
                    {digit}
                  </span>
                ))}
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
