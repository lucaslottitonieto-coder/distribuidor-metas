import type { ReactNode } from 'react';
import { cx } from '../internal/cx';

export interface CountTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Cor da faixa lateral (ex.: toneColor.danger). */
  color?: string;
  /** Selecionado (filtro aplicado). */
  active?: boolean;
  onClick?: () => void;
  /** Ocupa duas colunas (resumo, distribuição). */
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Contador com faixa colorida à esquerda; clicável para filtrar. */
export function CountTile({ label, value, color, active, onClick, wide, children, className }: CountTileProps) {
  const cls = cx('bt-count-tile', active && 'bt-active', wide && 'bt-count-tile-wide', className);
  const content = (
    <>
      {color && <span className="bt-count-tile-bar" style={{ background: color }} aria-hidden />}
      <span className="bt-count-tile-label">{label}</span>
      {value !== undefined && value !== null && value !== '' && <span className="bt-count-tile-value">{value}</span>}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

export function CountStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-count-strip', className)}>{children}</div>;
}

export interface MetricItem {
  key: string;
  title: ReactNode;
  sub?: ReactNode;
  value: number;
  /** Texto do número (padrão: value). */
  display?: ReactNode;
  /** Barra abaixo (0–100). */
  progress?: number;
}

/** Lista de métricas: título/subtítulo à esquerda, número em Exo 2 à direita, barra opcional. */
export function MetricList({ items, renderBar }: { items: MetricItem[]; renderBar?: (item: MetricItem) => ReactNode }) {
  return (
    <ul className="bt-metric-list">
      {items.map((it) => (
        <li key={it.key}>
          <div className="bt-row-between">
            <div className="bt-cell-title">
              <span>{it.title}</span>
              {it.sub && <span className="bt-cell-sub">{it.sub}</span>}
            </div>
            <span className={cx('bt-metric-num', it.value > 0 && 'bt-has')}>{it.display ?? it.value}</span>
          </div>
          {renderBar
            ? renderBar(it)
            : it.progress !== undefined && (
                <div className="bt-progress" aria-hidden>
                  <div className="bt-progress-bar" style={{ width: `${Math.max(0, Math.min(100, it.progress))}%` }} />
                </div>
              )}
        </li>
      ))}
    </ul>
  );
}
