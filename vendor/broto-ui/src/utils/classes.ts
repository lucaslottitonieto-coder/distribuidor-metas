import { cx } from '../internal/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-danger' | 'hero' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Classes de botão para aplicar em outros elementos (ex.: o <Link> do seu router). */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  opts: { icon?: boolean; block?: boolean; className?: string } = {},
): string {
  return cx(
    'bt-btn',
    variant !== 'secondary' && `bt-btn-${variant}`,
    size !== 'md' && `bt-btn-${size}`,
    opts.icon && 'bt-btn-icon',
    opts.block && 'bt-btn-block',
    opts.className,
  );
}
