// Avisos (toasts): store mínimo, utilizável fora do React (ex.: em interceptors de API).
import { useSyncExternalStore, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconCircleAlert, IconCircleCheck, IconInfo, IconTriangleAlert, IconX } from '../internal/icons';
import { useLabels } from '../provider';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: ReactNode;
  details?: string[];
  action?: ReactNode;
}

export interface ToastOptions {
  description?: ReactNode;
  details?: string[];
  action?: ReactNode;
  /** Tempo em ms até sumir (padrão: 4,5 s; erros 8 s). 0 = fica até fechar. */
  duration?: number;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const EMPTY: ToastItem[] = [];

function push(kind: ToastKind, title: string, opts: ToastOptions | string | undefined): number {
  const o: ToastOptions = typeof opts === 'string' ? { description: opts } : (opts ?? {});
  // evita duplicar a mesma mensagem que já está visível (devolve o id da que já existe)
  const existing = items.find((t) => t.kind === kind && t.title === title && t.description === o.description);
  if (existing) return existing.id;
  const id = ++seq;
  items = [...items.slice(-4), { id, kind, title, description: o.description, details: o.details, action: o.action }];
  emit();
  const ttl = o.duration ?? (kind === 'error' ? 8000 : 4500);
  if (ttl > 0) setTimeout(() => dismiss(id), ttl);
  return id;
}

function dismiss(id: number) {
  const next = items.filter((t) => t.id !== id);
  if (next.length !== items.length) {
    items = next;
    emit();
  }
}

/**
 * Dispara avisos de qualquer lugar.
 * @example toast.success('Item criado', 'Na fila conciliacao-itens.')
 * @example toast.error('Falha ao salvar', { details: ['nome: obrigatório'] })
 */
export const toast = {
  success: (title: string, opts?: ToastOptions | string) => push('success', title, opts),
  error: (title: string, opts?: ToastOptions | string) => push('error', title, opts),
  info: (title: string, opts?: ToastOptions | string) => push('info', title, opts),
  warning: (title: string, opts?: ToastOptions | string) => push('warning', title, opts),
  dismiss,
  clear: () => {
    items = [];
    emit();
  },
};

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => EMPTY,
  );
}

const icons: Record<ToastKind, ReactNode> = {
  success: <IconCircleCheck size={20} />,
  error: <IconCircleAlert size={20} />,
  info: <IconInfo size={20} />,
  warning: <IconTriangleAlert size={20} />,
};

/** Renderize uma vez, perto da raiz do app. */
export function Toaster({ position = 'bottom-right' }: { position?: 'bottom-right' | 'top-right' }) {
  const list = useToasts();
  const labels = useLabels();
  return (
    <div className={cx('bt-toasts', position === 'top-right' && 'bt-toasts-top')} aria-live="polite" aria-relevant="additions">
      {list.map((t) => (
        <div key={t.id} className={cx('bt-toast', t.kind !== 'success' && `bt-toast-${t.kind}`)} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="bt-toast-icon" aria-hidden>
            {icons[t.kind]}
          </span>
          <div className="bt-grow">
            <div className="bt-toast-title">{t.title}</div>
            {t.description && <div className="bt-toast-desc">{t.description}</div>}
            {t.details && t.details.length > 0 && (
              <ul className="bt-toast-details">
                {t.details.slice(0, 5).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            {t.action && <div className="bt-toast-action">{t.action}</div>}
          </div>
          <button type="button" className="bt-toast-close" aria-label={labels.dismiss} onClick={() => dismiss(t.id)}>
            <IconX size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
