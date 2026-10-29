import { useEffect, useRef, useState, type RefObject } from 'react';

/** Horizontal bars, one hue, value at the right. */
export function BarList({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="barlist-head">
            <span>
              {r.label}
              {r.sub && <span className="meta"> · {r.sub}</span>}
            </span>
            <span className="num">{format(r.value)}</span>
          </div>
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Daily columns with a few faint gridlines. Days with nothing sold stay as an
 * empty slot so the gaps between stall days are visible.
 */
export function DailyBars({
  days,
  format,
  axisFormat,
  label,
}: {
  days: { day: string; value: number; tick: string; detail: string }[];
  format: (n: number) => string;
  axisFormat: (n: number) => string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const width = useWidth(ref);
  const height = 200;
  const left = 44;
  const bottom = 24;
  const top = 8;
  const plotW = width - left;
  const plotH = height - bottom - top;

  const rawMax = Math.max(0, ...days.map((d) => d.value));
  const step = niceStep(rawMax / 3);
  const max = Math.max(step * 3, 1);
  const ticks = [0, step, step * 2, step * 3];
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(28, slot * 0.64));
  const labelEvery = Math.ceil(days.length / Math.max(3, Math.floor(plotW / 64)));
  const shown = active !== null ? days[active] : null;

  return (
    <figure className="daily-bars">
      <figcaption className="daily-bars-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{format(shown.value)}</strong> <span className="meta">{shown.detail}</span>
          </>
        ) : (
          <span className="meta">Tap a day to see it</span>
        )}
      </figcaption>
      <div ref={ref} className="daily-bars-plot">
        {width > 0 && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
            {ticks.map((t) => {
              const y = top + plotH - (t / max) * plotH;
              return (
                <g key={t}>
                  <line x1={left} x2={width} y1={y} y2={y} className="grid" />
                  <text x={left - 8} y={y + 4} textAnchor="end" className="tick">
                    {axisFormat(t)}
                  </text>
                </g>
              );
            })}
            {days.map((d, i) => {
              const h = (d.value / max) * plotH;
              const x = left + i * slot + (slot - barW) / 2;
              return (
                <g key={d.day}>
                  <rect
                    x={left + i * slot}
                    y={top}
                    width={slot}
                    height={plotH + bottom}
                    className="hit"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setActive(i)}
                  />
                  <rect x={x} y={top + plotH - h} width={barW} height={h} rx={2} className={`col ${active === i ? 'is-active' : ''}`} />
                  {i % labelEvery === 0 && (
                    <text x={left + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="tick">
                      {d.tick}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </figure>
  );
}

/** The element's current width in pixels, so text in the chart stays at its real size. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}
