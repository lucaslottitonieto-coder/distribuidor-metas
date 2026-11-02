/** Cálculos dos relatórios a partir da matriz de metas (`/goals`): tudo aqui é puro, sem tela nem rede. */
import type { Agency, Goal, MatrixRow, PortfolioPlan } from './api.ts';

export type ReportFilters = { regional: number; agency: number; product: number; segment: number; manager: string };
export const NO_FILTERS: ReportFilters = { regional: 0, agency: 0, product: 0, segment: 0, manager: '' };
export const NO_MANAGER = 'Sem gestor';

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const sum = (values: number[]) => round3(values.reduce((a, b) => a + b, 0));
export const managerOf = (wallet: { manager?: string }) => wallet.manager?.trim() || NO_MANAGER;
/** Percentuais não são aditivos: totais de regional/ano só fazem sentido para reais e quantidades. */
export const isAdditive = (unit: string) => unit !== 'PCT';

/** Uma meta (agência × subproduto) já filtrada. Com filtro de segmento/gestor os valores passam a ser a soma das carteiras escolhidas. */
export type Line = { key: number; agency: Agency; goal: Goal; wallets: PortfolioPlan[]; allWallets: PortfolioPlan[]; months: number[]; total: number; planned: number; scoped: boolean };

export function buildLines(rows: MatrixRow[], f: ReportFilters): Line[] {
  const scoped = !!f.segment || !!f.manager;
  const lines: Line[] = [];
  for (const row of rows) {
    if ((f.regional && row.agency.regional_id !== f.regional) || (f.agency && row.agency.id !== f.agency) || (f.product && row.goal.product_id !== f.product)) continue;
    const wallets = row.portfolios.filter(p => (!f.segment || p.segment_id === f.segment) && (!f.manager || managerOf(p) === f.manager));
    if (scoped && !wallets.length) continue;
    const months = scoped
      ? Array.from({ length: 12 }, (_, i) => sum(wallets.map(w => w.months.find(m => m.month === i + 1)?.amount ?? 0)))
      : Array.from({ length: 12 }, (_, i) => row.goal.months.find(m => m.month === i + 1)?.amount ?? 0);
    const total = sum(months);
    lines.push({ key: row.goal.id, agency: row.agency, goal: row.goal, wallets, allWallets: row.portfolios, months, total, planned: scoped ? total : row.goal.annual_amount, scoped });
  }
  return lines;
}

export const quarters = (months: number[]) => [0, 1, 2, 3].map(q => sum(months.slice(q * 3, q * 3 + 3)));
export const shareOf = (value: number, total: number) => total ? value / total : 0;

// ---------- Resumo ----------

export type ProductSummary = { product: { id: number; name: string; sub_product: string; unit: Goal['unit'] }; lines: Line[]; additive: boolean; planned: number; total: number; months: number[]; agencies: number; goals: number; loaded: number };

export function summarizeByProduct(lines: Line[]): ProductSummary[] {
  const groups = new Map<number, Line[]>();
  lines.forEach(l => groups.set(l.goal.product_id, [...(groups.get(l.goal.product_id) ?? []), l]));
  return [...groups].sort(([a], [b]) => a - b).map(([, list]) => {
    const goal = list[0].goal;
    return {
      product: { id: goal.product_id, name: goal.product_name, sub_product: goal.sub_product, unit: goal.unit },
      lines: list, additive: isAdditive(goal.unit),
      planned: sum(list.map(l => l.planned)), total: sum(list.map(l => l.total)),
      months: Array.from({ length: 12 }, (_, i) => sum(list.map(l => l.months[i]))),
      agencies: new Set(list.map(l => l.agency.id)).size, goals: list.length, loaded: list.filter(l => l.planned !== 0).length,
    };
  });
}

// ---------- Conferência ----------

export type IssueKind = 'sem_total' | 'a_distribuir' | 'faltam' | 'meses_origem' | 'sem_carteiras' | 'carteira_zerada' | 'uma_zerada' | 'percentual';
export type Severity = 'alta' | 'media' | 'baixa';
export const ISSUE_INFO: Record<IssueKind, { label: string; severity: Severity; hint: string }> = {
  faltam: { label: 'Faltam distribuir', severity: 'alta', hint: 'A soma dos meses ficou menor que o total anual.' },
  sem_carteiras: { label: 'Meta sem carteiras', severity: 'alta', hint: 'A meta tem valor, mas a agência não tem carteira ativa para receber.' },
  percentual: { label: 'Percentual não fecha 100%', severity: 'alta', hint: 'Em algum mês as carteiras não somam 100% da meta da agência.' },
  a_distribuir: { label: 'Total a distribuir', severity: 'media', hint: 'O total anual foi informado, mas os meses ainda não foram distribuídos.' },
  meses_origem: { label: 'Meses para revisar', severity: 'media', hint: 'Meses ausentes na importação de origem.' },
  carteira_zerada: { label: 'Carteira sem meta', severity: 'media', hint: 'Carteira com 0 em todos os meses, mas a agência tem meta.' },
  uma_zerada: { label: 'Só uma carteira zerada', severity: 'baixa', hint: 'Em algum mês só uma carteira está com 0 e todas as outras têm meta.' },
  sem_total: { label: 'Sem meta carregada', severity: 'baixa', hint: 'Agência e subproduto sem total nem meses.' },
};
export const ISSUE_ORDER = Object.keys(ISSUE_INFO) as IssueKind[];
const severityRank: Record<Severity, number> = { alta: 0, media: 1, baixa: 2 };

export type Issue = { id: string; kind: IssueKind; severity: Severity; line: Line; wallet?: PortfolioPlan; amount?: number; months?: number[] };

const monthAmount = (wallet: PortfolioPlan, month: number) => wallet.months.find(m => m.month === month)?.amount ?? 0;
const walletMonths = (wallet: PortfolioPlan) => Array.from({ length: 12 }, (_, i) => monthAmount(wallet, i + 1));

/** Pendências de cada meta. Use linhas sem filtro de segmento/gestor: a conferência olha a meta inteira. */
export function findIssues(lines: Line[]): Issue[] {
  const issues: Issue[] = [];
  const add = (kind: IssueKind, line: Line, extra: Partial<Issue> = {}) => issues.push({ id: `${line.key}:${kind}:${extra.wallet?.id ?? ''}`, kind, severity: ISSUE_INFO[kind].severity, line, ...extra });
  for (const line of lines) {
    const { goal } = line;
    const monthsTotal = sum(line.months);
    if (goal.annual_amount === 0 && monthsTotal === 0) { add('sem_total', line); continue; }
    if (goal.annual_pending) { add('a_distribuir', line); continue; }
    if (isAdditive(goal.unit)) {
      const gap = goal.annual_amount >= 0 ? goal.annual_amount - monthsTotal : monthsTotal - goal.annual_amount;
      if (round3(gap) > 0) add('faltam', line, { amount: round3(gap) });
    }
    if (goal.missing_months.length) add('meses_origem', line, { months: goal.missing_months });
    const wallets = line.allWallets;
    if (!wallets.length) { add('sem_carteiras', line); continue; }
    const perWallet = wallets.map(walletMonths);
    const zeroAllYear = perWallet.map(m => m.every(v => v === 0));
    wallets.forEach((wallet, i) => { if (zeroAllYear[i] && monthsTotal !== 0) add('carteira_zerada', line, { wallet }); });
    if (wallets.length > 1) {
      wallets.forEach((wallet, i) => {
        if (zeroAllYear[i]) return;
        const lone = perWallet[i].map((v, m) => ({ v, m: m + 1 })).filter(({ v, m }) => v === 0 && perWallet.every((other, j) => j === i || other[m - 1] !== 0)).map(({ m }) => m);
        if (lone.length) add('uma_zerada', line, { wallet, months: lone });
      });
    }
    const open = Array.from({ length: 12 }, (_, i) => i + 1).filter(month => line.months[month - 1] !== 0 && Math.abs(wallets.reduce((s, w) => s + (w.months.find(m => m.month === month)?.percent ?? 0), 0) - 100) > 0.01);
    if (open.length) add('percentual', line, { months: open });
  }
  return issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.line.agency.regional_name ?? '').localeCompare(b.line.agency.regional_name ?? '', 'pt-BR') || a.line.agency.code.localeCompare(b.line.agency.code, 'pt-BR', { numeric: true }) || a.line.goal.product_id - b.line.goal.product_id || ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind));
}

export const countByKind = (issues: Issue[]) => Object.fromEntries(ISSUE_ORDER.map(kind => [kind, issues.filter(i => i.kind === kind).length])) as Record<IssueKind, number>;

/** Agência "completa": nenhuma pendência de severidade alta ou média em nenhum subproduto. */
export function agencyCompleteness(lines: Line[], issues: Issue[]) {
  const agencies = new Set(lines.map(l => l.agency.id));
  const blocked = new Set(issues.filter(i => i.severity !== 'baixa').map(i => i.line.agency.id));
  return { total: agencies.size, complete: [...agencies].filter(id => !blocked.has(id)).length };
}

export function describeIssue(issue: Issue, money: (value: number, unit: string) => string, monthNames: string[]) {
  const names = (issue.months ?? []).map(m => monthNames[m - 1]).join(', ');
  switch (issue.kind) {
    case 'faltam': return `Faltam ${money(issue.amount ?? 0, issue.line.goal.unit)} para fechar o total anual.`;
    case 'percentual': return `Meses com carteiras fora de 100%: ${names}.`;
    case 'meses_origem': return `Meses ausentes na origem: ${names}.`;
    case 'uma_zerada': return `${issue.wallet?.code ?? ''} ${issue.wallet?.name ?? ''} está em 0 sozinha em: ${names}.`.trim();
    case 'carteira_zerada': return `${issue.wallet?.code ?? ''} ${issue.wallet?.name ?? ''} está com 0 em todos os meses.`.trim();
    default: return ISSUE_INFO[issue.kind].hint;
  }
}

// ---------- Consolidado ----------

export type ConsolidatedRow = { key: string; level: 'regional' | 'agency'; label: string; code?: string; agencyId?: number; total: number; planned: number; months: number[] };
export type ConsolidatedSection = { summary: ProductSummary; rows: ConsolidatedRow[] };

/** Por subproduto (a unidade nunca mistura): regional com o subtotal e as agências abaixo dela. */
export function consolidate(lines: Line[]): ConsolidatedSection[] {
  return summarizeByProduct(lines).map(summary => {
    const byRegional = new Map<string, Line[]>();
    summary.lines.forEach(l => { const name = l.agency.regional_name || 'Sem regional'; byRegional.set(name, [...(byRegional.get(name) ?? []), l]); });
    const rows: ConsolidatedRow[] = [];
    [...byRegional].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).forEach(([name, list]) => {
      if (summary.additive) rows.push({ key: `r:${summary.product.id}:${name}`, level: 'regional', label: name, total: sum(list.map(l => l.total)), planned: sum(list.map(l => l.planned)), months: Array.from({ length: 12 }, (_, i) => sum(list.map(l => l.months[i]))) });
      else rows.push({ key: `r:${summary.product.id}:${name}`, level: 'regional', label: name, total: 0, planned: 0, months: Array(12).fill(0) });
      [...list].sort((a, b) => a.agency.code.localeCompare(b.agency.code, 'pt-BR', { numeric: true })).forEach(l => rows.push({ key: `a:${l.key}`, level: 'agency', label: l.agency.name, code: l.agency.code, agencyId: l.agency.id, total: l.total, planned: l.planned, months: l.months }));
    });
    return { summary, rows };
  });
}

// ---------- Carteiras, segmentos e gestores ----------

export type WalletRow = { key: string; line: Line; wallet: PortfolioPlan; months: number[]; total: number; share: number };

/** Carteiras das linhas, com a participação de cada uma na meta inteira da agência naquele subproduto. */
export function walletRows(lines: Line[]): WalletRow[] {
  const rows: WalletRow[] = [];
  for (const line of lines) {
    const goalTotal = sum(line.goal.months.map(m => m.amount));
    for (const wallet of line.wallets) {
      const months = walletMonths(wallet);
      const total = sum(months);
      rows.push({ key: `${line.key}:${wallet.id}`, line, wallet, months, total, share: shareOf(total, goalTotal) });
    }
  }
  return rows;
}

export type Slice = { id: string; label: string; color?: string; total: number; share: number; wallets: number; agencies: number };
const sliceBy = (rows: WalletRow[], idOf: (r: WalletRow) => string, labelOf: (r: WalletRow) => string, colorOf?: (r: WalletRow) => string): Slice[] => {
  const grand = sum(rows.map(r => r.total));
  const groups = new Map<string, WalletRow[]>();
  rows.forEach(r => groups.set(idOf(r), [...(groups.get(idOf(r)) ?? []), r]));
  return [...groups].map(([id, list]) => ({ id, label: labelOf(list[0]), color: colorOf?.(list[0]), total: sum(list.map(r => r.total)), share: shareOf(sum(list.map(r => r.total)), grand), wallets: list.length, agencies: new Set(list.map(r => r.line.agency.id)).size }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'));
};
export const bySegment = (rows: WalletRow[]) => sliceBy(rows, r => String(r.wallet.segment_id), r => r.wallet.segment_code ? `${r.wallet.segment_code} · ${r.wallet.segment_name}` : r.wallet.segment_name, r => r.wallet.color);
export const byManager = (rows: WalletRow[]) => sliceBy(rows, r => managerOf(r.wallet), r => managerOf(r.wallet));

// ---------- CSV ----------

/** CSV com ponto e vírgula e BOM, como o resto das exportações. Números saem com vírgula decimal e textos com cara de fórmula levam apóstrofo. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    if (typeof value === 'number') return `"${String(value).replace('.', ',')}"`;
    const text = String(value ?? '');
    const safe = /^[=+@-]/.test(text) && !/^-\d[\d.,]*$/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

// ---------- Mudanças e comparativos ----------

export type VersionChange = { kind: 'annual' | 'month' | 'portfolio'; label: string; before: number; after: number };
export type VersionEntry = {
  id: number; goal_id: number; version: number; timestamp: string; actor: string | null; action: string; detail: string; year: number;
  agency: { id: number; code: string; name: string; regional_id?: number };
  product: { id: number; name: string; sub_product: string; unit: string };
  annual_amount: number; changes: VersionChange[];
};
export type VersionsResponse = { total: number; entries: VersionEntry[]; counts: { all: number; unlock: number; import: number }; actors: (string | null)[]; actions: string[] };
export const NO_ACTOR = '__sem_autor__';
export const ACTION_LABELS: Record<string, string> = { create: 'Criação', baseline: 'Situação inicial', update: 'Alteração', import: 'Importação', distribute: 'Distribuição' };

/** Total destravado: o log grava "Total anual destravado: 12000000 → 12500000. Motivo: …". */
export function parseUnlock(detail: string) {
  const found = /Total anual destravado: (\S+) → (\S+)\. Motivo: (.*?)\.(?= Importação alterou:|\s*$)/.exec(detail);
  return found ? { before: Number(found[1]), after: Number(found[2]), reason: found[3] } : null;
}
/** Meses trocados por uma planilha: "Janeiro 1100000 → 1000000; Fevereiro …". */
export function parseImport(detail: string) {
  const found = /Importação alterou: (.*)\.\s*$/.exec(detail);
  return found ? found[1].split('; ') : null;
}

export type VersionSnapshot = { version: number; timestamp: string; actor: string | null; action: string; detail: string; annual_amount: number; months: number[]; portfolios: { id: number; name: string; amounts: number[] }[] };
export type VersionDiff = {
  annual: { a: number; b: number; delta: number };
  months: { month: number; a: number; b: number; delta: number }[];
  wallets: { id: number; name: string; a: number; b: number; delta: number; months: { month: number; a: number; b: number }[] }[];
  changedMonths: number;
};

/** Compara duas versões da mesma meta: total, cada mês e cada carteira (A = antes, B = depois). */
export function diffVersions(a: VersionSnapshot, b: VersionSnapshot): VersionDiff {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, a: a.months[i] ?? 0, b: b.months[i] ?? 0, delta: round3((b.months[i] ?? 0) - (a.months[i] ?? 0)) }));
  const ids = [...new Set([...a.portfolios, ...b.portfolios].map(p => p.id))].sort((x, y) => x - y);
  const wallets = ids.map(id => {
    const before = a.portfolios.find(p => p.id === id), after = b.portfolios.find(p => p.id === id);
    const perMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, a: before?.amounts[i] ?? 0, b: after?.amounts[i] ?? 0 }));
    const totalA = sum(perMonth.map(m => m.a)), totalB = sum(perMonth.map(m => m.b));
    return { id, name: (after ?? before)!.name, a: totalA, b: totalB, delta: round3(totalB - totalA), months: perMonth };
  });
  return { annual: { a: a.annual_amount, b: b.annual_amount, delta: round3(b.annual_amount - a.annual_amount) }, months, wallets, changedMonths: months.filter(m => m.delta !== 0).length };
}

export type YearRow = { key: string; agency: Agency; a: number; b: number; delta: number; pct: number | null; monthsA: number[]; monthsB: number[] };
export type YearSection = { product: ProductSummary['product']; additive: boolean; totalA: number; totalB: number; delta: number; pct: number | null; monthsA: number[]; monthsB: number[]; rows: YearRow[] };
const variation = (a: number, b: number) => a ? Math.round(((b - a) / Math.abs(a)) * 10000) / 10000 : null;

/** Ano A × ano B por subproduto e agência. "pct" é a variação de B sobre A (0,25 = +25%); sem base em A fica nulo. */
export function compareYears(linesA: Line[], linesB: Line[]): YearSection[] {
  const byProduct = new Map<number, { product: ProductSummary['product']; a: Line[]; b: Line[] }>();
  const slot = (line: Line) => {
    const goal = line.goal;
    if (!byProduct.has(goal.product_id)) byProduct.set(goal.product_id, { product: { id: goal.product_id, name: goal.product_name, sub_product: goal.sub_product, unit: goal.unit }, a: [], b: [] });
    return byProduct.get(goal.product_id)!;
  };
  linesA.forEach(l => slot(l).a.push(l));
  linesB.forEach(l => slot(l).b.push(l));
  return [...byProduct].sort(([x], [y]) => x - y).map(([, { product, a, b }]) => {
    const agencies = new Map<number, { agency: Agency; a?: Line; b?: Line }>();
    a.forEach(l => agencies.set(l.agency.id, { agency: l.agency, ...agencies.get(l.agency.id), a: l }));
    b.forEach(l => agencies.set(l.agency.id, { agency: agencies.get(l.agency.id)?.agency ?? l.agency, ...agencies.get(l.agency.id), b: l }));
    const rows: YearRow[] = [...agencies.values()].sort((x, y) => x.agency.code.localeCompare(y.agency.code, 'pt-BR', { numeric: true })).map(({ agency, a: la, b: lb }) => {
      const ta = la?.total ?? 0, tb = lb?.total ?? 0;
      return { key: `${product.id}:${agency.id}`, agency, a: ta, b: tb, delta: round3(tb - ta), pct: variation(ta, tb), monthsA: la?.months ?? Array(12).fill(0), monthsB: lb?.months ?? Array(12).fill(0) };
    });
    const monthsA = Array.from({ length: 12 }, (_, i) => sum(rows.map(r => r.monthsA[i]))), monthsB = Array.from({ length: 12 }, (_, i) => sum(rows.map(r => r.monthsB[i])));
    const totalA = sum(rows.map(r => r.a)), totalB = sum(rows.map(r => r.b));
    return { product, additive: isAdditive(product.unit), totalA, totalB, delta: round3(totalB - totalA), pct: variation(totalA, totalB), monthsA, monthsB, rows };
  });
}
