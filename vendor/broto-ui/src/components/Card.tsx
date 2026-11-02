import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Botões/links à direita do cabeçalho. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Corpo sem padding (tabelas, listas que vão até a borda). */
  flush?: boolean;
  /** Os filhos são renderizados direto, sem .bt-card-body (monte o corpo você mesmo). */
  bare?: boolean;
  /** Forma do box: canto superior esquerdo reto. */
  box?: boolean;
  /** Moldura verde (destaque). */
  frame?: boolean;
  /** Cantoneira verde no canto reto. */
  corner?: boolean;
  as?: ElementType;
  children?: ReactNode;
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  flush,
  bare,
  box,
  frame,
  corner,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag className={cx('bt-card', box && 'bt-box', frame && 'bt-frame', corner && 'bt-corner', className)} {...rest}>
      {(title || actions) && <CardHeader title={title} subtitle={subtitle} actions={actions} />}
      {bare ? children : <CardBody flush={flush}>{children}</CardBody>}
      {footer && <CardFooter>{footer}</CardFooter>}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('bt-card-header', className)}>
      <div className="bt-grow">
        {title && <h2 className="bt-card-title">{title}</h2>}
        {subtitle && <div className="bt-card-sub">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="bt-card-actions">{actions}</div>}
    </div>
  );
}

export function CardBody({ flush, className, children }: { flush?: boolean; className?: string; children?: ReactNode }) {
  return <div className={cx('bt-card-body', flush && 'bt-flush', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cx('bt-card-footer', className)}>{children}</div>;
}

/** Ícone num quadrado com o canto reto (cards de entidade, listas). */
export function IconTile({
  children,
  tone = 'brand',
  size,
  className,
}: {
  children: ReactNode;
  tone?: 'brand' | 'muted' | 'danger';
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cx('bt-icon-tile', tone !== 'brand' && `bt-icon-tile-${tone}`, className)}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden
    >
      {children}
    </span>
  );
}
