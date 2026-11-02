import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../internal/cx';
import { IconEllipsis } from '../internal/icons';
import { useLabels, useUI } from '../provider';
import { useIsomorphicLayoutEffect } from '../utils/hooks';

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  /** Vira link (usa o linkComponent do <UIProvider>, ou <a> com external). */
  href?: string;
  external?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export type MenuEntry = MenuAction | 'separator' | { heading: string };

export interface MenuProps {
  items: MenuEntry[];
  /** Conteúdo do botão; por padrão, reticências. */
  trigger?: ReactNode;
  /** Rótulo acessível do botão (obrigatório quando o trigger não tem texto). */
  label?: string;
  /** Classe do botão (ex.: "bt-switcher", "bt-user-btn", buttonClass('secondary')). */
  triggerClassName?: string;
  align?: 'start' | 'end';
  /** Conteúdo livre no topo do menu (ex.: dados do usuário). */
  header?: ReactNode;
  minWidth?: number;
}

function isAction(e: MenuEntry): e is MenuAction {
  return typeof e === 'object' && 'label' in e;
}

/** Menu suspenso acessível: setas, Home/End, Esc, clique fora fecha. Renderizado em portal. */
export function Menu({ items, trigger, label, triggerClassName, align = 'end', header, minWidth }: MenuProps) {
  const labels = useLabels();
  const { Link } = useUI();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const a11yLabel = label ?? labels.moreActions;

  const visible = items.filter((e) => !(isAction(e) && e.hidden));
  // remove separadores sobrando nas pontas ou duplicados
  const entries = visible.filter((e, i, arr) => {
    if (e !== 'separator') return true;
    const prev = arr[i - 1];
    return i > 0 && i < arr.length - 1 && prev !== 'separator';
  });

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) btnRef.current?.focus();
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let left = align === 'end' ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('.bt-menu-item:not(:disabled)');
    first?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);

  if (!entries.some(isAction) && !header) return null;

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('.bt-menu-item:not(:disabled)') ?? []);
    const idx = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nodes[(idx + 1) % nodes.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nodes[(idx - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // devolve o foco ao botão; o Tab segue a partir dele
      close(true);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={triggerClassName ?? 'bt-btn bt-btn-ghost bt-btn-icon bt-btn-sm'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger ? label : a11yLabel}
        title={trigger ? undefined : a11yLabel}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close(false);
          else setOpen(true);
        }}
      >
        {trigger ?? <IconEllipsis size={18} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="bt-menu"
            style={{ ...(pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }), minWidth }}
            onKeyDown={onMenuKey}
            onClick={(e) => e.stopPropagation()}
          >
            {header && <div className="bt-menu-head">{header}</div>}
            {entries.map((entry, i) => {
              if (entry === 'separator') return <div key={`sep-${i}`} className="bt-menu-sep" role="separator" />;
              if (!isAction(entry)) {
                return (
                  <div key={`h-${i}`} className="bt-menu-label">
                    {entry.heading}
                  </div>
                );
              }
              const cls = cx('bt-menu-item', entry.danger && 'bt-danger');
              if (entry.href && !entry.disabled) {
                const common = {
                  role: 'menuitem',
                  className: cls,
                  onClick: () => {
                    close(false);
                    entry.onSelect?.();
                  },
                };
                return entry.external ? (
                  <a key={`${entry.label}-${i}`} href={entry.href} target="_blank" rel="noopener noreferrer" {...common}>
                    {entry.icon}
                    {entry.label}
                  </a>
                ) : (
                  <Link key={`${entry.label}-${i}`} href={entry.href} {...common}>
                    {entry.icon}
                    {entry.label}
                  </Link>
                );
              }
              return (
                <button
                  key={`${entry.label}-${i}`}
                  type="button"
                  role="menuitem"
                  className={cls}
                  disabled={entry.disabled}
                  onClick={() => {
                    // foca o botão antes da ação: se ela abrir um diálogo, o foco volta para cá ao fechar
                    close(true);
                    entry.onSelect?.();
                  }}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
