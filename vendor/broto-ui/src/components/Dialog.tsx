import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../internal/cx';
import { focusables } from '../internal/focus';
import { IconX } from '../internal/icons';
import { useLabels } from '../provider';
import { Button } from './Button';
import { Field, Textarea } from './Field';

// ---------------------------------------------------------------- Modal base (foco preso, Esc fecha)

const modalStack: HTMLElement[] = [];
// overflow original do body, salvo quando o primeiro modal abre e restaurado quando o último fecha
let savedOverflow: string | null = null;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className: string;
  overlayClassName?: string;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
  /** Fecha ao clicar fora (padrão: sim). */
  closeOnOverlay?: boolean;
}

/** Base de diálogos: portal, foco preso, Esc fecha, foco devolvido ao fechar, rolagem do body travada. */
export function Modal({ open, onClose, labelledBy, className, overlayClassName, children, role = 'dialog', closeOnOverlay = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Guarda quem tinha o foco no render em que o modal abre — antes de filhos com autoFocus roubarem o foco.
  const restoreRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    restoreRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const previous = restoreRef.current;
    if (!modalStack.length) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.push(node);

    // Foco inicial: [data-autofocus] → quem já está focado dentro (autoFocus) → 1º campo do corpo → 1º focável → o próprio modal.
    const frame = requestAnimationFrame(() => {
      const auto = node.querySelector<HTMLElement>('[data-autofocus]');
      if (auto) return auto.focus();
      if (node.contains(document.activeElement) && document.activeElement !== node) return;
      const body = node.querySelector<HTMLElement>('.bt-dialog-body');
      const target = (body ? focusables(body)[0] : undefined) ?? focusables(node)[0] ?? node;
      target.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(node);
      if (!items.length) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      const idx = modalStack.lastIndexOf(node);
      if (idx >= 0) modalStack.splice(idx, 1);
      if (!modalStack.length) {
        document.body.style.overflow = savedOverflow ?? '';
        savedOverflow = null;
      }
      if (previous && previous !== document.body && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={cx('bt-overlay', overlayClassName)}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onCloseRef.current();
      }}
      // Eventos de portal sobem pela árvore React: sem isto, um clique no diálogo dispararia o onClick
      // de quem o renderizou (ex.: a linha de uma DataTable).
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={ref} role={role} aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={className}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Dialog

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
  /** Botões do rodapé (fundo cinza claro). */
  footer?: ReactNode;
  /** Quando informado, corpo e rodapé ficam dentro de um <form> (Enter envia; botão type="submit"). */
  onSubmit?: () => void;
  role?: 'dialog' | 'alertdialog';
  /** Os filhos cuidam do próprio corpo/rodapé (use <DialogBody> / <DialogFooter>). */
  bare?: boolean;
  closeOnOverlay?: boolean;
  className?: string;
}

function DialogHeader({ titleId, title, description, onClose }: { titleId: string; title: ReactNode; description?: ReactNode; onClose: () => void }) {
  const labels = useLabels();
  return (
    <div className="bt-dialog-header">
      <div style={{ minWidth: 0 }}>
        <h2 id={titleId} className="bt-dialog-title">
          {title}
        </h2>
        {description && <div className="bt-dialog-desc">{description}</div>}
      </div>
      <button type="button" className="bt-btn bt-btn-ghost bt-btn-icon bt-btn-sm" onClick={onClose} aria-label={labels.close}>
        <IconX size={18} />
      </button>
    </div>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-dialog-body', className)}>{children}</div>;
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-dialog-footer', className)}>{children}</div>;
}

/** Espaçador para empurrar botões à direita no rodapé (ex.: checkbox à esquerda). */
export function DialogSpacer() {
  return <span className="bt-spacer" />;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  onSubmit,
  role,
  bare,
  closeOnOverlay,
  className,
}: DialogProps) {
  const titleId = useId();
  const content = bare ? (
    children
  ) : (
    <>
      <DialogBody>{children}</DialogBody>
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className={cx('bt-dialog', size !== 'md' && `bt-dialog-${size}`, className)}
      role={role}
      closeOnOverlay={closeOnOverlay}
    >
      <DialogHeader titleId={titleId} title={title} description={description} onClose={onClose} />
      {onSubmit ? (
        <form
          noValidate
          className="bt-dialog-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Drawer

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/** Painel lateral à direita (detalhes de um item sem sair da lista). */
export function Drawer({ open, onClose, title, description, children, footer, size = 'md' }: DrawerProps) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className={cx('bt-drawer', size === 'lg' && 'bt-drawer-lg')} overlayClassName="bt-drawer-overlay">
      <DialogHeader titleId={titleId} title={title} description={description} onClose={onClose} />
      <DialogBody>{children}</DialogBody>
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </Modal>
  );
}

// ---------------------------------------------------------------- Confirmação (promise)

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger (padrão) para ações destrutivas; primary para confirmações comuns. */
  tone?: 'danger' | 'primary';
  /** Pede um motivo antes de confirmar. */
  reason?: { label: string; placeholder?: string; required?: boolean };
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Habilita useConfirm() nos filhos. Renderize uma vez, perto da raiz. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const labels = useLabels();
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (r: ConfirmResult) => void } | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = useRef<((r: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<ConfirmResult>((resolve) => {
        // Uma nova confirmação cancela a anterior, para nenhuma promise ficar pendurada.
        pending.current?.({ confirmed: false });
        pending.current = resolve;
        setReason('');
        setTouched(false);
        setState({ opts, resolve });
      }),
    [],
  );

  const close = (result: ConfirmResult) => {
    state?.resolve(result);
    if (pending.current === state?.resolve) pending.current = null;
    setState(null);
  };

  const opts = state?.opts;
  const reasonMissing = !!opts?.reason?.required && !reason.trim();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close({ confirmed: false })}
        title={opts?.title ?? ''}
        size="sm"
        role="alertdialog"
        onSubmit={() => {
          setTouched(true);
          if (reasonMissing) return;
          close({ confirmed: true, reason: reason.trim() || undefined });
        }}
        footer={
          <>
            <Button onClick={() => close({ confirmed: false })}>{opts?.cancelLabel ?? labels.back}</Button>
            <Button type="submit" variant={opts?.tone === 'primary' ? 'primary' : 'danger'} data-autofocus={!opts?.reason || undefined}>
              {opts?.confirmLabel ?? labels.confirm}
            </Button>
          </>
        }
      >
        <div className="bt-stack">
          {opts?.description && <div className="bt-muted">{opts.description}</div>}
          {opts?.reason && (
            <Field label={opts.reason.label} required={opts.reason.required} error={touched && reasonMissing ? labels.reasonRequired : undefined}>
              <Textarea
                data-autofocus
                value={reason}
                placeholder={opts.reason.placeholder}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </Field>
          )}
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Pede confirmação e devolve uma promise.
 * @example
 * const confirm = useConfirm();
 * const { confirmed, reason } = await confirm({ title: 'Parar job?', reason: { label: 'Motivo', required: true } });
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.');
  return ctx;
}
