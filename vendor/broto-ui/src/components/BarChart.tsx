import { useState, type ReactNode } from 'react';
import { formatNumber } from '../utils/format';
import { useElementWidth } from '../utils/hooks';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarDatum {
  /** Rótulo do eixo X. */
  label: string;
  values: Record<string, number>;
  /** Título do tooltip (padrão: label). */
  title?: ReactNode;
}

export interface StackedBarChartProps {
  data: BarDatum[];
  /** Ordem de empilhamento: o primeiro fica embaixo. */
  series: BarSeries[];
  height?: number;
  /** Mostra 1 a cada N rótulos do eixo X (padrão: automático). */
  labelEvery?: number;
  formatValue?: (n: number) => string;
  'aria-label'?: string;
}

const PAD = { top: 14, right: 8, bottom: 28, left: 40 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

/** Barras empilhadas em SVG, responsivas, com tooltip verde escuro. */
export function StackedBarChart({ data, series, height = 232, labelEvery, formatValue = formatNumber, ...aria }: StackedBarChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = data.map((d) => series.reduce((acc, s) => acc + (d.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(3, Math.min(26, slot * 0.62));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 64))));
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <div ref={ref} className="bt-chart" style={{ minHeight: height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={aria['aria-label'] ?? 'Gráfico de barras'}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? 'var(--bt-neutral-300)' : 'var(--bt-neutral-200)'}
                strokeDasharray={t === 0 ? undefined : '3 4'}
              />
              <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end" className="bt-chart-axis">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const dim = hover !== null && hover !== i;
            let acc = 0;
            const drawn = series.filter((s) => (d.values[s.key] ?? 0) > 0);
            return (
              <g key={`${d.label}-${i}`} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .12s' }}>
                {drawn.map((s, si) => {
                  const v = d.values[s.key] ?? 0;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const gap = si > 0 ? 1.5 : 0;
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={y1}
                      width={barW}
                      height={Math.max(2, y0 - y1 - gap)}
                      rx={Math.min(3, barW / 3)}
                      fill={s.color}
                    />
                  );
                })}
                {i % every === 0 && (
                  <text x={PAD.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="bt-chart-axis">
                    {d.label}
                  </text>
                )}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {hovered && hover !== null && (
        <div
          className="bt-chart-tip"
          style={{
            left: Math.min(Math.max(PAD.left + hover * slot + slot / 2, 90), Math.max(90, width - 90)),
            top: Math.max(4, y(totals[hover] ?? 0) - 40 - series.length * 20),
          }}
        >
          <div className="bt-chart-tip-title">{hovered.title ?? hovered.label}</div>
          {series.map((s) => (
            <div key={s.key} className="bt-chart-tip-row">
              <span className="bt-legend-swatch" style={{ background: s.color }} /> {formatValue(hovered.values[s.key] ?? 0)} {s.label.toLowerCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
