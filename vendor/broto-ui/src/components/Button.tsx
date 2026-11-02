import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { useUI } from '../provider';
import { buttonClass, type ButtonSize, type ButtonVariant } from '../utils/classes';

export { buttonClass };
export type { ButtonVariant, ButtonSize };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícone à esquerda (troca por spinner durante `loading`). */
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Ocupa toda a largura. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, block, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={buttonClass(variant, size, { block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="bt-spinner" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Texto acessível (vira aria-label e title). */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={buttonClass(variant, size, { icon: true, className })}
      aria-label={label}
      title={label}
      {...rest}
    >
      {icon}
    </button>
  );
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  /** Abre em nova aba com rel seguro (usa <a> comum, fora do router). */
  external?: boolean;
}

/** Link com aparência de botão. Usa o linkComponent do <UIProvider>. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { href, variant = 'secondary', size = 'md', icon, iconRight, block, external, className, children, ...rest },
  ref,
) {
  const { Link } = useUI();
  const cls = buttonClass(variant, size, { block, className });
  if (external) {
    return (
      <a ref={ref} href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>
        {icon}
        {children}
        {iconRight}
      </a>
    );
  }
  return (
    <Link ref={ref} href={href} className={cls} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
});

/** Botão com aparência de link, para ações dentro de texto. */
export const TextButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function TextButton(
  { className, type, ...rest },
  ref,
) {
  return <button ref={ref} type={type ?? 'button'} className={cx('bt-link-btn', className)} {...rest} />;
});

export function ButtonGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-btn-group', className)}>{children}</div>;
}
