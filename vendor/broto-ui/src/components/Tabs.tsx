import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../internal/cx';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Contador ao lado do rótulo. */
  count?: number | string;
  hidden?: boolean;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label'?: string;
  /** Prefixo dos ids (liga abas e painéis). Use o mesmo em <TabPanel>. */
  idPrefix?: string;
  /** Recuo lateral (abas dentro de um card). */
  inset?: boolean;
  className?: string;
}

/** Abas com sublinhado verde, navegação por setas, Home e End. */
export function Tabs<T extends string>({ tabs, value, onChange, idPrefix, inset, className, ...aria }: TabsProps<T>) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  // aria-controls só quando há painéis (<TabPanel idPrefix>); abas usadas como filtro não apontam para nada
  const hasPanels = idPrefix !== undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const visible = tabs.filter((t) => !t.hidden && !t.disabled);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = visible.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % visible.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    if (next >= 0) {
      e.preventDefault();
      const tab = visible[next];
      if (tab) {
        onChange(tab.id);
        requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`)?.focus());
      }
    }
  };

  return (
    <div className={cx('bt-tabs', inset && 'bt-tabs-inset', className)} role="tablist" aria-label={aria['aria-label']} ref={listRef} onKeyDown={onKey}>
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="bt-tab"
              data-tab={t.id}
              id={`${prefix}-${t.id}`}
              aria-selected={selected}
              aria-controls={hasPanels ? `${prefix}-panel-${t.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && <span className="bt-tab-count">{t.count}</span>}
            </button>
          );
        })}
    </div>
  );
}

export function TabPanel({
  id,
  idPrefix,
  flush,
  children,
}: {
  id: string;
  /** O mesmo idPrefix passado para <Tabs>. */
  idPrefix: string;
  /** Sem espaço acima (painel colado nas abas, dentro de card). */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-${id}`} className={cx('bt-tab-panel', flush && 'bt-tab-panel-flush')}>
      {children}
    </div>
  );
}
