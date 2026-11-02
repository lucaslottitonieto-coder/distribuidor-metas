import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { clampColumn, columnNames, columnStorageKey, columnStyle, parseColumnWidths, type ColumnId, type ColumnWidths } from './columnWidths';

function persist(widths: ColumnWidths) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(columnStorageKey, JSON.stringify(widths));
    else localStorage.removeItem(columnStorageKey);
  } catch { /* navegador sem armazenamento: a largura vale só até recarregar */ }
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>(() => {
    try { return parseColumnWidths(localStorage.getItem(columnStorageKey)); } catch { return {}; }
  });
  const update = (change: (prev: ColumnWidths) => ColumnWidths) => setWidths(prev => { const next = change(prev); persist(next); return next; });
  return {
    widths,
    style: columnStyle(widths) as CSSProperties,
    customized: Object.keys(widths).length > 0,
    set: (id: ColumnId, width: number) => update(prev => ({ ...prev, [id]: clampColumn(id, width) })),
    reset: (id?: ColumnId) => update(prev => { if (!id) return {}; const { [id]: _, ...rest } = prev; return rest; }),
  };
}

type Columns = ReturnType<typeof useColumnWidths>;

/** Alça na borda direita do título da coluna: arraste, use as setas ou dê duplo clique para voltar ao padrão. */
export function ColumnResizer({ id, scroll, columns }: { id: ColumnId; scroll: RefObject<HTMLElement | null>; columns: Columns }) {
  const drag = useRef<{ x: number; width: number; current: number } | null>(null);
  const cell = (el: HTMLElement) => el.parentElement!.getBoundingClientRect().width;
  const apply = (width: number) => scroll.current?.style.setProperty(`--${id}-width`, `${width}px`);

  const start = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = cell(e.currentTarget);
    drag.current = { x: e.clientX, width, current: width };
    scroll.current?.classList.add('is-resizing');
  };
  // Durante o arraste só a variável CSS muda; a tabela inteira não é renderizada de novo a cada movimento.
  const move = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    d.current = clampColumn(id, d.width + e.clientX - d.x);
    apply(d.current);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    scroll.current?.classList.remove('is-resizing');
    if (d.current !== Math.round(d.width)) columns.set(id, d.current);
    else if (columns.widths[id] === undefined) scroll.current?.style.removeProperty(`--${id}-width`);
    else apply(columns.widths[id]!);
  };
  const key = (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = (e.shiftKey ? 48 : 12) * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    if (e.key === 'Home' || e.key === 'Escape') { e.preventDefault(); columns.reset(id); }
    else if (step) { e.preventDefault(); columns.set(id, cell(e.currentTarget) + step); }
  };

  return <span className="matrix-col-resize" role="separator" aria-orientation="vertical" tabIndex={0}
    aria-label={`Ajustar largura da coluna ${columnNames[id]}`} aria-valuenow={columns.widths[id]} title="Arraste para ajustar a largura · duplo clique restaura"
    onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={key}
    onDoubleClick={e => { e.stopPropagation(); columns.reset(id); }} />;
}
