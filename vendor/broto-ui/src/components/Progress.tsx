import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { formatNumber } from '../utils/format';

export interface ProgressBarProps {
  /** 0 a 100. */
  value: number | null | undefined;
  /** Faixa animada (em andamento). */
  live?: boolean;
  tone?: 'default' | 'danger' | 'warning';
  label?: string;
  height?: number;
  className?: string;
}

export function ProgressBar({ value, live, tone = 'default', label, height, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div
      className={cx('bt-progress', live && 'bt-progress-live', tone !== 'default' && `bt-progress-${tone}`, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label ?? 'Progresso'}
      style={height ? { height } : undefined}
    >
      <div className="bt-progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface SegmentBarProps {
  used: number;
  total: number;
  /** Texto após "2/4" (ex.: "slots"). */
  unit?: string;
  /** Acima disso, vira uma barra contínua. */
  maxSegments?: number;
  showCount?: boolean;
  className?: string;
}

/** Capacidade em segmentos (slots, vagas, réplicas): ▮▮▯▯ 2/4. */
export function SegmentBar({ used, total, unit, maxSegments = 12, showCount = true, className }: SegmentBarProps) {
  const cells = Math.max(total, 1);
  const many = cells > maxSegments;
  return (
    <div className={cx('bt-segments', className)} title={`${used} de ${total}${unit ? ` ${unit}` : ''}`}>
      {many ? (
        <div className="bt-grow">
          <ProgressBar value={(used / cells) * 100} label={unit ?? 'Ocupação'} />
        </div>
      ) : (
        <div className="bt-segments-bar" aria-hidden>
          {Array.from({ length: cells }, (_, i) => (
            <span key={i} className={i < used ? 'bt-used' : undefined} />
          ))}
        </div>
      )}
      {showCount && (
        <span className="bt-num bt-nowrap">
          {used}/{total}
          {unit ? ` ${unit}` : ''}
        </span>
      )}
    </div>
  );
}

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Distribuição em barra empilhada. Segmentos com valor 0 são omitidos. */
export function StackBar({ segments, height, className }: { segments: StackSegment[]; height?: number; className?: string }) {
  const list = segments.filter((s) => s.value > 0);
  const total = list.reduce((acc, s) => acc + s.value, 0);
  const title = list.map((s) => `${s.label}: ${formatNumber(s.value)}`).join(' · ') || 'Sem dados';
  return (
    <div className={cx('bt-stackbar', className)} title={title} role="img" aria-label={title} style={height ? { height } : undefined}>
      {total > 0 && list.map((s) => <span key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />)}
    </div>
  );
}

export interface LegendItem {
  label: ReactNode;
  color: string;
  value?: ReactNode;
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={cx('bt-legend', className)}>
      {items.map((it, i) => (
        <span key={i} className="bt-legend-item">
          <span className="bt-legend-swatch" style={{ background: it.color }} aria-hidden />
          {it.label}
          {it.value !== undefined && <span className="bt-num"> {it.value}</span>}
        </span>
      ))}
    </div>
  );
}
