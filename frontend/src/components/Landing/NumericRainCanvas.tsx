import { useEffect, useRef } from 'react';

interface NumericRainCanvasProps {
  reducedMotion: boolean;
}

interface RainColumn {
  headRow: number;
  trailLength: number;
  stepIntervalMs: number;
  nextStepAt: number;
}

export default function NumericRainCanvas({ reducedMotion }: NumericRainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let fontSize = 30;
    let rowHeight = 29;
    let columnSpacing = 13;
    let rowCount = 0;
    let columns: RainColumn[] = [];
    const glyphs = '0123456789';
    const trailMin = 18;
    const trailMax = 36;

    const randomGlyph = () => glyphs[Math.floor(Math.random() * glyphs.length)];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      fontSize = width < 720 ? 22 : 30;
      rowHeight = Math.round(fontSize * 0.98);
      columnSpacing = Math.max(10, Math.round(fontSize * 0.48));

      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const columnCount = Math.ceil(width / columnSpacing) + 8;
      rowCount = Math.ceil(height / rowHeight) + 38;
      const now = performance.now();

      columns = Array.from({ length: columnCount }, () => ({
        headRow: Math.floor(Math.random() * rowCount),
        trailLength: trailMin + Math.floor(Math.random() * (trailMax - trailMin + 1)),
        stepIntervalMs: 28 + Math.random() * 26,
        nextStepAt: now + Math.random() * 260,
      }));
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const drawFrame = (now: number) => {
      context.fillStyle = 'rgba(2, 7, 6, 0.92)';
      context.fillRect(0, 0, width, height);
      context.font = `${fontSize}px var(--font-mono)`;
      context.textAlign = 'center';
      context.textBaseline = 'top';

      columns.forEach((column, index) => {
        if (!reducedMotion && now >= column.nextStepAt) {
          column.headRow += 1;
          column.nextStepAt = now + column.stepIntervalMs;

          if (column.headRow - column.trailLength > rowCount) {
            column.headRow = -Math.floor(Math.random() * 28);
            column.trailLength = trailMin + Math.floor(Math.random() * (trailMax - trailMin + 1));
            column.stepIntervalMs = 28 + Math.random() * 26;
            column.nextStepAt = now + column.stepIntervalMs;
          }
        }

        const x = index * columnSpacing + fontSize * 0.5;

        for (let trailIndex = 0; trailIndex < column.trailLength; trailIndex += 1) {
          const row = column.headRow - trailIndex;
          if (row < 0 || row > rowCount) {
            continue;
          }

          const y = row * rowHeight;
          const alpha = 1 - trailIndex / column.trailLength;
          context.fillStyle = trailIndex === 0
            ? `rgba(247, 255, 249, ${Math.min(1, alpha + 0.16)})`
            : trailIndex < 4
              ? `rgba(152, 255, 196, ${Math.max(0.62, alpha * 0.98)})`
              : `rgba(92, 255, 166, ${Math.max(0.22, alpha * 0.7)})`;
          context.fillText(randomGlyph(), x, y);
        }
      });

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(performance.now());

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="dc-landing__rain" aria-hidden="true" />;
}
