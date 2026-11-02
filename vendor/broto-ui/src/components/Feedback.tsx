import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconCircleAlert, IconCircleCheck, IconInfo, IconRefresh, IconTriangleAlert } from '../internal/icons';
import { useLabels } from '../provider';
import { Button } from './Button';

export function Spinner({ label, size, className }: { label?: string; size?: number; className?: string }) {
  const labels = useLabels();
  return (
    <span
      className={cx('bt-spinner', className)}
      role="status"
      aria-label={label ?? labels.loading}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: 'default' | 'danger';
  className?: string;
}

/** Estado vazio: ícone num box verde claro, título em Exo 2 itálico e uma ação opcional. */
export function EmptyState({ icon, title, description, action, compact, tone = 'default', className }: EmptyStateProps) {
  return (
    <div className={cx('bt-empty', compact && 'bt-empty-compact', className)}>
      {icon && (
        <div className={cx('bt-empty-icon', tone === 'danger' && 'bt-empty-icon-danger')} aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="bt-empty-title">{title}</h3>
      {description && <p className="bt-empty-desc">{description}</p>}
      {action && <div className="bt-empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 14,
  style,
  className,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  return <span className={cx('bt-skeleton', className)} style={{ width, height, ...style }} aria-hidden />;
}

/** Bloco de linhas fantasmas enquanto um conteúdo carrega. */
export function SkeletonBlock({ lines = 4 }: { lines?: number }) {
  const labels = useLabels();
  return (
    <div className="bt-stack-sm" aria-busy="true" aria-label={labels.loading}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - ((i * 17) % 40)}%`} />
      ))}
    </div>
  );
}

export type CalloutTone = 'danger' | 'warning' | 'info' | 'success';

const calloutIcon: Record<CalloutTone, ReactNode> = {
  danger: <IconCircleAlert size={18} />,
  warning: <IconTriangleAlert size={18} />,
  info: <IconInfo size={18} />,
  success: <IconCircleCheck size={18} />,
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Lista de detalhes (ex.: erros de validação). */
  items?: ReactNode[];
  icon?: ReactNode;
  className?: string;
}

export function Callout({ tone = 'info', title, children, items, icon, className }: CalloutProps) {
  return (
    <div className={cx('bt-callout', `bt-callout-${tone}`, className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon ?? calloutIcon[tone]}
      <div className="bt-grow">
        {title && <div className="bt-callout-title">{title}</div>}
        {children}
        {items && items.length > 0 && (
          <ul>
            {items.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  /** Texto do erro. Se omitido e `error` for informado, usa error.message. */
  description?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'detail' in error && typeof (error as { detail: unknown }).detail === 'string') {
    return (error as { detail: string }).detail;
  }
  return String(error);
}

/** Falha ao carregar: ícone de alerta, mensagem e botão de nova tentativa. */
export function ErrorState({ title = 'Não foi possível carregar', description, error, onRetry, retryLabel, compact }: ErrorStateProps) {
  const labels = useLabels();
  return (
    <EmptyState
      compact={compact}
      icon={<IconTriangleAlert size={26} />}
      title={title}
      description={description ?? errorMessage(error) ?? 'Tente de novo em alguns instantes.'}
      action={
        onRetry ? (
          <Button icon={<IconRefresh size={16} />} onClick={onRetry}>
            {retryLabel ?? labels.retry}
          </Button>
        ) : undefined
      }
    />
  );
}
