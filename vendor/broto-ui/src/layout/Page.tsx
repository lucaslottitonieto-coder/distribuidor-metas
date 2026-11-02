import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { useLabels, useUI } from '../provider';

/** Contêiner de página: largura máxima, respiro lateral e espaçamento entre blocos. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-page', className)}>{children}</div>;
}

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  /** Botões à direita. */
  actions?: ReactNode;
  /** Linha de metadados (use <MetaItem />). */
  meta?: ReactNode;
  /** Badge ao lado do título (ex.: status). */
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Cabeçalho de página em box, com a cantoneira verde no canto reto e título em Exo 2 itálico. */
export function PageHeader({ title, description, crumbs, actions, meta, badge, children, className }: PageHeaderProps) {
  const { Link } = useUI();
  const labels = useLabels();
  return (
    <header className={cx('bt-page-header', className)}>
      <div className="bt-page-header-main">
        {crumbs && crumbs.length > 0 && (
          <nav className="bt-crumbs" aria-label={labels.breadcrumb}>
            {crumbs.map((c, i) => (
              <span key={i} className="bt-crumb">
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
                {i < crumbs.length - 1 && (
                  <span aria-hidden className="bt-crumb-sep">
                    /
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="bt-page-title-row">
          <h1 className="bt-page-title">{title}</h1>
          {badge}
        </div>
        {description && <p className="bt-page-desc">{description}</p>}
        {meta && <div className="bt-page-meta">{meta}</div>}
        {children}
      </div>
      {actions && <div className="bt-page-actions">{actions}</div>}
    </header>
  );
}

/** Item da linha de metadados do cabeçalho: ícone cinza + texto. */
export function MetaItem({ icon, children, title }: { icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span className="bt-meta-item" title={title}>
      {icon}
      {children}
    </span>
  );
}

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** Bloco com título fora de card (título + descrição à esquerda, ações à direita). */
export function Section({ title, description, actions, children, className, id }: SectionProps) {
  return (
    <section className={cx('bt-section', className)} id={id}>
      {(title || actions) && (
        <div className="bt-section-head">
          <div>
            {title && <h2 className="bt-section-title">{title}</h2>}
            {description && <p className="bt-section-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export type GridLayout = 'kpi' | 'kpi-row' | '2' | '3' | 'main-side' | 'cards';

/**
 * Grades prontas:
 * kpi (auto, mín. 210px) · kpi-row (N colunas fixas, 3 em telas médias, 2 no celular) ·
 * 2 · 3 · main-side (conteúdo + coluna lateral) · cards (auto, mín. 330px).
 */
export function Grid({ layout, cols, children, className, style }: { layout: GridLayout; cols?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx(`bt-grid-${layout}`, className)} style={{ ...(cols ? ({ '--bt-cols': cols } as CSSProperties) : null), ...style }}>
      {children}
    </div>
  );
}
