import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconChevronsDown, IconChevronsUp, IconMinus } from '../internal/icons';
import { TONES, toneColor, type Tone } from '../utils/tones';

export { TONES, toneColor };
export type { Tone };

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Mostra o ponto colorido (padrão: sim). */
  dot?: boolean;
  /** Ponto pulsando (estado "ao vivo"). */
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = true, pulse, size = 'md', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('bt-badge', `bt-tone-${tone}`, size !== 'md' && `bt-badge-${size}`, !dot && 'bt-badge-no-dot', className)}
      {...rest}
    >
      {dot && <span className={cx('bt-dot', pulse && 'bt-pulse')} aria-hidden />}
      {children}
    </span>
  );
}

/** Rótulo + tom de um estado. */
export interface StatusMeta {
  label: string;
  tone: Tone;
  pulse?: boolean;
}

export type StatusMap<S extends string> = Record<S, StatusMeta>;

export interface StatusBadgeProps<S extends string> {
  status: S;
  map: Partial<StatusMap<S>>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Badge a partir de um mapa estado → { rótulo, tom }. Estados desconhecidos aparecem em tom neutro. */
export function StatusBadge<S extends string>({ status, map, size, className }: StatusBadgeProps<S>) {
  const meta = map[status] ?? { label: status, tone: 'neutral' as Tone };
  return (
    <Badge tone={meta.tone} pulse={meta.pulse} size={size} className={className}>
      {meta.label}
    </Badge>
  );
}

/**
 * Cria um componente de badge tipado para um enum do seu domínio.
 * @example
 * const JobBadge = createStatusBadge({ running: { label: 'Executando', tone: 'live', pulse: true }, ... });
 * <JobBadge status={job.status} />
 */
export function createStatusBadge<S extends string>(map: StatusMap<S>) {
  function Bound({ status, size, className }: { status: S; size?: 'sm' | 'md' | 'lg'; className?: string }) {
    return <StatusBadge status={status} map={map} size={size} className={className} />;
  }
  Bound.displayName = 'StatusBadge';
  return Bound;
}

export function StatusDot({ tone, pulse, title, className }: { tone: Tone; pulse?: boolean; title?: string; className?: string }) {
  return (
    <span
      className={cx('bt-status-dot', `bt-tone-${tone}`, pulse && 'bt-pulse', className)}
      title={title}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    />
  );
}

/** Indicador "ao vivo": verde pulsando quando ligado, amarelo enquanto conecta. */
export function LiveDot({ on = true, className }: { on?: boolean; className?: string }) {
  return <span className={cx('bt-live-dot', on && 'bt-on', className)} aria-hidden />;
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'green' | 'solid' | 'outline';
  /** Fonte monoespaçada (ids, versões, filas). */
  mono?: boolean;
  /** Sigla em Exo 2 itálico (tipos e categorias curtas, ex.: RPA, ETL). */
  display?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Tag({ variant = 'neutral', mono, display, icon, className, children, ...rest }: TagProps) {
  return (
    <span
      className={cx('bt-tag', variant !== 'neutral' && `bt-tag-${variant}`, mono && 'bt-mono', display && 'bt-tag-display', className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  /** Selecionado (aria-pressed). */
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Tom aplicado quando selecionado; mostra um ponto da cor do tom. */
  tone?: Tone;
  count?: ReactNode;
  children: ReactNode;
}

/** Chip de filtro (multi-seleção). */
export function Chip({ pressed, onPressedChange, tone, count, className, children, onClick, type, ...rest }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx('bt-chip', tone && `bt-tone-${tone}`, className)}
      aria-pressed={pressed === undefined ? undefined : pressed}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange?.(!pressed);
      }}
      {...rest}
    >
      {tone && <span className="bt-dot" aria-hidden />}
      {children}
      {count !== undefined && <span className="bt-chip-count">{count}</span>}
    </button>
  );
}

export type PriorityLevel = 'high' | 'normal' | 'low';

const priorityText: Record<PriorityLevel, string> = { high: 'Alta', normal: 'Normal', low: 'Baixa' };

/** Prioridade com setas: Alta (laranja, forte), Normal, Baixa. */
export function Priority({ level, label, showNormalIcon }: { level: PriorityLevel; label?: ReactNode; showNormalIcon?: boolean }) {
  const text = label ?? priorityText[level];
  if (level === 'normal') {
    return (
      <span className="bt-priority bt-muted">
        {showNormalIcon && <IconMinus size={15} />}
        {text}
      </span>
    );
  }
  return (
    <span className={cx('bt-priority', level === 'high' && 'bt-priority-high')}>
      {level === 'high' ? <IconChevronsUp size={15} /> : <IconChevronsDown size={15} />}
      {text}
    </span>
  );
}
