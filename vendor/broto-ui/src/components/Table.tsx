import { Fragment, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconChevronLeft, IconChevronRight, IconX } from '../internal/icons';
import { useLabels, useUI } from '../provider';
import { formatNumber } from '../utils/format';
import { IconButton } from './Button';
import { Skeleton } from './Feedback';
import { Checkbox } from './Field';

// ---------------------------------------------------------------- Primitivas

export interface TableProps {
  children: ReactNode;
  compact?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** <table> com o estilo da lib, dentro de um contêiner com rolagem horizontal. */
export function Table({ children, compact, className, ...aria }: TableProps) {
  return (
    <div className="bt-table-wrap">
      <table className={cx('bt-table', compact && 'bt-table-compact', className)} aria-label={aria['aria-label']}>
        {children}
      </table>
    </div>
  );
}

/** Linhas fantasmas enquanto a lista carrega. */
export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <Skeleton width={c === 0 ? '70%' : `${40 + ((r * 7 + c * 13) % 45)}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Título + subtítulo numa célula (nome em negrito, descrição truncada). */
export function CellTitle({ title, sub, href }: { title: ReactNode; sub?: ReactNode; href?: string }) {
  const { Link } = useUI();
  return (
    <div className="bt-cell-title">
      {href ? (
        <Link href={href} className="bt-cell-link" onClick={(e) => e.stopPropagation()}>
          {title}
        </Link>
      ) : (
        <span>{title}</span>
      )}
      {sub && <span className="bt-cell-sub">{sub}</span>}
    </div>
  );
}

/** Link de célula (texto escuro em negrito, verde no hover). */
export function CellLink({ href, children, mono }: { href: string; children: ReactNode; mono?: boolean }) {
  const { Link } = useUI();
  return (
    <Link href={href} className={cx('bt-cell-link', mono && 'bt-mono')} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- DataTable

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Coluna de ações: largura mínima, alinhada à direita, sem quebra. */
  actions?: boolean;
  /** Impede a quebra de linha do conteúdo da célula. */
  nowrap?: boolean;
  className?: string;
  hidden?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  /** Mostra linhas fantasmas no lugar das linhas. */
  loading?: boolean;
  skeletonRows?: number;
  /** Conteúdo quando não há linhas (ex.: <EmptyState compact />). */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Linha destacada (ex.: a aberta na gaveta). */
  activeRowId?: string | null;
  /** Seleção múltipla com checkbox. */
  selection?: { selected: string[]; onChange: (ids: string[]) => void };
  /** Conteúdo expandido abaixo da linha. */
  renderExpanded?: (row: T) => ReactNode | null | undefined;
  rowClassName?: (row: T) => string | undefined;
  compact?: boolean;
  /** Rodapé (ex.: <Pagination />). */
  footer?: ReactNode;
  'aria-label'?: string;
}

const alignClass = { left: undefined, right: 'bt-col-num', center: 'bt-col-center' } as const;

/** Tabela de dados com carregamento, vazio, clique na linha, seleção e linha expandida. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  skeletonRows = 6,
  empty,
  onRowClick,
  activeRowId,
  selection,
  renderExpanded,
  rowClassName,
  compact,
  footer,
  ...aria
}: DataTableProps<T>) {
  const labels = useLabels();
  const cols = columns.filter((c) => !c.hidden);
  const colCount = cols.length + (selection ? 1 : 0);
  const list = rows ?? [];
  const selectedSet = new Set(selection?.selected ?? []);
  const pageIds = list.map(getRowId);
  const selectedOnPage = pageIds.filter((id) => selectedSet.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const toggleAll = () => {
    if (!selection) return;
    if (allOnPage) selection.onChange(selection.selected.filter((id) => !pageIds.includes(id)));
    else selection.onChange(Array.from(new Set([...selection.selected, ...pageIds])));
  };

  const toggle = (id: string) => {
    if (!selection) return;
    selection.onChange(selectedSet.has(id) ? selection.selected.filter((x) => x !== id) : [...selection.selected, id]);
  };

  const cellStyle = (c: Column<T>): CSSProperties | undefined => (c.width !== undefined ? { width: c.width } : undefined);

  return (
    <>
      <Table compact={compact} aria-label={aria['aria-label']}>
        <thead>
          <tr>
            {selection && (
              <th className="bt-col-check">
                <Checkbox
                  aria-label={labels.selectAll}
                  checked={allOnPage}
                  indeterminate={selectedOnPage > 0 && !allOnPage}
                  onChange={toggleAll}
                  disabled={!list.length}
                />
              </th>
            )}
            {cols.map((c) => (
              <th key={c.key} className={cx(c.actions ? 'bt-col-actions' : c.align && alignClass[c.align], c.className)} style={cellStyle(c)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !list.length ? (
            <SkeletonRows rows={skeletonRows} cols={colCount} />
          ) : !list.length ? (
            <tr className="bt-table-empty">
              <td colSpan={colCount}>{empty}</td>
            </tr>
          ) : (
            list.map((row, i) => {
              const id = getRowId(row);
              const expanded = renderExpanded?.(row);
              const clickable = !!onRowClick;
              return (
                <Fragment key={id}>
                  <tr
                    className={cx(
                      clickable && 'bt-clickable',
                      (activeRowId === id || selectedSet.has(id)) && 'bt-selected',
                      rowClassName?.(row),
                    )}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={
                      clickable
                        ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                          }
                        : undefined
                    }
                  >
                    {selection && (
                      <td className="bt-col-check" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label={labels.selectRow} checked={selectedSet.has(id)} onChange={() => toggle(id)} />
                      </td>
                    )}
                    {cols.map((c) => (
                      <td key={c.key} className={cx(c.actions ? 'bt-col-actions' : c.align && alignClass[c.align], c.nowrap && 'bt-nowrap', c.className)} style={cellStyle(c)}>
                        {c.cell(row, i)}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr className="bt-expanded">
                      <td colSpan={colCount}>{expanded}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </Table>
      {footer}
    </>
  );
}

// ---------------------------------------------------------------- Paginação

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  /** Substantivo no plural ("itens", "jobs"). */
  noun?: string;
}

/** Rodapé "1–25 de 312 itens · Página 1 de 13 ‹ ›". */
export function Pagination({ total, limit, offset, onChange, noun }: PaginationProps) {
  const labels = useLabels();
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="bt-table-footer">
      <span className="bt-num">{labels.rangeOf(formatNumber(from), formatNumber(to), formatNumber(total), noun ?? labels.records)}</span>
      <div className="bt-pagination">
        <span className="bt-num bt-subtle" style={{ marginRight: 6 }}>
          {labels.pageOf(page, pages)}
        </span>
        <IconButton
          size="sm"
          variant="secondary"
          label={labels.previousPage}
          icon={<IconChevronLeft size={16} />}
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={labels.nextPage}
          icon={<IconChevronRight size={16} />}
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        />
      </div>
    </div>
  );
}

/** Rodapé de tabela livre (mesmo visual da paginação). */
export function TableFooter({ children }: { children: ReactNode }) {
  return <div className="bt-table-footer">{children}</div>;
}

/** Faixa de filtros acima da tabela (busca, selects, chips). */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bt-filter-bar', className)}>{children}</div>;
}

/** Barra verde escura de ações em lote, exibida quando há linhas selecionadas. */
export function BulkBar({ count, onClear, children }: { count: number; onClear?: () => void; children?: ReactNode }) {
  const labels = useLabels();
  if (count <= 0) return null;
  return (
    <div className="bt-bulk-bar" role="region" aria-label={labels.selected(count)}>
      <span className="bt-num">{labels.selected(count)}</span>
      <span className="bt-grow" />
      {children}
      {onClear && <IconButton size="sm" variant="inverse" label={labels.close} icon={<IconX size={16} />} onClick={onClear} />}
    </div>
  );
}
