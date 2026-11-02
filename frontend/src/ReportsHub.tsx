import { useMemo, useState } from 'react';
import { Badge, Button, Card, Select, StackedBarChart, TabPanel, Tabs } from 'broto-ui';
import { ArrowDownToLine, ArrowUpRight, CalendarClock, CheckCheck, CircleAlert, Coins, FilterX, GitCompareArrows, History, LayoutDashboard, ListChecks, LockKeyhole, Table2, Users, WalletCards } from 'lucide-react';
import { apiUrl, compact, dateTime, money, number, shortMonths, type Audit, type PlanningMatrix } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading, PageHead, RegionalSelect, RegionalTag, SubproductOptions, agenciesOf, useRegionalAgency, AgencyOptions } from './shared';
import { ClosureNotice, useClosedMonths } from './Closures';
import { matrixNumber } from './matrixUtils';
import { unitLabel } from './units';
import {
  ISSUE_INFO, ISSUE_ORDER, agencyCompleteness, buildLines, bySegment, byManager, consolidate, countByKind, describeIssue, findIssues, managerOf, quarters,
  shareOf, summarizeByProduct, toCsv, walletRows, NO_MANAGER, type ConsolidatedRow, type Issue, type IssueKind, type ReportFilters, type Severity,
} from './reportData';
import { ChangesTab } from './ReportsChanges';
import { CompareTab } from './ReportsCompare';
import { Metric, downloadCsv, percent } from './reportUi';
import './reports.css';

type TabId = 'resumo' | 'consolidado' | 'carteiras' | 'conferencia' | 'mudancas' | 'comparativos';

const severityTone: Record<Severity, 'danger' | 'pending' | 'neutral'> = { alta: 'danger', media: 'pending', baixa: 'neutral' };
const severityLabel: Record<Severity, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function ReportsPage() {
  const { data, year, tick, refresh, setAgencyId, navigate } = useApp();
  const closed = useClosedMonths();
  const { regional, agency, setRegional, setAgency } = useRegionalAgency();
  const [product, setProduct] = useState(0);
  const [segment, setSegment] = useState(0);
  const [manager, setManager] = useState('');
  const [tab, setTab] = useState<TabId>('resumo');
  const [issueKind, setIssueKind] = useState<IssueKind | ''>('');
  const remote = useRemote<PlanningMatrix>(`/goals?year=${year}`, tick);
  const latest = useRemote<{ total: number; entries: Audit[] }>('/audit?limit=1', tick);
  const rows = useMemo(() => (remote.data?.year === year ? remote.data.rows : []), [remote.data, year]);
  const managers = useMemo(() => [...new Set(rows.flatMap(r => r.portfolios.map(managerOf)))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const filters: ReportFilters = { regional, agency, product, segment, manager };
  const lines = useMemo(() => buildLines(rows, filters), [rows, regional, agency, product, segment, manager]); // eslint-disable-line react-hooks/exhaustive-deps
  const goalLines = useMemo(() => buildLines(rows, { regional, agency, product, segment: 0, manager: '' }), [rows, regional, agency, product]);
  const issues = useMemo(() => findIssues(goalLines), [goalLines]);
  const counts = useMemo(() => countByKind(issues), [issues]);
  const active = !!(regional || agency || product || segment || manager);
  const clear = () => { setRegional(0); setAgency(0); setProduct(0); setSegment(0); setManager(''); };
  const openIssues = (kind: IssueKind | '') => { setIssueKind(kind); setTab('conferencia'); };
  const openAgency = (id: number) => { setAgencyId(id); navigate(`/distribuidor?agencia=${id}`); };
  const csvLink = apiUrl(`/export?year=${year}${regional ? `&regional_id=${regional}` : ''}${agency ? `&agency_id=${agency}` : ''}${product ? `&product_id=${product}` : ''}`);

  return <>
    <PageHead title="Relatórios" description="Resumo, consolidado mensal, carteiras e conferência das metas do ano." actions={<a href={csvLink} className="bt-btn bt-btn-primary"><ArrowDownToLine size={16} />Exportar CSV completo</a>} />
    <ClosureNotice />
    <div className="reports-filters" role="group" aria-label="Filtros dos relatórios">
      <RegionalSelect value={regional} onChange={setRegional} label="Filtrar relatório por regional" />
      <Select aria-label="Filtrar relatório por agência" value={agency} onChange={e => setAgency(Number(e.target.value))}><option value={0}>Todas as agências</option><AgencyOptions agencies={agenciesOf(data.agencies.filter(a => a.active), regional)} text={a => a.name} /></Select>
      <Select aria-label="Filtrar relatório por subproduto" value={product} onChange={e => setProduct(Number(e.target.value))}><option value={0}>Todos os subprodutos</option><SubproductOptions products={data.products.filter(p => p.active)} /></Select>
      <Select aria-label="Filtrar relatório por segmento" value={segment} onChange={e => setSegment(Number(e.target.value))}><option value={0}>Todos os segmentos</option>{data.segments.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select>
      <Select aria-label="Filtrar relatório por gestor" value={manager} onChange={e => setManager(e.target.value)}><option value="">Todos os gestores</option>{managers.map(m => <option key={m} value={m}>{m}</option>)}</Select>
      {active && <Button size="sm" variant="ghost" icon={<FilterX size={15} />} onClick={clear}>Limpar filtros</Button>}
    </div>
    {(segment !== 0 || manager !== '') && <p className="reports-scope-note"><CircleAlert size={14} />Com segmento ou gestor escolhido, os valores passam a somar só as carteiras selecionadas. A conferência, as mudanças e os comparativos sempre olham a meta inteira da agência.</p>}
    <Tabs idPrefix="reports" value={tab} onChange={setTab} aria-label="Relatórios" tabs={[
      { id: 'resumo', label: 'Resumo', icon: <LayoutDashboard size={16} /> },
      { id: 'consolidado', label: 'Consolidado', icon: <Table2 size={16} /> },
      { id: 'carteiras', label: 'Carteiras e gestores', icon: <WalletCards size={16} /> },
      { id: 'conferencia', label: 'Conferência', icon: <ListChecks size={16} />, count: issues.filter(i => i.severity !== 'baixa').length || undefined },
      { id: 'mudancas', label: 'Mudanças', icon: <History size={16} /> },
      { id: 'comparativos', label: 'Comparativos', icon: <GitCompareArrows size={16} /> },
    ]} />
    {remote.loading && !rows.length ? <Loading /> : remote.error ? <Failure error={remote.error} retry={refresh} /> : <>
      {tab === 'resumo' && <TabPanel id="resumo" idPrefix="reports"><SummaryTab {...{ lines, goalLines, issues, counts, closed, latest: latest.data?.entries[0], product, setProduct, openIssues }} /></TabPanel>}
      {tab === 'consolidado' && <TabPanel id="consolidado" idPrefix="reports"><ConsolidatedTab lines={lines} year={year} openAgency={openAgency} /></TabPanel>}
      {tab === 'carteiras' && <TabPanel id="carteiras" idPrefix="reports"><WalletsTab lines={lines} year={year} defaultProduct={product} /></TabPanel>}
      {tab === 'conferencia' && <TabPanel id="conferencia" idPrefix="reports"><IssuesTab issues={issues} counts={counts} kind={issueKind} setKind={setIssueKind} openAgency={openAgency} year={year} /></TabPanel>}
      {tab === 'mudancas' && <TabPanel id="mudancas" idPrefix="reports"><ChangesTab year={year} regional={regional} agency={agency} product={product} openAgency={openAgency} /></TabPanel>}
      {tab === 'comparativos' && <TabPanel id="comparativos" idPrefix="reports"><CompareTab rows={rows} year={year} filters={{ regional, agency, product, segment: 0, manager: '' }} /></TabPanel>}
    </>}
  </>;
}

// ---------------------------------------------------------------- Resumo

function SummaryTab({ lines, goalLines, issues, counts, closed, latest, product, setProduct, openIssues }: {
  lines: ReturnType<typeof buildLines>; goalLines: ReturnType<typeof buildLines>; issues: Issue[]; counts: Record<IssueKind, number>; closed: Set<number>;
  latest?: Audit; product: number; setProduct: (id: number) => void; openIssues: (kind: IssueKind | '') => void;
}) {
  const summaries = useMemo(() => summarizeByProduct(lines), [lines]);
  const complete = useMemo(() => agencyCompleteness(goalLines, issues), [goalLines, issues]);
  const brl = summaries.filter(s => s.product.unit === 'BRL').reduce((total, s) => total + s.planned, 0);
  const wallets = useMemo(() => new Set(lines.flatMap(l => l.wallets.map(w => w.id))).size, [lines]);
  const [curveProduct, setCurveProduct] = useState(0);
  const additive = summaries.filter(s => s.additive);
  const curve = additive.find(s => s.product.id === curveProduct) ?? additive[0];
  if (!lines.length) return <Empty title="Nenhuma meta nos filtros atuais"><p>Ajuste ou limpe os filtros para ver o resumo.</p></Empty>;
  return <div className="reports-panel">
    <div className="stats-grid">
      <Metric label="Total planejado em R$" value={compact(brl)} hint="Soma dos subprodutos em reais" Icon={Coins} color="green" />
      <Metric label="Agências completas" value={`${complete.complete} de ${complete.total}`} hint="Sem pendência alta ou média" Icon={CheckCheck} color="green" onClick={() => openIssues('')} />
      <Metric label="Metas a distribuir" value={String(counts.a_distribuir)} hint="Total informado, meses por distribuir" Icon={CalendarClock} color="amber" onClick={() => openIssues('a_distribuir')} />
      <Metric label="Faltam distribuir" value={String(counts.faltam)} hint="Soma dos meses abaixo do total" Icon={CircleAlert} color="purple" onClick={() => openIssues('faltam')} />
      <Metric label="Carteiras sem meta" value={String(counts.carteira_zerada)} hint="Zeradas nos 12 meses" Icon={WalletCards} color="blue" onClick={() => openIssues('carteira_zerada')} />
      <Metric label="Carteiras ativas" value={String(wallets)} hint={`${new Set(lines.map(l => l.agency.id)).size} agências`} Icon={Users} color="green" />
      <Metric label="Meses fechados" value={`${closed.size} de 12`} hint={closed.size ? [...closed].sort((a, b) => a - b).map(m => shortMonths[m - 1]).join(', ') : 'Nenhum mês fechado'} Icon={LockKeyhole} color="blue" />
      <Metric label="Última alteração" value={latest ? dateTime(latest.timestamp) : '—'} hint={latest ? `${latest.actor || 'Sem autor'} · ${latest.detail.slice(0, 48)}` : 'Sem alterações'} Icon={ListChecks} color="amber" />
    </div>
    <div className="report-product-grid">
      {summaries.map(s => <Card key={s.product.id}>
        <span className="eyebrow">{s.product.name}</span><h3>{s.product.sub_product}</h3>
        <strong className="report-product-value">{s.additive ? compact(s.planned, s.product.unit) : '—'}</strong>
        <div className="report-product-foot"><span>{unitLabel(s.product.unit)} · {s.agencies} {s.agencies === 1 ? 'agência' : 'agências'}</span><Badge tone={s.goals && s.loaded === s.goals ? 'success' : 'neutral'}>{s.loaded}/{s.goals} carregadas</Badge></div>
        <Button size="sm" variant="ghost" onClick={() => setProduct(product === s.product.id ? 0 : s.product.id)}>{product === s.product.id ? 'Ver todos os subprodutos' : 'Filtrar só este'}</Button>
      </Card>)}
    </div>
    {curve && <Card title="Curva mensal das metas" subtitle={`Quanto da meta de ${curve.product.sub_product} cai em cada mês · ${unitLabel(curve.product.unit)}`} actions={<Select aria-label="Subproduto da curva mensal" value={curve.product.id} onChange={e => setCurveProduct(Number(e.target.value))}>{additive.map(s => <option key={s.product.id} value={s.product.id}>{s.product.sub_product}</option>)}</Select>}>
      <StackedBarChart aria-label={`Meta mensal de ${curve.product.sub_product}`} height={240} series={[{ key: 'v', label: 'Meta do mês', color: '#4f8c27' }]}
        data={curve.months.map((v, i) => ({ label: shortMonths[i], values: { v }, title: `${shortMonths[i]} · ${money(v, curve.product.unit)}${curve.total ? ` · ${percent(shareOf(v, curve.total))} do ano` : ''}` }))}
        formatValue={n => compact(n, curve.product.unit).replace('R$ ', '')} />
    </Card>}
  </div>;
}

// ---------------------------------------------------------------- Consolidado

function ConsolidatedTab({ lines, year, openAgency }: { lines: ReturnType<typeof buildLines>; year: number; openAgency: (id: number) => void }) {
  const sections = useMemo(() => consolidate(lines), [lines]);
  const [mode, setMode] = useState<'valor' | 'ano'>('valor');
  const [grain, setGrain] = useState<'meses' | 'trimestres'>('meses');
  const headers = grain === 'meses' ? shortMonths : ['T1', 'T2', 'T3', 'T4'];
  const cells = (row: ConsolidatedRow) => grain === 'meses' ? row.months : quarters(row.months);
  const show = (value: number, row: ConsolidatedRow, unit: string) => mode === 'valor' ? matrixNumber(value, unit) : row.total ? percent(shareOf(value, row.total)) : '—';
  const exportCsv = () => downloadCsv(`consolidado-${year}.csv`, [['Subproduto', 'Unidade', 'Nível', 'Regional / Agência', 'Código', 'Total do ano', 'Meta anual', ...shortMonths],
    ...sections.flatMap(s => s.rows.map(r => [s.summary.product.sub_product, s.summary.product.unit, r.level === 'regional' ? 'Regional' : 'Agência', r.label, r.code ?? '', r.total, r.planned, ...r.months]))]);
  if (!sections.length) return <Empty title="Nenhuma meta nos filtros atuais"><p>Ajuste ou limpe os filtros para ver o consolidado.</p></Empty>;
  return <div className="reports-panel">
    <div className="reports-toolbar">
      <span><label htmlFor="rep-mode">Ver como</label><Select id="rep-mode" value={mode} onChange={e => setMode(e.target.value as 'valor' | 'ano')}><option value="valor">Valores</option><option value="ano">% do total do ano</option></Select></span>
      <span><label htmlFor="rep-grain">Colunas</label><Select id="rep-grain" value={grain} onChange={e => setGrain(e.target.value as 'meses' | 'trimestres')}><option value="meses">12 meses</option><option value="trimestres">Trimestres</option></Select></span>
      <Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv}>Exportar esta tabela</Button>
    </div>
    {sections.map(({ summary, rows }) => <Card key={summary.product.id} title={summary.product.sub_product} subtitle={`${summary.product.name} · ${unitLabel(summary.product.unit)}${summary.additive ? '' : ' · percentuais não somam, por isso não há subtotal'}`}
      actions={summary.additive ? <strong className="report-section-total">{compact(summary.planned, summary.product.unit)}</strong> : undefined} flush>
      <div className="table-scroll"><table className="app-table report-table">
        <caption className="sr-only">Consolidado de {summary.product.sub_product} em {year}</caption>
        <thead><tr><th>Regional / Agência</th><th className="numeric">Total do ano</th>{headers.map(h => <th className="numeric" key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.key} className={row.level === 'regional' ? 'is-regional' : ''}>
            <th scope="row">{row.level === 'regional'
              ? <span><strong>{row.label}</strong></span>
              : <button type="button" className="report-link" onClick={() => row.agencyId && openAgency(row.agencyId)} title="Abrir a agência"><span>{row.code}</span> {row.label}</button>}</th>
            <td className="numeric">{row.level === 'regional' && !summary.additive ? '—' : <>{matrixNumber(row.total, summary.product.unit)}{summary.additive && row.planned !== row.total && <small className="report-gap">meta {matrixNumber(row.planned, summary.product.unit)}</small>}</>}</td>
            {cells(row).map((value, i) => <td className="numeric" key={i}>{row.level === 'regional' && !summary.additive ? '—' : show(value, row, summary.product.unit)}</td>)}
          </tr>)}
          {summary.additive && <tr className="is-total"><th scope="row">Total</th><td className="numeric">{matrixNumber(summary.total, summary.product.unit)}</td>{(grain === 'meses' ? summary.months : quarters(summary.months)).map((v, i) => <td className="numeric" key={i}>{mode === 'valor' ? matrixNumber(v, summary.product.unit) : summary.total ? percent(shareOf(v, summary.total)) : '—'}</td>)}</tr>}
        </tbody>
      </table></div>
    </Card>)}
  </div>;
}

// ---------------------------------------------------------------- Carteiras e gestores

function WalletsTab({ lines, year, defaultProduct }: { lines: ReturnType<typeof buildLines>; year: number; defaultProduct: number }) {
  const summaries = useMemo(() => summarizeByProduct(lines).filter(s => s.lines.some(l => l.wallets.length)), [lines]);
  const [chosen, setChosen] = useState(0);
  const [threshold, setThreshold] = useState(40);
  const scope = summaries.find(s => s.product.id === (chosen || defaultProduct)) ?? summaries[0];
  const rows = useMemo(() => scope ? walletRows(scope.lines) : [], [scope]);
  const segments = useMemo(() => bySegment(rows), [rows]);
  const managers = useMemo(() => byManager(rows), [rows]);
  const ranking = useMemo(() => [...rows].sort((a, b) => b.total - a.total), [rows]);
  const concentrated = ranking.filter(r => r.share * 100 >= threshold);
  const unit = scope?.product.unit ?? 'BRL';
  const monthly = useMemo(() => {
    const keys = segments.map(s => s.id);
    return shortMonths.map((label, i) => ({ label, values: Object.fromEntries(keys.map(k => [k, rows.filter(r => String(r.wallet.segment_id) === k).reduce((t, r) => t + r.months[i], 0)])), title: `${label} · ${money(rows.reduce((t, r) => t + r.months[i], 0), unit)}` }));
  }, [rows, segments, unit]);
  if (!scope) return <Empty title="Nenhuma carteira nos filtros atuais"><p>Ajuste ou limpe os filtros para ver as carteiras.</p></Empty>;
  const grand = scope.additive ? rows.reduce((t, r) => t + r.total, 0) : 0;
  const exportCsv = () => downloadCsv(`carteiras-${scope.product.sub_product}-${year}.csv`.replace(/\s+/g, '-'), [['Subproduto', 'Regional', 'Agência', 'Código agência', 'Carteira', 'Segmento', 'Gestor', 'Total do ano', 'Participação na meta da agência (%)', ...shortMonths],
    ...ranking.map(r => [scope.product.sub_product, r.line.agency.regional_name, r.line.agency.name, r.line.agency.code, `${r.wallet.code} ${r.wallet.name}`, r.wallet.segment_code, managerOf(r.wallet) === NO_MANAGER ? '' : r.wallet.manager, r.total, Math.round(r.share * 10000) / 100, ...r.months])]);
  return <div className="reports-panel">
    <div className="reports-toolbar">
      <span><label htmlFor="rep-scope">Subproduto</label><Select id="rep-scope" value={scope.product.id} onChange={e => setChosen(Number(e.target.value))}>{summaries.map(s => <option key={s.product.id} value={s.product.id}>{s.product.sub_product} · {unitLabel(s.product.unit)}</option>)}</Select></span>
      <span className="reports-toolbar-note">{rows.length} carteiras · {new Set(rows.map(r => r.line.agency.id)).size} agências{scope.additive ? ` · ${compact(grand, unit)}` : ''}</span>
      <Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv}>Exportar carteiras</Button>
    </div>
    <div className="reports-two">
      <Card title="Por segmento" subtitle="Participação de cada segmento na meta das carteiras">
        <ul className="share-list">{segments.map(s => <li key={s.id}>
          <div><span className="share-dot" style={{ background: s.color }} aria-hidden /><strong>{s.label}</strong><span>{s.wallets} carteiras</span></div>
          <div className="share-bar" role="img" aria-label={`${s.label}: ${percent(s.share)}`}><i style={{ width: `${Math.max(s.share * 100, 0.5)}%`, background: s.color }} /></div>
          <div><span>{scope.additive ? matrixNumber(s.total, unit) : '—'}</span><strong>{percent(s.share)}</strong></div>
        </li>)}</ul>
      </Card>
      <Card title="Por gestor" subtitle="Quanto da meta cada gestor carrega" flush>
        <div className="table-scroll"><table className="app-table report-table"><thead><tr><th>Gestor</th><th className="numeric">Agências</th><th className="numeric">Carteiras</th><th className="numeric">Total do ano</th><th className="numeric">Participação</th></tr></thead>
          <tbody>{managers.map(m => <tr key={m.id}><th scope="row">{m.label === NO_MANAGER ? <span className="muted">{m.label}</span> : m.label}</th><td className="numeric">{m.agencies}</td><td className="numeric">{m.wallets}</td><td className="numeric">{scope.additive ? matrixNumber(m.total, unit) : '—'}</td><td className="numeric">{percent(m.share)}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
    {scope.additive && segments.length > 0 && <Card title="Curva mensal por segmento" subtitle={`Meta das carteiras mês a mês · ${scope.product.sub_product}`}>
      <StackedBarChart aria-label={`Meta mensal por segmento de ${scope.product.sub_product}`} height={240} series={[...segments].reverse().map(s => ({ key: s.id, label: s.label, color: s.color ?? '#4f8c27' }))} data={monthly} formatValue={n => compact(n, unit).replace('R$ ', '')} />
      <div className="chart-legend-row">{segments.map(s => <span key={s.id}><i style={{ background: s.color }} aria-hidden />{s.label}</span>)}</div>
    </Card>}
    <Card title="Concentração" subtitle="Carteiras que sozinhas pesam muito na meta da agência" actions={<span className="reports-toolbar"><span><label htmlFor="rep-threshold">Acima de</label><Select id="rep-threshold" value={threshold} onChange={e => setThreshold(Number(e.target.value))}><option value={30}>30%</option><option value={40}>40%</option><option value={50}>50%</option><option value={60}>60%</option></Select></span></span>}>
      {concentrated.length ? <ul className="concentration-list">{concentrated.map(r => <li key={r.key}><span><strong>{r.line.agency.code} · {r.line.agency.name}</strong> {r.wallet.code} · {r.wallet.name}</span><Badge tone="pending">{percent(r.share)}</Badge></li>)}</ul>
        : <p className="muted">Nenhuma carteira passa de {threshold}% da meta da agência neste subproduto.</p>}
    </Card>
  </div>;
}

// ---------------------------------------------------------------- Conferência

function IssuesTab({ issues, counts, kind, setKind, openAgency, year }: { issues: Issue[]; counts: Record<IssueKind, number>; kind: IssueKind | ''; setKind: (kind: IssueKind | '') => void; openAgency: (id: number) => void; year: number }) {
  const shown = kind ? issues.filter(i => i.kind === kind) : issues;
  const text = (issue: Issue) => describeIssue(issue, money, shortMonths);
  const exportCsv = () => downloadCsv(`conferencia-${year}.csv`, [['Severidade', 'Pendência', 'Regional', 'Código agência', 'Agência', 'Subproduto', 'Detalhe'],
    ...shown.map(i => [severityLabel[i.severity], ISSUE_INFO[i.kind].label, i.line.agency.regional_name, i.line.agency.code, i.line.agency.name, i.line.goal.sub_product, text(i)])]);
  return <div className="reports-panel">
    <div className="issue-chips" role="group" aria-label="Tipo de pendência">
      <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')}>Todas <span>{issues.length}</span></button>
      {ISSUE_ORDER.filter(k => counts[k] > 0 || k === kind).map(k => <button type="button" key={k} aria-pressed={kind === k} data-severity={ISSUE_INFO[k].severity} onClick={() => setKind(kind === k ? '' : k)} title={ISSUE_INFO[k].hint}>{ISSUE_INFO[k].label} <span>{counts[k]}</span></button>)}
      <Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv} disabled={!shown.length}>Exportar lista</Button>
    </div>
    {shown.length === 0 ? <Empty title="Nenhuma pendência"><p>Nos filtros atuais, todas as metas estão distribuídas e as carteiras fecham 100%.</p></Empty> :
      <Card flush><div className="table-scroll"><table className="app-table report-table">
        <caption className="sr-only">Pendências das metas de {year}</caption>
        <thead><tr><th>Gravidade</th><th>Pendência</th><th>Agência</th><th>Subproduto</th><th>Detalhe</th><th /></tr></thead>
        <tbody>{shown.map(i => <tr key={i.id}>
          <td><Badge tone={severityTone[i.severity]}>{severityLabel[i.severity]}</Badge></td><td><strong>{ISSUE_INFO[i.kind].label}</strong></td>
          <th scope="row"><RegionalTag name={i.line.agency.regional_name} />{i.line.agency.code} · {i.line.agency.name}</th>
          <td>{i.line.goal.sub_product}</td><td className="report-detail">{text(i)}</td>
          <td><button type="button" className="report-link" onClick={() => openAgency(i.line.agency.id)}>Abrir <ArrowUpRight size={14} /></button></td></tr>)}</tbody></table></div></Card>}
  </div>;
}
