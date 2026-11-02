import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconTriangleAlert } from '../internal/icons';
import { Spinner } from '../components/Feedback';

/** Tela cheia centralizada (boot, erro, 404 fora do layout). */
export function FullScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-fullscreen', className)}>{children}</div>;
}

/** Carregamento inicial: marca + spinner + texto. */
export function FullScreenLoader({ brand, label = 'Carregando…' }: { brand?: ReactNode; label?: ReactNode }) {
  return (
    <FullScreen>
      <div className="bt-boot-loader">
        {brand}
        <div className="bt-row bt-muted">
          <Spinner /> {label}
        </div>
      </div>
    </FullScreen>
  );
}

export interface StatusCardProps {
  brand?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'danger';
}

/** Cartão em box para estados de tela inteira (falha ao iniciar, sessão expirada, manutenção). */
export function StatusCard({ brand, icon, title, description, action, tone = 'danger' }: StatusCardProps) {
  return (
    <div className="bt-status-card">
      {brand}
      <div className={cx('bt-empty-icon', tone === 'danger' && 'bt-empty-icon-danger')} aria-hidden>
        {icon ?? <IconTriangleAlert size={26} />}
      </div>
      <h1 className="bt-status-card-title">{title}</h1>
      {description && <p className="bt-status-card-desc">{description}</p>}
      {action}
    </div>
  );
}

export interface NotFoundProps {
  code?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

/** 404: código em box verde escuro, título e ação de volta. */
export function NotFound({
  code = '404',
  title = 'Esta página não existe',
  description = 'O endereço pode ter mudado ou o recurso foi removido. Volte para o início e siga pelo menu.',
  action,
}: NotFoundProps) {
  return (
    <div className="bt-notfound">
      <div className="bt-notfound-code" aria-hidden>
        {code}
      </div>
      <h1 className="bt-notfound-title">{title}</h1>
      {description && <p className="bt-notfound-desc">{description}</p>}
      {action}
    </div>
  );
}

/** Carregando dentro do conteúdo de uma página. */
export function PageLoading({ label = 'Carregando…' }: { label?: ReactNode }) {
  return (
    <div className="bt-page-loading">
      <Spinner /> {label}
    </div>
  );
}
