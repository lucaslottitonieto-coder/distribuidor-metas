import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { formatDateTime, formatDuration, formatRelative, initials, secondsBetween } from '../utils/format';
import { useNow } from '../utils/hooks';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Iniciais (ou foto) num círculo verde claro. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <span className={cx('bt-avatar', size !== 'md' && `bt-avatar-${size}`, className)} title={name} aria-hidden={!src}>
      {src ? <img src={src} alt={name} /> : initials(name)}
    </span>
  );
}

/** "há 3 min", atualizado a cada segundo; data completa no title. */
export function RelativeTime({
  value,
  fallback = '—',
  timeZone,
}: {
  value: string | number | Date | null | undefined;
  fallback?: ReactNode;
  timeZone?: string;
}) {
  const now = useNow();
  const d = value === null || value === undefined || value === '' ? null : value instanceof Date ? value : new Date(value);
  if (!d || Number.isNaN(d.getTime())) return <span className="bt-subtle">{fallback}</span>;
  const absolute = formatDateTime(d, { seconds: true, timeZone });
  // now === 0: renderização no servidor/hidratação — mostra a data absoluta até o relógio do cliente assumir.
  return (
    <time dateTime={d.toISOString()} title={absolute} className="bt-nowrap" suppressHydrationWarning>
      {now === 0 ? formatDateTime(d, { timeZone }) : formatRelative(d, now)}
    </time>
  );
}

/** Duração entre início e fim; sem fim, avança a cada segundo (em destaque verde). */
export function Duration({
  start,
  end,
  seconds,
  fallback = '—',
}: {
  start?: string | number | Date | null;
  end?: string | number | Date | null;
  /** Duração já calculada, em segundos (tem prioridade). */
  seconds?: number | null;
  fallback?: ReactNode;
}) {
  const now = useNow();
  const live = seconds === undefined && !!start && !end;
  if (live && now === 0) return <span className="bt-subtle">{fallback}</span>;
  const s = seconds ?? (start ? secondsBetween(start, end ?? now) : null);
  if (s === null || s === undefined) return <span className="bt-subtle">{fallback}</span>;
  return (
    <span className={cx('bt-num bt-nowrap', live && 'bt-strong bt-text-success')}>{formatDuration(s)}</span>
  );
}

export interface StackProps {
  children: ReactNode;
  gap?: number;
  direction?: 'column' | 'row';
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
  className?: string;
}

const flexMap = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline', between: 'space-between' } as const;

/** Pilha flex simples. */
export function Stack({ children, gap = 16, direction = 'column', align, justify, wrap, className }: StackProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: direction,
        gap,
        alignItems: align ? flexMap[align] : direction === 'row' ? 'center' : undefined,
        justifyContent: justify ? flexMap[justify] : undefined,
        flexWrap: wrap ? 'wrap' : undefined,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return vertical ? <span className={cx('bt-divider-v', className)} aria-hidden /> : <hr className={cx('bt-divider', className)} />;
}
