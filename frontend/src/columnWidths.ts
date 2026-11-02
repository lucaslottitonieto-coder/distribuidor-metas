/** Colunas da matriz que o usuário pode alargar ou estreitar. A chave nomeia a variável CSS `--<chave>-width`. */
export const columnLimits = {
  agency: [150, 520],
  group: [110, 360],
  product: [130, 420],
  origin: [130, 320],
  wallet: [100, 420],
  segment: [70, 220],
  manager: [90, 360],
  amount: [100, 260],
  percent: [56, 140],
  total: [110, 300],
} as const satisfies Record<string, readonly [number, number]>;

export type ColumnId = keyof typeof columnLimits;
export type ColumnWidths = Partial<Record<ColumnId, number>>;

export const columnNames: Record<ColumnId, string> = {
  agency: 'Agência', group: 'Produto', product: 'Subproduto', origin: 'Distribuição', wallet: 'Carteira', segment: 'Segmento',
  manager: 'Gestor', amount: 'Objetivo (todos os meses)', percent: '%', total: 'Total',
};

export const columnStorageKey = 'distribuidor.matrix-columns';

const ids = Object.keys(columnLimits) as ColumnId[];

export function clampColumn(id: ColumnId, width: number) {
  const [min, max] = columnLimits[id];
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** Lê o que foi salvo no navegador, descartando colunas desconhecidas e valores inválidos. */
export function parseColumnWidths(raw: string | null): ColumnWidths {
  try {
    const saved = JSON.parse(raw || '{}');
    const widths: ColumnWidths = {};
    for (const id of ids) if (Number.isFinite(saved?.[id])) widths[id] = clampColumn(id, saved[id]);
    return widths;
  } catch { return {}; }
}

/** Variáveis CSS aplicadas na rolagem; colunas sem ajuste ficam com a largura padrão da folha de estilo. */
export function columnStyle(widths: ColumnWidths) {
  return Object.fromEntries(ids.filter(id => widths[id] !== undefined).map(id => [`--${id}-width`, `${widths[id]}px`]));
}
