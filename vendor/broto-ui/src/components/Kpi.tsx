import { Children, Fragment, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { useUI } from '../provider';
import { Skeleton } from './Feedback';

export type KpiVariant = 'default' | 'featured' | 'alert' | 'danger' | 'success';

export interface KpiProps {
  label: ReactNode;
  icon?: ReactNode;
  value: ReactNode;
  /** Complemento menor ao lado do número (ex.: "de 12", "%"). */
  unit?: ReactNode;
  /** Rodapé. Vários itens são separados por um ponto. Também aceita uma barra (<SegmentBar />). */
  foot?: ReactNode;
  /**
   * featured: fundo verde (o indicador principal da tela, use um só);
   * alert: borda amarela; danger: borda magenta; success: borda verde.
   */
  variant?: KpiVariant;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

/** Card de indicador em forma de box, com o número em Exo 2 itálico. */
export function Kpi({ label, icon, value, unit, foot, variant = 'default', href, onClick, loading, className }: KpiProps) {
  const { Link } = useUI();
  const cls = cx('bt-kpi', variant !== 'default' && `bt-kpi-${variant}`, (href || onClick) && 'bt-kpi-interactive', className);
  const items = Array.isArray(foot) ? Children.toArray(foot) : null;
  const content = (
    <>
      <span className="bt-kpi-label">
        {icon}
        {label}
      </span>
      {loading ? (
        <Skeleton width={64} height={34} style={{ opacity: variant === 'featured' ? 0.35 : 1 }} />
      ) : (
        <span className="bt-kpi-value">
          {value}
          {unit && <small className="bt-kpi-unit">{unit}</small>}
        </span>
      )}
      {foot !== undefined && (
        <span className="bt-kpi-foot">
          {items
            ? items.map((it, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="bt-kpi-sep" aria-hidden />}
                  <span>{it}</span>
                </Fragment>
              ))
            : foot}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}
