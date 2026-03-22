import { useEffect, useMemo, useRef, useState } from 'react';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
}

function formatNumber(value: number, decimals: number): string {
  if (decimals > 0) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return Math.round(value).toLocaleString();
}

export default function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  durationMs = 1400,
}: AnimatedNumberProps) {
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [displayValue, setDisplayValue] = useState(0);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || prefersReducedMotion) {
      return undefined;
    }

    let frameId = 0;
    const startedAt = performance.now();

    const tick = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [durationMs, isVisible, prefersReducedMotion, value]);

  const text = useMemo(
    () => `${prefix}${formatNumber(prefersReducedMotion ? value : displayValue, decimals)}${suffix}`,
    [decimals, displayValue, prefersReducedMotion, prefix, suffix, value],
  );

  return <span ref={hostRef}>{text}</span>;
}
