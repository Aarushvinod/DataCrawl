import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import SpiderMark from '../Brand/SpiderMark';

interface SpiderFieldProps {
  reducedMotion: boolean;
}

interface SpiderWalker {
  id: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  durationMs: number;
  nextMoveAt: number;
}

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

const SPIDER_SIZE = 84;

function viewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function currentNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function retargetSpider(spider: SpiderWalker, width: number, height: number, now: number): SpiderWalker {
  const durationMs = randomBetween(2050, 2850);

  return {
    ...spider,
    x: clamp(
      spider.x + randomBetween(-width * 0.14, width * 0.14),
      18,
      width - SPIDER_SIZE,
    ),
    y: clamp(
      spider.y + randomBetween(-height * 0.12, height * 0.12),
      72,
      height - 116,
    ),
    durationMs,
    nextMoveAt: now + durationMs * randomBetween(0.72, 0.84),
  };
}

function createInitialSpiders(width: number, height: number): SpiderWalker[] {
  const now = currentNow();

  return [
    { id: 'alpha', x: width * 0.18, y: height * 0.18, anchorX: width * 0.16, anchorY: 0, durationMs: 2500, nextMoveAt: now + 1200 },
    { id: 'beta', x: width * 0.68, y: height * 0.28, anchorX: width * 0.72, anchorY: 0, durationMs: 2320, nextMoveAt: now + 900 },
    { id: 'gamma', x: width * 0.42, y: height * 0.54, anchorX: width * 0.46, anchorY: 0, durationMs: 2680, nextMoveAt: now + 1400 },
  ];
}

export default function SpiderField({ reducedMotion }: SpiderFieldProps) {
  const [viewport, setViewport] = useState(() => viewportSize());
  const [spiders, setSpiders] = useState<SpiderWalker[]>(() => {
    const size = viewportSize();
    return createInitialSpiders(size.width, size.height);
  });
  const [draggedSpiderId, setDraggedSpiderId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const draggedSpiderIdRef = useRef<string | null>(null);

  useEffect(() => {
    draggedSpiderIdRef.current = draggedSpiderId;
  }, [draggedSpiderId]);

  useEffect(() => {
    const handleResize = () => {
      const size = viewportSize();
      setViewport(size);
      setSpiders((current) => current.map((spider) => ({
        ...spider,
        x: clamp(spider.x, 0, size.width - SPIDER_SIZE),
        y: clamp(spider.y, 24, size.height - SPIDER_SIZE),
        anchorX: clamp(spider.anchorX, 24, size.width - 24),
      })));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    let frameId = 0;

    const tick = () => {
      const now = currentNow();

      setSpiders((current) => {
        let changed = false;
        const next = current.map((spider) => {
          if (spider.id === draggedSpiderIdRef.current || now < spider.nextMoveAt) {
            return spider;
          }

          changed = true;
          return retargetSpider(spider, viewport.width, viewport.height, now);
        });

        return changed ? next : current;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [reducedMotion, viewport.height, viewport.width]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      setSpiders((current) => current.map((spider) => (
        spider.id === dragState.id
          ? {
            ...spider,
            x: clamp(event.clientX - dragState.offsetX, 16, viewport.width - SPIDER_SIZE),
            y: clamp(event.clientY - dragState.offsetY, 16, viewport.height - SPIDER_SIZE),
            durationMs: 0,
            nextMoveAt: Number.POSITIVE_INFINITY,
          }
          : spider
      )));
    };

    const releasePointer = (pointerId?: number) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      if (pointerId !== undefined && dragState.pointerId !== pointerId) {
        return;
      }

      dragStateRef.current = null;
      setDraggedSpiderId(null);
      draggedSpiderIdRef.current = null;

      const now = currentNow();
      setSpiders((current) => current.map((spider) => {
        if (spider.id !== dragState.id) {
          return spider;
        }

        if (reducedMotion) {
          return {
            ...spider,
            durationMs: 0,
            nextMoveAt: now,
          };
        }

        return retargetSpider(spider, viewport.width, viewport.height, now);
      }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      releasePointer(event.pointerId);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [reducedMotion, viewport.height, viewport.width]);

  function handlePointerDown(spiderId: string, event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      id: spiderId,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    draggedSpiderIdRef.current = spiderId;
    setDraggedSpiderId(spiderId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  const walkers = spiders.map((spider) => {
    const dx = spider.x - spider.anchorX;
    const dy = spider.y - spider.anchorY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const isDragging = spider.id === draggedSpiderId;

    return {
      ...spider,
      isDragging,
      silkStyle: {
        left: spider.anchorX,
        top: spider.anchorY,
        width: distance,
        transform: `rotate(${angle}deg)`,
        transitionDuration: isDragging || reducedMotion ? '0ms' : `${spider.durationMs}ms`,
      },
      walkerStyle: {
        transform: `translate3d(${spider.x}px, ${spider.y}px, 0)`,
        transitionDuration: isDragging || reducedMotion ? '0ms' : `${spider.durationMs}ms`,
      },
    };
  });

  return (
    <div className="dc-landing__spider-field" aria-hidden="true">
      {walkers.map((spider) => (
        <div key={spider.id} className="dc-random-spider">
          <div className="dc-random-spider__silk" style={spider.silkStyle} />
          <div
            className={`dc-random-spider__walker${reducedMotion ? ' dc-random-spider__walker--still' : ''}${spider.isDragging ? ' dc-random-spider__walker--dragging' : ''}`}
            style={spider.walkerStyle}
            onPointerDown={(event) => handlePointerDown(spider.id, event)}
          >
            <SpiderMark />
          </div>
        </div>
      ))}
    </div>
  );
}
