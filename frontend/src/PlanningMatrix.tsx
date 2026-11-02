import { segmentStyle } from './segmentColors';
import { unitScale, unitSymbol } from './units';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Badge, Button, Checkbox, Dialog, Field, Menu, Select, Switch, toast, useConfirm } from 'broto-ui';
import { ArrowDownToLine, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleAlert, Copy, Eye, EyeOff, MoreHorizontal, Network, Pencil, Plus, RotateCcw, ShieldCheck, Upload, Split } from 'lucide-react';
import { api, apiUrl, errorText, money, months, number, shortMonths, type Goal, type MatrixRow, type PlanningMatrix as MatrixData, type PortfolioPlan } from './api';
import { useApp, useRemote } from './context';
import { AllocationEditor, MonthlyDialog, Seasonality } from './Planning';
import { AnnualPlanningDialog, AnnualImportDialog, type AnnualEditor } from './AnnualPlanning';
import { matrixNumber, planningOrigin, totalPortfolio, walletTone } from './matrixUtils';
import { ColumnResizer, useColumnWidths } from './ColumnResizer';
import type { ColumnId } from './columnWidths';
import { Empty, Failure, Loading, SearchMultiSelect } from './shared';
import { InlineCell } from './InlineCell';
import { downloadTableCsv } from './tableExport';
import { GoalVersions } from './GoalVersions';
import { AgencyOptions, RegionalTag, useRegionals } from './shared';
import './planning-matrix.css';
import { ClosureNotice, useClosedMonths } from './Closures';
import { monthlyBudget } from './math';
import { LockKeyhole } from 'lucide-react';

type Editor = { goalId: number; kind: 'month' | 'monthly' | 'seasonal' | 'allocation'; month: number; portfolioId?: number; amount?: number };
/** Ajuste de carteiras digitado na tabela que ainda não fecha 100% da meta do mês; só é salvo quando fechar. */
type Draft = { mode: 'percent' | 'amount'; values: Record<number, number>; edited: number[] };
type View = 'agency' | 'portfolio';
const colors = ['#197844', '#20b8e8', '#3da30d', '#e75b15', '#9973b1', '#ffcd00'];
const groupStorageKey = 'distribuidor.matrix-show-product';

/** `agencyLock` embute a tela dentro de uma agência: filtros de regional/agência ficam fixos nela. */
export default function PlanningMatrixPage({ view = 'agency', agencyLock = 0 }: { view?: View; agencyLock?: number }) {
  const { data, year, tick, refresh, setUnsaved } = useApp();
  const locked = useClosedMonths();
  const closedHint = () => toast.info('Mês fechado', 'Reabra o mês em Parametrizações > Fechamentos para alterá-lo.');
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const idsOf = (key: string) => (params.get(key) || '').split(',').map(Number).filter(Boolean);
  // Filtros de múltipla escolha; lista vazia = todos.
  const [regionalIds, setRegionalIds] = useState(() => agencyLock ? [] : idsOf('regional'));
  const [agencyIds, setAgencyIds] = useState(() => agencyLock ? [agencyLock] : idsOf('agencia'));
  const [productIds, setProductIds] = useState(() => agencyLock ? [] : idsOf('produto'));
  // Os editores de totais abrem pré-filtrados só quando há uma única escolha; com várias, ficam em "todos".
  const single = (ids: number[]) => ids.length === 1 ? ids[0] : 0;
  const regional = single(regionalIds), agency = single(agencyIds), product = single(productIds);
  /** Ao trocar as regionais, tira da seleção as agências que não pertencem a elas. */
  const changeRegionals = (next: number[]) => { setRegionalIds(next); if (next.length) setAgencyIds(prev => prev.filter(id => next.includes(data.agencies.find(a => a.id === id)?.regional_id ?? 0))); };
  const regionals = useRegionals();
  const [showPercent, setShowPercent] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyGap, setOnlyGap] = useState(false);
  const [onlyZero, setOnlyZero] = useState(false);
  const [onlyZeroAgency, setOnlyZeroAgency] = useState(false);
  const [onlyLoneZero, setOnlyLoneZero] = useState(false);
  // Coluna Produto da Meta por Agência; a escolha fica salva no navegador.
  const [showGroup, setShowGroup] = useState(() => { try { return localStorage.getItem(groupStorageKey) !== 'off'; } catch { return true; } });
  const toggleGroup = () => { const next = !showGroup; setShowGroup(next); try { localStorage.setItem(groupStorageKey, next ? 'on' : 'off'); } catch { /* sem armazenamento: vale só até recarregar */ } };
  const [editor, setEditor] = useState<Editor | null>(null);
  const [allocationFooter, setAllocationFooter] = useState<HTMLDivElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [annualEditor, setAnnualEditor] = useState<AnnualEditor | null>(null);
  const [importing, setImporting] = useState(false);
  const [newYear, setNewYear] = useState(false);
  const [newYearAgency, setNewYearAgency] = useState(agency || data.agencies.find(a => a.active)?.id || 0);
  const [copyFrom, setCopyFrom] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [openRegionals, setOpenRegionals] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingTarget, setPendingTarget] = useState<{ key: string; cell: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const remote = useRemote<MatrixData>(`/goals?year=${year}`, tick);
  const scroll = useRef<HTMLDivElement>(null);
  const columns = useColumnWidths();
  const head = (id: ColumnId, label: string) => <><span className="matrix-th-label">{label}</span><ColumnResizer id={id} scroll={scroll} columns={columns}/></>;
  const current =remote.data?.year === year ? remote.data : null;
  const filteredRows = (current?.rows || []).filter(r => (!regionalIds.length || regionalIds.includes(r.agency.regional_id)) && (!agencyIds.length || agencyIds.includes(r.agency.id)) && (!productIds.length || productIds.includes(r.goal.product_id)));
  const pendingRows = filteredRows.filter(r => r.goal.missing_months.length > 0 || r.goal.annual_pending);
  // Total anual já distribuído, mas com meses somando menos que ele: é a diferença exibida como "Faltam X" no total.
  const gapRows = filteredRows.filter(r => !r.goal.annual_pending && r.goal.unit !== 'PCT' && monthlyBudget(r.goal.annual_amount, r.goal.months.map(m => m.amount), unitScale(r.goal.unit)).balance > 0);
  // Meta por Carteira: carteira "zerada" é a que tem 0 em todos os 12 meses; o filtro mostra só essas linhas.
  const isZeroPortfolio = (p: PortfolioPlan) => p.months.every(m => m.amount === 0);
  const zeroCount = filteredRows.reduce((n, r) => n + r.portfolios.filter(isZeroPortfolio).length, 0);
  const zeroFilter = view === 'portfolio' && onlyZero;
  // "Agências com carteiras zeradas": mantém as metas que têm ao menos uma carteira zerada, mas mostra todas as carteiras delas (as zeradas ficam destacadas).
  const zeroAgencyRows = filteredRows.filter(r => r.portfolios.some(isZeroPortfolio));
  const zeroAgencyCount = new Set(zeroAgencyRows.map(r => r.agency.id)).size;
  const zeroAgencyFilter = view === 'portfolio' && onlyZeroAgency;
  // "Só uma carteira zerada": agências em que, em algum mês, uma única carteira tem meta 0 e todas as outras têm meta. Devolve as carteiras que ficam sozinhas no zero.
  const loneZeroIds = (r: MatrixRow) => {
    const ids = new Set<number>();
    for (let month = 1; month <= 12; month++) {
      const amount = (p: PortfolioPlan) => p.months.find(m => m.month === month)?.amount ?? 0;
      const zeros = r.portfolios.filter(p => amount(p) === 0);
      if (r.portfolios.length > 1 && zeros.length === 1) ids.add(zeros[0].id);
    }
    return ids;
  };
  const loneZeroByGoal = new Map(filteredRows.map(r => [r.goal.id, loneZeroIds(r)]));
  const loneZeroRows = filteredRows.filter(r => loneZeroByGoal.get(r.goal.id)!.size > 0);
  const loneZeroCount = new Set(loneZeroRows.map(r => r.agency.id)).size;
  const loneZeroFilter = view === 'portfolio' && onlyLoneZero;
  const shownPortfolios = (row: MatrixRow) => zeroFilter ? row.portfolios.filter(isZeroPortfolio) : row.portfolios;
  const rows = view === 'portfolio' ? (onlyLoneZero ? loneZeroRows : onlyZero || onlyZeroAgency ? zeroAgencyRows : filteredRows) : onlyPending ? pendingRows : onlyGap ? gapRows : filteredRows;
  const selected = current?.rows.find(r => r.goal.id === editor?.goalId);
  const agencyCount = new Set(rows.map(r => r.agency.id)).size;
  const noPortfolios = rows.filter(r => !r.portfolios.length).length;
  const expandable = rows.filter(r => r.portfolios.length);
  const allCollapsed = expandable.length > 0 && expandable.every(r => collapsed.has(r.goal.id));
  const toggleRow = (goalId: number) => setCollapsed(prev => { const next = new Set(prev); if (!next.delete(goalId)) next.add(goalId); return next; });
  const toggleAll = () => setCollapsed(prev => { const next = new Set(prev); expandable.forEach(r => allCollapsed ? next.delete(r.goal.id) : next.add(r.goal.id)); return next; });

  const pending = Object.keys(drafts).length;
  const goToPendingCell = () => {
    const keys = Object.keys(drafts).filter(key => current?.rows.some(row => row.goal.id === Number(key.split(':')[0])));
    if (!keys.length) return;
    const key = keys[(keys.indexOf(pendingTarget?.key ?? '') + 1) % keys.length];
    const [goalId, month] = key.split(':').map(Number);
    const row = current!.rows.find(row => row.goal.id === goalId)!;
    const draft = drafts[key];
    const portfolioId = draft.edited[draft.edited.length - 1] ?? row.portfolios[0]?.id;
    if (portfolioId === undefined) return;
    if (regionalIds.length && !regionalIds.includes(row.agency.regional_id)) setRegionalIds([]);
    if (agencyIds.length && !agencyIds.includes(row.agency.id)) setAgencyIds([]);
    if (productIds.length && !productIds.includes(row.goal.product_id)) setProductIds([]);
    setCollapsed(prev => { const next = new Set(prev); next.delete(goalId); return next; });
    if (draft.mode === 'percent') setShowPercent(true);
    setPendingTarget({ key, cell: `${goalId}:${month}:${portfolioId}:${draft.mode}` });
  };
  useEffect(() => {
    if (!pendingTarget) return;
    const container = scroll.current;
    const cell = container?.querySelector<HTMLElement>(`[data-allocation-cell="${pendingTarget.cell}"]`);
    const control = cell?.querySelector<HTMLElement>('button, input');
    if (!container || !cell || !control) return;
    // Centraliza na área livre, descontando as colunas e o cabeçalho fixos.
    const bounds = container.getBoundingClientRect(), target = cell.getBoundingClientRect();
    const stickyRight = Array.from(cell.parentElement!.querySelectorAll<HTMLElement>('.matrix-sticky'))
      .filter(element => getComputedStyle(element).position === 'sticky')
      .reduce((right, element) => Math.max(right, element.getBoundingClientRect().right), bounds.left);
    const fixedWidth = Math.max(0, Math.min(stickyRight - bounds.left, container.clientWidth - cell.offsetWidth));
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    control.focus({ preventScroll: true });
    container.scrollBy({
      left: target.left - bounds.left - fixedWidth - (container.clientWidth - fixedWidth - target.width) / 2,
      top: target.top - bounds.top - headerHeight - (container.clientHeight - headerHeight - target.height) / 2,
      behavior: 'smooth',
    });
  }, [pendingTarget]);
  const busy = saving || remote.loading;
  useEffect(() => { setUnsaved(dirty || pending > 0); }, [dirty, pending, setUnsaved]);
  useEffect(() => () => setUnsaved(false), [setUnsaved]);
  useEffect(() => { setEditor(null); setAnnualEditor(null); setImporting(false); setDirty(false); setDrafts({}); setPendingTarget(null); }, [year]);

  const closeEditor = async () => {
    if (dirty) {
      const result = await confirm({ title: 'Descartar alterações não salvas?', description: 'Os ajustes desta meta ainda não foram salvos.', confirmLabel: 'Descartar alterações', tone: 'danger' });
      if (!result.confirmed) return;
    }
    setDirty(false); setEditor(null);
  };
  const closeAnnual = async (saved = false) => {
    if (dirty && !saved) {
      const result = await confirm({ title: 'Descartar alterações não salvas?', description: 'Os totais ou a distribuição ainda não foram salvos.', confirmLabel: 'Descartar alterações', tone: 'danger' });
      if (!result.confirmed) return;
    }
    setDirty(false); setAnnualEditor(null); setImporting(false);
  };
  const openAnnual = (row: MatrixRow, kind: AnnualEditor['kind'] = 'distribute') => {
    if (locked.size === 12) { closedHint(); return; }
    setDirty(false); setAnnualEditor({ kind, productId: row.goal.product_id, goalId: row.goal.id });
  };
  const open = (row: MatrixRow, kind: Editor['kind'], month = 1, portfolioId?: number, amount?: number) => {
    if (locked.has(month) && kind === 'month') { closedHint(); return; }
    setDirty(amount!==undefined); setDrafts(d => Object.fromEntries(Object.entries(d).filter(([key]) => !key.startsWith(`${row.goal.id}:`)))); setEditor({ goalId: row.goal.id, kind, month, portfolioId, amount });
  };

  // Edição direta na tabela. O refresh vem sempre depois do save para a próxima edição usar a revisão nova.
  const persist = async (work: () => Promise<void>) => {
    setSaving(true);
    try { await work(); } catch (e) { toast.error(errorText(e)); } finally { refresh(); setSaving(false); }
  };
  const saveMonth = (row: MatrixRow, month: number, amount: number) => {
    const budget=monthlyBudget(row.goal.annual_amount,row.goal.months.map(m=>m.month===month?amount:m.amount),unitScale(row.goal.unit));
    if(budget.balance<0){open(row,'month',month,undefined,amount);return;}
    return persist(async () => {
      await api(`/goals/${row.goal.id}/months/${month}`, { revision: row.goal.revision, amount }, 'PUT');
      toast.success(`Meta de ${months[month-1]} salva`, 'O total anual planejado foi mantido.');
    });
  };
  const saveAnnual = (row: MatrixRow, amount: number) => persist(async () => {
    await api('/annual-goals', { year, product_id: row.goal.product_id, method: 'annual', weights: [], entries: [{ goal_id: row.goal.id, revision: row.goal.revision, annual_amount: amount }] }, 'POST');
    toast.success('Total anual salvo', 'Escolha como distribuir nos meses.');
  });
  const draftKey = (row: MatrixRow, month: number) => `${row.goal.id}:${month}`;
  const monthMinor = (row: MatrixRow, month: number) => Math.round(row.goal.months[month-1].amount * unitScale(row.goal.unit));
  /** Quanto falta (+) ou sobra (-) para a distribuição do mês fechar, na unidade do modo (% ou valor). */
  const draftGap = (row: MatrixRow, month: number, draft: Draft) => {
    const scale = draft.mode === 'percent' ? 100 : unitScale(row.goal.unit);
    const allocated = row.portfolios.reduce((sum, p) => sum + Math.round((draft.values[p.id] ?? 0) * scale), 0);
    return (( draft.mode === 'percent' ? 10000 : monthMinor(row, month)) - allocated) / scale;
  };
  const editAllocation = (row: MatrixRow, month: number, portfolio: PortfolioPlan, mode: Draft['mode'], value: number) => {
    const key = draftKey(row, month);
    const base: Draft = drafts[key] || { mode, edited: [], values: Object.fromEntries(row.portfolios.map(p => { const a = p.months.find(m => m.month === month); return [p.id, a ? (mode === 'percent' ? a.percent : a.amount) : 0]; })) };
    const next: Draft = { ...base, edited: [...new Set([...base.edited, portfolio.id])], values: { ...base.values, [portfolio.id]: value } };
    const gap = draftGap(row, month, next);
    if (Math.abs(gap) > 1e-9) {
      setDrafts(d => ({ ...d, [key]: next }));
      const left = mode === 'percent' ? `${number(Math.abs(gap), 2)}%` : money(Math.abs(gap), row.goal.unit);
      toast.warning(gap > 0 ? `Faltam ${left} em ${months[month-1]}` : `${left} acima da meta em ${months[month-1]}`, 'Ajuste outra carteira do mês para fechar 100%. Só então a distribuição é salva.');
      return;
    }
    setDrafts(d => Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)));
    return persist(async () => {
      try { await api(`/goals/${row.goal.id}/allocations`, { revision: row.goal.revision, month, mode: next.mode, entries: row.portfolios.map(p => ({ portfolio_id: p.id, value: next.values[p.id] ?? 0 })), apply_to_all: false }, 'PUT'); }
      catch (e) { setDrafts(d => ({ ...d, [key]: next })); throw e; }
      toast.success(`Distribuição de ${months[month-1]} salva`);
    });
  };
  /** Valores exibidos de uma carteira no mês, já considerando o ajuste ainda não salvo. */
  const walletCell = (row: MatrixRow, portfolio: PortfolioPlan, month: number) => {
    const saved = portfolio.months.find(a => a.month === month);
    const draft = drafts[draftKey(row, month)];
    if (!draft) return { amount: saved?.amount, percent: saved?.percent, edited: false };
    const scale = unitScale(row.goal.unit), total = monthMinor(row, month), value = draft.values[portfolio.id] ?? 0;
    return draft.mode === 'percent'
      ? { amount: Math.round(total * value / 100) / scale, percent: value, edited: draft.edited.includes(portfolio.id) }
      : { amount: value, percent: total ? Math.round(Math.round(value * scale) / total * 10000) / 100 : 0, edited: draft.edited.includes(portfolio.id) };
  };
  const draftPercent = (row: MatrixRow, month: number, draft: Draft) => {
    const total = monthMinor(row, month);
    return draft.mode === 'percent' ? row.portfolios.reduce((s, p) => s + (draft.values[p.id] ?? 0), 0) : total ? row.portfolios.reduce((s, p) => s + Math.round((draft.values[p.id] ?? 0) * unitScale(row.goal.unit)), 0) / total * 100 : 0;
  };
  const startAllocation = (row: MatrixRow, month: number, mode: Draft['mode']) => {
    if (locked.has(month)) { closedHint(); return false; }
    if (busy) return false;
    const draft = drafts[draftKey(row, month)];
    if (draft && draft.mode !== mode) { toast.info(`Conclua o ajuste em ${draft.mode === 'percent' ? '%' : 'valores'} de ${months[month-1]} antes`, 'Ou descarte os ajustes pendentes.'); return false; }
    if (mode === 'amount' && !monthMinor(row, month)) { toast.info('A meta deste mês é zero', 'Para meta zero, distribua por percentual.'); return false; }
    return true;
  };
  const query = [['regional_id', regionalIds], ['agency_id', agencyIds], ['product_id', productIds]].flatMap(([name, ids]) => (ids as number[]).map(id => `&${name}=${id}`)).join('');
  const createYear = async () => {
    setCreating(true); setCreateError('');
    try {
      const prior = data.years.filter(y => y < year);
      await api(`/agencies/${newYearAgency}/years`, { year, copy_from: copyFrom && prior.length ? Math.max(...prior) : null }, 'POST');
      setNewYear(false); setAgencyIds([newYearAgency]); refresh(); toast.success(`Metas de ${year} criadas`);
    } catch (e) { setCreateError(errorText(e)); } finally { setCreating(false); }
  };
  const groupCounts = new Map<number, number>();
  rows.forEach(r => groupCounts.set(r.agency.id, (groupCounts.get(r.agency.id) || 0) + 1));

  // Meta por Agência: a regional soma suas agências por subproduto e abre expandida por padrão.
  const regionalOrder = new Map(regionals.map((r, i) => [r.id, i]));
  const regionalGroups = [...rows.reduce((map, r) => {
    const group = map.get(r.agency.regional_id) ?? { id: r.agency.regional_id, name: r.agency.regional_name || 'Sem regional', rows: [] as MatrixRow[] };
    group.rows.push(r);
    return map.set(r.agency.regional_id, group);
  }, new Map<number, { id: number; name: string; rows: MatrixRow[] }>()).values()].sort((a, b) => (regionalOrder.get(a.id) ?? 99) - (regionalOrder.get(b.id) ?? 99));
  const regionalOpen = (id: number) => openRegionals[id] ?? true;
  const allRegionalsOpen = regionalGroups.length > 0 && regionalGroups.every(g => regionalOpen(g.id));
  const toggleRegional = (id: number) => setOpenRegionals(prev => ({ ...prev, [id]: !regionalOpen(id) }));
  const toggleAllRegionals = () => setOpenRegionals(prev => ({ ...prev, ...Object.fromEntries(regionalGroups.map(g => [g.id, !allRegionalsOpen])) }));
  // Os dois filtros rápidos são alternativos: ligar um desliga o outro.
  const togglePending = () => {
    if (!onlyPending) setOpenRegionals({});
    setOnlyGap(false);
    setOnlyPending(value => !value);
  };
  const toggleGap = () => {
    if (!onlyGap) setOpenRegionals({});
    setOnlyPending(false);
    setOnlyGap(value => !value);
  };
  /** Uma linha por subproduto com a soma das agências da regional (em centavos, para não acumular erro de ponto flutuante). */
  const regionalLines = (list: MatrixRow[]) => {
    const byProduct = new Map<number, MatrixRow[]>();
    list.forEach(r => byProduct.set(r.goal.product_id, [...(byProduct.get(r.goal.product_id) ?? []), r]));
    return [...byProduct.values()].map(items => {
      const scale = unitScale(items[0].goal.unit);
      const sum = (pick: (r: MatrixRow) => number) => items.reduce((total, r) => total + Math.round(pick(r) * scale), 0) / scale;
      return { goal: items[0].goal, annual: sum(r => r.goal.annual_amount), months: months.map((_, i) => sum(r => r.goal.months[i].amount)), agencies: new Set(items.map(r => r.agency.id)).size, pending: items.filter(r => r.goal.annual_pending).length };
    });
  };
  /** Metas em percentual não se somam entre agências. */
  const regionalNumber = (value: number, unit: string) => unit === 'PCT' ? '—' : matrixNumber(value, unit);

  // `caption`: mostra o produto sob o subproduto. Só a Meta por Carteira usa; na Meta por Agência o produto tem coluna própria.
  const productCell = (row: MatrixRow, caption = true) => <div className="matrix-product"><span className="matrix-product-dot" style={{ background: colors[(row.goal.product_id - 1) % colors.length] }} /><span className="matrix-product-name" title={`${row.goal.product_name} · ${row.goal.sub_product} · Meta em ${unitSymbol(row.goal.unit)}`}><b>{row.goal.sub_product}</b>{caption&&<small>{row.goal.product_name}</small>}</span><Menu label={`Ações de ${row.goal.sub_product} da agência ${row.agency.code}`} trigger={<MoreHorizontal size={16} />} triggerClassName="matrix-row-menu" items={[
    {label:row.goal.annual_amount!==0?'Total anual (travado)':'Informar total anual',disabled:locked.size===12,icon:<Pencil size={15}/>,onSelect:()=>openAnnual(row,'annual')},
    {label:'Distribuir total anual',icon:<Split size={15}/>,onSelect:()=>openAnnual(row)},
    {label:'Editar metas mensais',icon:<Pencil size={15}/>,onSelect:()=>open(row,'monthly'),disabled:row.goal.annual_pending},
    // Distribuir por carteiras só existe na Meta por Carteira (caption); na Meta por Agência fica de fora.
    ...(caption?[{label:'Distribuir por carteiras',icon:<Network size={15}/>,onSelect:()=>open(row,'allocation')}]:[]),
  ]} /></div>;

  const goalValue = (row: MatrixRow, index: number, target: Editor['kind'] = 'month') => {
    const month = row.goal.months[index];
    if (locked.has(index + 1) || month.closed) return <span className="matrix-closed-value" title={`${months[index]} de ${year} fechado · Edição bloqueada`}><LockKeyhole size={11}/>{matrixNumber(month.amount, row.goal.unit)}</span>;
    const missing = row.goal.missing_months.includes(index + 1);
    const label = `Editar meta de ${row.goal.sub_product}, ${months[index]}, agência ${row.agency.code}`;
    if (row.goal.annual_pending) return <button className="matrix-value" onClick={() => openAnnual(row)} aria-label={label} title="Total anual ainda sem distribuição. Clique para distribuir.">—</button>;
    return <InlineCell raw={month.amount} decimals={3} className={`${month.manual ? 'is-manual' : ''} ${missing ? 'has-missing' : ''}`} label={label}
      title={`${money(month.amount,row.goal.unit)}${missing ? ' · Mês ausente na planilha. Revise e digite o valor.' : ' · Clique para digitar · 2 cliques abrem o card'}`}
      canStart={() => !busy} onCommit={value => saveMonth(row, index + 1, value)} onOpen={() => open(row, target === 'allocation' ? 'allocation' : 'month', index + 1)}>{matrixNumber(month.amount, row.goal.unit)}{missing && <span className="matrix-missing-dot" aria-label="Revisão pendente" />}</InlineCell>;
  };
  const annualValue = (row: MatrixRow) => {
    const label = `Informar total anual de ${row.goal.sub_product}, agência ${row.agency.code}`;
    // Alterar um total já distribuído zera os meses; por isso só o total "a distribuir" é digitado direto na tabela.
    // Ajuste manual para baixo mantém o total importado: a diferença aparece aqui até ser compensada em outro mês.
    const budget = monthlyBudget(row.goal.annual_amount, row.goal.months.map(m => m.amount), unitScale(row.goal.unit));
    const gap = row.goal.annual_pending || row.goal.unit === 'PCT' ? 0 : budget.balance;
    return <InlineCell raw={row.goal.annual_amount} decimals={3} className="matrix-annual-input" locked={!row.goal.annual_pending || row.goal.annual_amount !== 0} label={label}
      title={row.goal.annual_amount !== 0 ? 'Total anual travado · clique para destravar com um motivo registrado no histórico' : row.goal.annual_pending ? 'Clique para digitar o total anual · 2 cliques abrem o card' : 'Clique para informar o total anual'}
      canStart={() => !busy} onCommit={value => saveAnnual(row, value)} onOpen={() => openAnnual(row, 'annual')} onLockedClick={() => openAnnual(row, 'annual')}>{matrixNumber(row.goal.annual_amount, row.goal.unit)}{row.goal.annual_amount !== 0 && <LockKeyhole size={11} className="matrix-annual-lock" aria-hidden="true" data-export-ignore/>}{row.goal.annual_pending && <small data-export-ignore>A distribuir</small>}{gap > 0 && <small data-export-ignore className="matrix-annual-gap" title={`Os meses somam ${money(budget.total, row.goal.unit)}. Ajuste outro mês em ${money(gap, row.goal.unit)} para fechar o total.`}>Faltam {matrixNumber(gap, row.goal.unit)}</small>}</InlineCell>;
  };

  const exportAgencyView = () => {
    const table = scroll.current?.querySelector<HTMLTableElement>('.agency-matrix');
    if (table) downloadTableCsv(table, `metas-por-agencia-${year}.csv`);
  };

  return <div className="matrix-page"><ClosureNotice/>
    <div className="matrix-page-heading"><div>{!agencyLock&&<h1>{view === 'agency' ? 'Meta por Agência' : 'Meta por Carteira'}</h1>}<p>{view === 'agency' ? 'Informe ou importe o total do ano por agência e subproduto. Depois, escolha como distribuir nos meses.' : 'Objetivo = meta da agência no mês × % atribuído da carteira. A linha verde é o total da agência.'}</p></div><div className="matrix-heading-actions"><GoalVersions agencyLock={agencyLock} /><>{view==='agency'?<Button disabled={busy||!rows.length||!!remote.error} icon={<ArrowDownToLine size={16}/>} onClick={exportAgencyView}>Exportar</Button>:<a href={apiUrl(`/export?year=${year}${query}&active_only=true`)} className="bt-btn bt-btn-secondary"><ArrowDownToLine size={16}/>Exportar</a>}</></div></div>
    {view === 'agency' && <div className="annual-workflow"><div className="annual-workflow-copy"><strong>Do total anual às metas mensais</strong><span>Informe ou importe os totais e distribua entre os meses.</span></div><div className="annual-workflow-actions"><Button icon={<Pencil size={15}/>} disabled={!current?.rows.length || locked.size===12} onClick={()=>{setDirty(false);setAnnualEditor({kind:'annual',productId:product,agencyId:agency,regionalId:regional});}}>Informar totais</Button><Button icon={<Upload size={15}/>} disabled={locked.size===12} onClick={()=>{setDirty(false);setImporting(true);}}>Importar Excel</Button><Button variant="primary" icon={<Split size={16}/>} disabled={!current?.rows.length} onClick={()=>{setDirty(false);setAnnualEditor({kind:'distribute',productId:product,agencyId:agency,regionalId:regional});}}>Distribuir metas</Button></div></div>}
    {view === 'agency' && <div className="matrix-quick-filters"><Button size="sm" className="matrix-pending-filter" aria-pressed={onlyPending} title="Mostrar só metas com meses ausentes ou total anual ainda a distribuir" onClick={togglePending}>Pendências <span className="matrix-pending-count">{pendingRows.length}</span></Button><Button size="sm" className="matrix-gap-filter" aria-pressed={onlyGap} title="Mostrar só metas em que a soma dos meses ficou menor que o total anual (Faltam…)" onClick={toggleGap}>Faltam distribuir <span className="matrix-pending-count">{gapRows.length}</span></Button>{onlyPending && <span role="status">Exibindo metas com meses ausentes ou total anual a distribuir.</span>}{onlyGap && <span role="status">Exibindo metas em que a soma dos meses é menor que o total anual.</span>}</div>}
    {view === 'portfolio' && <div className="matrix-quick-filters"><Button size="sm" className="matrix-pending-filter" aria-pressed={onlyZero} title="Mostrar só as carteiras com a meta zerada em todos os meses" onClick={()=>{setOnlyZero(v=>!v);setOnlyZeroAgency(false);setOnlyLoneZero(false);}}>Carteiras sem meta <span className="matrix-pending-count">{zeroCount}</span></Button><Button size="sm" className="matrix-gap-filter matrix-zero-agency-filter" aria-pressed={onlyZeroAgency} title="Mostrar as agências que têm alguma carteira com a meta zerada em todos os meses, com as carteiras zeradas em destaque" onClick={()=>{setOnlyZeroAgency(v=>!v);setOnlyZero(false);setOnlyLoneZero(false);}}>Agências com carteiras zeradas <span className="matrix-pending-count">{zeroAgencyCount}</span></Button><Button size="sm" className="matrix-lone-filter" aria-pressed={onlyLoneZero} title="Mostrar as agências em que só uma carteira está com meta 0 em algum mês e todas as outras têm meta" onClick={()=>{setOnlyLoneZero(v=>!v);setOnlyZero(false);setOnlyZeroAgency(false);}}>Só uma carteira zerada <span className="matrix-pending-count">{loneZeroCount}</span></Button>{onlyZero && <span role="status">Exibindo só carteiras com todos os meses zerados.</span>}{onlyZeroAgency && <span role="status">Exibindo agências com carteira zerada; as zeradas estão destacadas.</span>}{onlyLoneZero && <span role="status">Exibindo agências em que só uma carteira tem meta 0 em algum mês; ela está destacada.</span>}</div>}
    <section className="matrix-card" aria-label={view === 'agency' ? 'Metas consolidadas por agência' : 'Metas consolidadas por carteira'} aria-busy={remote.loading}>
      <div className="matrix-filters">{!agencyLock&&<><div className="matrix-filter matrix-filter-narrow"><label htmlFor={`matrix-${view}-regional`}>REGIONAL</label><SearchMultiSelect id={`matrix-${view}-regional`} values={regionalIds} onChange={changeRegionals} allLabel="Todas" plural="regionais" placeholder="Pesquisar regional" options={regionals.map(r=>({ value: r.id, label: r.name }))}/></div><div className="matrix-filter"><label htmlFor={`matrix-${view}-agency`}>AGÊNCIA</label><SearchMultiSelect id={`matrix-${view}-agency`} values={agencyIds} onChange={setAgencyIds} allLabel="Todas" plural="agências" placeholder="Pesquisar agência" options={data.agencies.filter(a=>a.active&&(!regionalIds.length||regionalIds.includes(a.regional_id))).map(a=>({ value: a.id, label: `${a.code} · ${a.name}` }))}/></div></>}<div className="matrix-filter matrix-filter-narrow"><label htmlFor={`matrix-${view}-product`}>SUBPRODUTO</label><SearchMultiSelect id={`matrix-${view}-product`} values={productIds} onChange={setProductIds} allLabel="Todos" plural="subprodutos" placeholder="Pesquisar subproduto" options={data.products.map(p=>({ value: p.id, label: p.sub_product, group: p.name }))}/></div>{view === 'portfolio' && <><Switch label="Mostrar %" checked={showPercent} onCheckedChange={setShowPercent}/><Button size="sm" variant="ghost" className="matrix-collapse-all" disabled={!expandable.length||zeroFilter||zeroAgencyFilter||loneZeroFilter} icon={allCollapsed ? <ChevronsUpDown size={15}/> : <ChevronsDownUp size={15}/>} onClick={toggleAll}>{allCollapsed ? 'Expandir tudo' : 'Recolher tudo'}</Button>{pending>0&&<span className="matrix-pending-note" role="status"><button type="button" className="matrix-pending-link" onClick={goToPendingCell} title="Ir para a próxima célula com ajuste pendente"><CircleAlert size={14}/>{pending} {pending===1?'mês':'meses'} sem fechar 100%</button><Button size="sm" variant="ghost" onClick={()=>setDrafts({})}>Descartar ajustes</Button></span>}</>}{view === 'agency' && <Button size="sm" variant="ghost" className="matrix-group-toggle" aria-pressed={showGroup} title={showGroup ? 'Esconder a coluna Produto' : 'Mostrar a coluna Produto'} icon={showGroup ? <EyeOff size={15}/> : <Eye size={15}/>} onClick={toggleGroup}>{showGroup ? 'Ocultar produto' : 'Mostrar produto'}</Button>}<span className="matrix-filter-summary">{view === 'portfolio' ? zeroFilter ? `${rows.reduce((n,r)=>n+shownPortfolios(r).length,0)} carteiras sem meta` : loneZeroFilter ? `${agencyCount} ${agencyCount===1?'agência':'agências'} com uma carteira zerada` : zeroAgencyFilter ? `${agencyCount} ${agencyCount===1?'agência':'agências'} com carteira zerada` : `${new Set(rows.flatMap(r=>r.portfolios.map(p=>p.id))).size} carteiras${noPortfolios ? ` · ${noPortfolios} metas sem carteiras` : ''}` : `${agencyCount} ${agencyCount===1?'agência':'agências'} · ${rows.length} metas`}</span></div>
      {!current && remote.loading ? <Loading/> : remote.error ? <Failure error={remote.error} retry={refresh}/> : !rows.length ? zeroFilter || zeroAgencyFilter || loneZeroFilter ? <Empty title={loneZeroFilter ? 'Nenhuma agência com só uma carteira zerada' : 'Nenhuma carteira zerada'}><p>{loneZeroFilter ? 'Nos filtros atuais, nenhuma agência tem uma única carteira com meta 0 enquanto as outras têm meta.' : 'Todas as carteiras dos filtros atuais têm meta em pelo menos um mês.'}</p><Button onClick={()=>{setOnlyZero(false);setOnlyZeroAgency(false);setOnlyLoneZero(false);}}>Mostrar todas as carteiras</Button></Empty> : view === 'agency' && onlyGap ? <Empty title="Nada faltando distribuir"><p>Todas as metas dos filtros atuais têm os meses somando o total anual.</p><Button onClick={()=>setOnlyGap(false)}>Mostrar todas as metas</Button></Empty> : view === 'agency' && onlyPending ? <Empty title="Nenhuma pendência nesta seleção"><p>Não há metas com meses ausentes ou total anual a distribuir nos filtros atuais.</p><Button onClick={()=>setOnlyPending(false)}>Mostrar todas as metas</Button></Empty> : <Empty title={`Nenhuma meta encontrada para ${year}`}><p>Ajuste os filtros ou baixe o modelo Excel com todas as agências, produtos e subprodutos cadastrados. Preencha o total anual e use Importar Excel para subir de volta.</p><a className="bt-btn bt-btn-primary" href={apiUrl(`/annual-goals/template?year=${year}`)} download><ArrowDownToLine size={16}/>Criar metas de {year}</a></Empty> : <>
        <div className={`matrix-scroll ${view === 'portfolio' ? 'portfolio-matrix-scroll' : ''}`} ref={scroll} style={columns.style} tabIndex={0} role="region" aria-label="Tabela anual com rolagem horizontal">
          {view === 'agency' ? <table className={`planning-matrix agency-matrix ${showGroup ? '' : 'no-group'}`}><caption className="sr-only">Metas de {year}, agrupadas por agência, produto e subproduto</caption><colgroup><col className="matrix-agency-col"/>{showGroup&&<col className="matrix-group-col"/>}<col className="matrix-product-col"/><col className="matrix-origin-col"/><col className="matrix-total-col"/>{months.map(m=><col className="matrix-amount-col" key={m}/>)}</colgroup><thead><tr><th scope="col" className="matrix-sticky matrix-agency-fixed"><div className="matrix-th-with-toggle"><button type="button" className="matrix-header-toggle" aria-expanded={allRegionalsOpen} aria-label={allRegionalsOpen?'Recolher todas as regionais':'Expandir todas as regionais'} title={allRegionalsOpen?'Recolher tudo':'Expandir tudo'} onClick={toggleAllRegionals}><ChevronRight size={16} className="matrix-toggle-chevron" aria-hidden/></button>{head('agency','Agência')}</div></th>{showGroup&&<th scope="col" className="matrix-sticky matrix-group-fixed">{head('group','Produto')}</th>}<th scope="col" className="matrix-sticky matrix-product-fixed">{head('product','Subproduto')}</th><th scope="col">{head('origin','Distribuição')}</th><th scope="col" className="matrix-number">{head('total','Total do ano')}</th>{shortMonths.map((m,i)=><th scope="col" className="matrix-number" key={m} title={months[i]} data-export-label={months[i]}>{locked.has(i+1)&&<LockKeyhole size={11}/>} {head('amount',m)}</th>)}</tr></thead><tbody>{regionalGroups.map(group=>{
            const open=regionalOpen(group.id), lines=regionalLines(group.rows), agencies=new Set(group.rows.map(r=>r.agency.id)).size;
            return <Fragment key={group.id}>
            {lines.map((line,li)=><tr key={line.goal.product_id} className={`matrix-agency-total matrix-regional-total ${li>0?'is-cont':''}`}>
              {li===0&&<th className="matrix-sticky matrix-agency-fixed matrix-agency-name matrix-regional-name" scope="rowgroup" rowSpan={lines.length}><button type="button" className="matrix-row-toggle" aria-expanded={open} aria-label={`${open?'Recolher':'Expandir'} as agências da ${group.name}`} title={`${open?'Recolher':'Expandir'} ${agencies} ${agencies===1?'agência':'agências'}`} onClick={()=>toggleRegional(group.id)}><ChevronRight size={16} className="matrix-toggle-chevron" aria-hidden/><span><b>{group.name}</b><small data-export-ignore>{agencies} {agencies===1?'agência':'agências'}</small></span></button></th>}
              {showGroup&&<td className="matrix-sticky matrix-group-fixed matrix-group-name" title={line.goal.product_name}>{line.goal.product_name}</td>}
              <th scope="row" className="matrix-sticky matrix-product-fixed"><div className="matrix-product"><span className="matrix-product-name"><b>{line.goal.sub_product}</b></span></div></th>
              <td><span className="matrix-regional-count">{line.agencies} {line.agencies===1?'agência':'agências'}{line.pending>0&&` · ${line.pending} a distribuir`}</span></td>
              <td className="matrix-number matrix-annual" title={line.goal.unit==='PCT'?'Percentuais não são somados entre agências':undefined}>{regionalNumber(line.annual,line.goal.unit)}</td>
              {months.map((m,i)=><td className="matrix-number" key={m}>{regionalNumber(line.months[i],line.goal.unit)}</td>)}
            </tr>)}
            {open&&group.rows.map((row,index)=>{
            const first = index === 0 || group.rows[index-1].agency.id !== row.agency.id;
            const origin = planningOrigin(row.goal);
            return <tr key={row.goal.id} data-goal-revision={row.goal.revision} className={first && index>0 ? 'matrix-agency-start' : ''}>
              {first&&<th className="matrix-sticky matrix-agency-fixed matrix-agency-name is-nested" scope="rowgroup" rowSpan={groupCounts.get(row.agency.id)}><span>{row.agency.code} {row.agency.name}</span></th>}
              {showGroup&&<td className="matrix-sticky matrix-group-fixed matrix-group-name" title={row.goal.product_name}>{row.goal.product_name}</td>}
              <th scope="row" className="matrix-sticky matrix-product-fixed">{productCell(row,false)}</th><td><button className={`matrix-origin origin-${origin.tone}`} title="Clique para distribuir o total anual deste subproduto" onClick={()=>openAnnual(row)}>{origin.label}</button></td><td className="matrix-number matrix-annual">{annualValue(row)}</td>{months.map((m,i)=><td className="matrix-number" key={m}>{goalValue(row,i)}</td>)}
            </tr>;
          })}</Fragment>;})}</tbody></table> : <table className={`planning-matrix portfolio-matrix ${showPercent ? 'with-percent' : ''}`}><caption className="sr-only">Metas das carteiras de {year}, com total da agência por subproduto</caption><colgroup><col className="matrix-agency-col"/><col className="matrix-product-col"/><col className="matrix-wallet-col"/><col className="matrix-segment-col"/><col className="matrix-manager-col"/>{months.map(m=><Fragment key={m}><col className="matrix-amount-col"/>{showPercent&&<col className="matrix-percent-col"/>}</Fragment>)}<col className="matrix-total-col"/></colgroup><thead><tr><th rowSpan={2} scope="col" className="matrix-sticky matrix-agency-fixed"><div className="matrix-th-with-toggle"><button type="button" className="matrix-header-toggle" disabled={!expandable.length} aria-expanded={!allCollapsed} aria-label={allCollapsed?'Expandir todas as carteiras':'Recolher todas as carteiras'} title={allCollapsed?'Expandir tudo':'Recolher tudo'} onClick={toggleAll}><ChevronRight size={16} className="matrix-toggle-chevron" aria-hidden/></button>{head('agency','Agência')}</div></th><th rowSpan={2} scope="col" className="matrix-sticky matrix-product-fixed">{head('product','Subproduto')}</th><th rowSpan={2} scope="col">{head('wallet','Carteira')}</th><th rowSpan={2} scope="col">{head('segment','Segmento')}</th><th rowSpan={2} scope="col">{head('manager','Gestor')}</th>{shortMonths.map((m,i)=><th key={m} scope="colgroup" colSpan={showPercent?2:1} className="matrix-month-group matrix-month-start">{locked.has(i+1)&&<LockKeyhole size={11}/>} {m}</th>)}<th rowSpan={2} scope="col" className="matrix-number">{head('total','Total anual')}</th></tr><tr>{months.map(m=><Fragment key={m}><th scope="col" className="matrix-number matrix-month-start">{head('amount','Objetivo')}</th>{showPercent&&<th scope="col" className="matrix-number matrix-percent-heading">{head('percent','%')}</th>}</Fragment>)}</tr></thead><tbody>{rows.map(row=>{const expanded=zeroFilter||zeroAgencyFilter||!collapsed.has(row.goal.id);return <Fragment key={row.goal.id}>
              <tr className="matrix-agency-total"><th scope="row" className="matrix-sticky matrix-agency-fixed">{row.portfolios.length?<button type="button" className="matrix-row-toggle" aria-expanded={expanded} aria-label={`Carteiras de ${row.goal.sub_product}, agência ${row.agency.code} ${row.agency.name}`} title={`${expanded?'Recolher':'Expandir'} ${row.portfolios.length} ${row.portfolios.length===1?'carteira':'carteiras'}`} onClick={()=>toggleRow(row.goal.id)}><ChevronRight size={16} className="matrix-toggle-chevron" aria-hidden/><span><RegionalTag name={row.agency.regional_name}/>{row.agency.code} {row.agency.name}</span></button>:<span className="matrix-row-static"><RegionalTag name={row.agency.regional_name}/>{row.agency.code} {row.agency.name}</span>}</th><td className="matrix-sticky matrix-product-fixed">{productCell(row)}</td><td><strong>Agência</strong></td><td className="matrix-empty">—</td><td className="matrix-empty">—</td>{months.map((m,i)=><Fragment key={m}><td className="matrix-number matrix-month-start">{goalValue(row,i,'allocation')}</td>{showPercent&&(()=>{const draft=drafts[draftKey(row,i+1)];if(draft){const sum=Math.round(draftPercent(row,i+1,draft)*100)/100;return <td className="matrix-number matrix-total-percent is-pending" title={`Distribuição em ajuste: ${number(Math.abs(100-sum),2)}% ${sum<100?'faltando':'acima'} para fechar 100%`}>{number(sum,2)}%</td>;}return <td className="matrix-number matrix-total-percent" title="Distribuição fechada em 100%">{row.portfolios.length&&row.goal.months[i].amount>0?'100%':'—'}</td>;})()}</Fragment>)}<td className="matrix-number matrix-annual">{matrixNumber(row.goal.annual_amount,row.goal.unit)}</td>
              </tr>
              {expanded&&shownPortfolios(row).map(portfolio=><tr className={`matrix-portfolio-row ${(zeroAgencyFilter&&isZeroPortfolio(portfolio))||(loneZeroFilter&&loneZeroByGoal.get(row.goal.id)?.has(portfolio.id))?'is-zero-wallet':''}`} key={portfolio.id}><td className="matrix-sticky matrix-agency-fixed matrix-repeat-agency">{row.agency.code} {row.agency.name}</td><td className="matrix-sticky matrix-product-fixed matrix-repeat-product">{row.goal.sub_product||row.goal.product_name}</td><th scope="row" title={portfolio.name}><span className="matrix-wallet"><strong className="wallet-card" data-tone={walletTone(portfolio.code)}>{portfolio.code}</strong><span className="matrix-portfolio-name">{portfolio.name}</span></span></th><td><span className="matrix-segment" style={segmentStyle(portfolio.color)}><i style={{background:portfolio.color}}/>{portfolio.segment_code}</span></td><td className={`matrix-manager ${!portfolio.manager?'matrix-empty':''}`} title={portfolio.manager}>{portfolio.manager||'—'}</td>{months.map((m,i)=>{
                const allocation=walletCell(row,portfolio,i+1);
                const hint=locked.has(i+1)?' · Mês fechado · Edição bloqueada':' · Clique para digitar · 2 cliques abrem o card';
                const unit=row.goal.unit;
                return <Fragment key={m}><td className="matrix-number matrix-month-start" data-allocation-cell={`${row.goal.id}:${i+1}:${portfolio.id}:amount`}><InlineCell locked={locked.has(i+1)} raw={allocation.amount||0} decimals={3} className={`portfolio-amount ${allocation.edited?'is-pending':''}`} label={`Editar objetivo da carteira ${portfolio.code}, ${months[i]}, ${row.goal.sub_product}, agência ${row.agency.code}`} title={`${money(allocation.amount||0,unit)} · ${portfolio.name}${hint}`} canStart={()=>startAllocation(row,i+1,'amount')} onCommit={value=>editAllocation(row,i+1,portfolio,'amount',value)} onOpen={()=>open(row,'allocation',i+1,portfolio.id)}>{allocation.amount===undefined?'—':matrixNumber(allocation.amount,unit)}</InlineCell></td>{showPercent&&<td className="matrix-number" data-allocation-cell={`${row.goal.id}:${i+1}:${portfolio.id}:percent`}><InlineCell locked={locked.has(i+1)} raw={allocation.percent||0} decimals={2} max={100} unsigned className={`matrix-editable-percent ${allocation.edited?'is-pending':''}`} label={`Editar percentual da carteira ${portfolio.code}, ${months[i]}, ${row.goal.sub_product}, agência ${row.agency.code}`} title={`Percentual de ${months[i]}${hint}`} canStart={()=>startAllocation(row,i+1,'percent')} onCommit={value=>editAllocation(row,i+1,portfolio,'percent',value)} onOpen={()=>open(row,'allocation',i+1,portfolio.id)}>{allocation.percent===undefined?'—':`${number(allocation.percent,allocation.percent%1?2:0)}%`}</InlineCell></td>}</Fragment>;
              })}<td className="matrix-number matrix-annual">{matrixNumber(totalPortfolio(portfolio.months,row.goal.unit),row.goal.unit)}</td></tr>)}
              {!row.portfolios.length&&<tr className="matrix-no-portfolios"><td colSpan={6+12*(showPercent?2:1)}><span>Esta agência ainda não tem carteiras ativas para distribuir {row.goal.sub_product}.</span></td></tr>}
            </Fragment>;})}</tbody></table>}
        </div>
        <div className="matrix-footer"><div>{view==='agency'?<><span className="matrix-green-key"/>Soma da regional.<span className="matrix-blue-key"/>Azul: ajuste manual.<span className="matrix-missing-dot"/>Mês pendente de revisão.<span className="matrix-hint-sep"/>Clique para digitar · 2 cliques abrem o card.</>:<><span className="matrix-green-key"/>Total da agência.<span className="matrix-blue-key"/>Clique para digitar (Enter confirma, Esc cancela) · 2 cliques abrem o card.</>}</div><div className="matrix-scroll-controls"><span>Arraste a borda de um título para ajustar a largura da coluna</span>{columns.customized&&<Button size="sm" variant="ghost" icon={<RotateCcw size={14}/>} onClick={()=>columns.reset()}>Restaurar colunas</Button>}<Button size="sm" variant="ghost" aria-label="Ver meses anteriores" icon={<ArrowLeft size={15}/>} onClick={()=>scroll.current?.scrollBy({left:-450,behavior:'smooth'})}/><Button size="sm" variant="ghost" aria-label="Ver próximos meses" icon={<ArrowRight size={15}/>} onClick={()=>scroll.current?.scrollBy({left:450,behavior:'smooth'})}/></div></div>
      </>}
    </section>
    <p className="matrix-measure-note">Metas em reais (R$), quantidade e percentual (%), conforme a unidade do subproduto. O total anual é a base da distribuição. “A distribuir” indica uma meta anual ainda sem valores mensais.</p>
    {annualEditor&&current&&<AnnualPlanningDialog rows={current.rows} editor={annualEditor} onClose={saved=>void closeAnnual(saved)} onDirty={setDirty}/>}
    {importing&&<AnnualImportDialog onClose={saved=>void closeAnnual(saved)} onDirty={setDirty}/>}
    {editor&&selected&&(editor.kind==='month'||editor.kind==='monthly')&&<MonthlyDialog goal={selected.goal} initialMonth={editor.kind==='month'?editor.month:undefined} initialAmount={editor.amount} description={`${selected.agency.regional_name} · ${selected.agency.code} ${selected.agency.name}`} onDirty={setDirty} onClose={()=>void closeEditor()} onSaved={()=>{setDirty(false);setEditor(null);}}/>}
    {editor&&selected&&(editor.kind==='allocation'||editor.kind==='seasonal')&&<Dialog open onClose={()=>void closeEditor()} size="xl" title={`${editor.kind==='allocation'?'Distribuição por Carteiras':'Sazonalidade'} · ${selected.goal.sub_product}`} description={`${selected.agency.regional_name} · ${selected.agency.code} ${selected.agency.name} · ${year}`} className="matrix-editor-dialog" footer={<>{selected.goal.missing_months.length>0&&<div className="matrix-publication-info"><ShieldCheck size={17}/><span>Meses pendentes de revisão</span></div>}{editor.kind==='allocation'&&<div className="matrix-allocation-save" ref={setAllocationFooter}/>}<Button onClick={()=>void closeEditor()}>Fechar</Button></>}>{editor.kind==='allocation'?<AllocationEditor key={`${editor.goalId}-${editor.month}`} goal={selected.goal} initialMonth={editor.month} focusPortfolioId={editor.portfolioId} onDirty={setDirty} onSaved={()=>{setDirty(false);setEditor(null);}} footerTarget={allocationFooter}/>:<Seasonality key={`${selected.goal.id}-${selected.goal.revision}`} goal={selected.goal} onDirty={setDirty}/>}</Dialog>}
    <Dialog open={newYear} onClose={()=>!creating&&setNewYear(false)} title={`Metas de ${year}`} description="Crie as metas de cada subproduto e os 12 meses para a agência selecionada." onSubmit={()=>void createYear()} footer={<><Button onClick={()=>setNewYear(false)} disabled={creating}>Cancelar</Button><Button type="submit" loading={creating} variant="primary" icon={<Plus size={16}/>}>Criar metas</Button></>}>{createError&&<div className="form-error" role="alert">{createError}</div>}<Field label="Agência"><Select value={newYearAgency} onChange={e=>setNewYearAgency(Number(e.target.value))}><AgencyOptions agencies={data.agencies.filter(a=>a.active)}/></Select></Field>{data.years.some(y=>y<year)&&<div className="matrix-copy-year"><Checkbox checked={copyFrom} onChange={e=>setCopyFrom(e.target.checked)} label={`Copiar valores mensais de ${Math.max(...data.years.filter(y=>y<year))}`}/></div>}</Dialog>
  </div>;
}

