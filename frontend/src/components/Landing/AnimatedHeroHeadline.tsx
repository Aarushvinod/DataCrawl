import { useEffect, useMemo, useState } from 'react';

interface AnimatedHeroHeadlineProps {
  reducedMotion: boolean;
  text: string;
}

type LoopPhase = 'typing' | 'holding' | 'streaming';

function buildDigitRows(length: number, tick: number) {
  const rowCount = 6;
  const columnCount = Math.max(24, Math.ceil(length * 0.72));

  return Array.from({ length: rowCount }, (_, rowIndex) => (
    Array.from({ length: columnCount }, (_, columnIndex) => (
      ((rowIndex * 5 + columnIndex * 7 + tick * 3 + 1) % 10).toString()
    )).join('')
  ));
}

export default function AnimatedHeroHeadline({ reducedMotion, text }: AnimatedHeroHeadlineProps) {
  const [phase, setPhase] = useState<LoopPhase>('typing');
  const [visibleCount, setVisibleCount] = useState(0);
  const [streamTick, setStreamTick] = useState(0);
  const characters = useMemo(() => Array.from(text), [text]);
  const tokens = useMemo(() => {
    const matches = text.match(/\S+\s*/g) ?? [text];

    return matches.reduce<Array<{ value: string; chars: string[]; startIndex: number }>>((accumulator, value) => {
      const chars = Array.from(value);
      const startIndex = accumulator.length === 0
        ? 0
        : accumulator[accumulator.length - 1].startIndex + accumulator[accumulator.length - 1].chars.length;

      accumulator.push({ value, chars, startIndex });
      return accumulator;
    }, []);
  }, [text]);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    if (phase === 'typing') {
      if (visibleCount < characters.length) {
        const timeoutId = window.setTimeout(() => {
          setVisibleCount((current) => current + 1);
        }, 20);
        return () => window.clearTimeout(timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        setPhase('holding');
      }, 760);
      return () => window.clearTimeout(timeoutId);
    }

    if (phase === 'holding') {
      const timeoutId = window.setTimeout(() => {
        setPhase('streaming');
        setStreamTick(0);
      }, 520);
      return () => window.clearTimeout(timeoutId);
    }

    if (streamTick < 10) {
      const timeoutId = window.setTimeout(() => {
        setStreamTick((current) => current + 1);
      }, 94);
      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      setPhase('typing');
      setVisibleCount(0);
      setStreamTick(0);
    }, 110);
    return () => window.clearTimeout(timeoutId);
  }, [characters.length, phase, reducedMotion, streamTick, visibleCount]);

  const digitRows = useMemo(
    () => buildDigitRows(characters.length, streamTick),
    [characters.length, streamTick],
  );

  if (reducedMotion) {
    return <h1 className="dc-hero__title">{text}</h1>;
  }

  return (
    <h1 className="dc-hero__title dc-hero-headline" aria-label={text}>
      <span className={`dc-hero-headline__typed${phase === 'streaming' ? ' is-hidden' : ''}`} aria-hidden={phase === 'streaming'}>
        {tokens.map((token) => (
          <span key={`${token.value}-${token.startIndex}`} className="dc-hero-headline__token">
            {token.chars.map((character, index) => {
              const globalIndex = token.startIndex + index;
              return (
                <span
                  key={`${character}-${globalIndex}`}
                  className={`dc-hero-headline__char${globalIndex < visibleCount ? ' is-visible' : ''}${character === ' ' ? ' dc-hero-headline__char--space' : ''}`}
                >
                  {character === ' ' ? '\u00A0' : character}
                </span>
              );
            })}
          </span>
        ))}
      </span>

      <span className={`dc-hero-headline__stream${phase === 'streaming' ? ' is-visible' : ''}`} aria-hidden={phase !== 'streaming'}>
        <span className="dc-hero-headline__stream-stack">
          {digitRows.map((row, index) => (
            <span key={`${streamTick}-${index}`} className="dc-hero-headline__digit-row">
              {row}
            </span>
          ))}
        </span>
      </span>
    </h1>
  );
}
