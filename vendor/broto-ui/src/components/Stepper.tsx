import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconCheck, IconX } from '../internal/icons';

export type StepState = 'done' | 'current' | 'pending' | 'failed' | 'halted';

export interface Step {
  key: string;
  label: ReactNode;
  state: StepState;
  /** Linha abaixo do rótulo (ex.: horário). */
  meta?: ReactNode;
  /** Complemento discreto ao lado de meta (ex.: "+3s"). */
  delta?: ReactNode;
}

const stateText: Record<StepState, string> = {
  done: 'concluída',
  current: 'em andamento',
  pending: 'pendente',
  failed: 'falhou',
  halted: 'interrompida',
};

/** Etapas horizontais: concluída (✓ verde), atual (pulsando), pendente, falha (✕ magenta), interrompida. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cx('bt-steps', className)} style={{ '--bt-steps': steps.length } as CSSProperties}>
      {steps.map((s, i) => (
        <li key={s.key} className={cx('bt-step', `bt-step-${s.state}`)}>
          <div className="bt-step-track">
            <span className="bt-step-dot" aria-hidden>
              {s.state === 'done' && <IconCheck size={13} strokeWidth={2.5} />}
              {(s.state === 'failed' || s.state === 'halted') && <IconX size={13} strokeWidth={2.5} />}
            </span>
            {i < steps.length - 1 && <span className="bt-step-line" aria-hidden />}
          </div>
          <div className="bt-step-label">{s.label}</div>
          {(s.meta || s.delta) && (
            <div className="bt-step-meta">
              {s.meta}
              {s.delta && <span className="bt-step-delta">{s.delta}</span>}
            </div>
          )}
          <span className="bt-sr-only">{stateText[s.state]}</span>
        </li>
      ))}
    </ol>
  );
}

export interface EventItem {
  key: string;
  time?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
}

/** Lista de eventos recolhível ("Todos os eventos (6)"). */
export function EventList({ summary, items, defaultOpen }: { summary: ReactNode; items: EventItem[]; defaultOpen?: boolean }) {
  if (!items.length) return null;
  return (
    <details className="bt-events" open={defaultOpen}>
      <summary>{summary}</summary>
      <ul>
        {items.map((e) => (
          <li key={e.key}>
            {e.time !== undefined && <span className="bt-num bt-subtle">{e.time}</span>}
            <span className="bt-strong">{e.title}</span>
            {e.detail && <span className="bt-muted">{e.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
