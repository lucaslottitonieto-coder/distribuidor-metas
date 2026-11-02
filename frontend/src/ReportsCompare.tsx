import { useMemo, useState } from 'react';
import { Badge, Button, Card, Select } from 'broto-ui';
import { ArrowDownToLine, FileSpreadsheet } from 'lucide-react';
import { apiUrl, compact, dateTime, errorText, money, months, shortMonths, type MatrixRow, type PlanningMatrix } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading } from './shared';
import { matrixNumber } from './matrixUtils';
import { unitLabel } from './units';
import { ACTION_LABELS, buildLines, compareYears, diffVersions, type ReportFilters, type VersionSnapshot } from './reportData';
import { downloadCsv, signed } from './reportUi';

type Mode = 'anos' | 'versoes' | 'planilha';
const modes: { id: Mode; label: string; hint: string }[] = [
  { id: 'anos', label: 'Ano × ano', hint: 'Totais e meses de dois anos lado a lado' },
  { id: 'versoes', label: 'Versão × versão', hint: 'O que mudou entre duas versões de uma meta' },
  { id: 'planilha', label: 'Planilha × sistema', hint: 'Confere um arquivo contra o que está gravado, sem importar' },
];
const deltaClass = (value: number) => value > 0 ? 'delta-up' : value < 0 ? 'delta-down' : '';
const signedNumber = (value: number, unit: string) => value === 0 ? '0' : `${value > 0 ? '+' : '−'}${matrixNumber(Math.abs(value), unit)}`;

export function CompareTab({ rows, year, filters }: { rows: MatrixRow[]; year: number; filters: ReportFilters }) {
  const [mode, setMode] = useState<Mode>('anos');
  return <div className="reports-panel">
    <div className="issue-chips" role="group" aria-label="Tipo de comparação">
      {modes.map(m => <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} title={m.hint}>{m.label}</button>)}
    </div>
    <p className="reports-scope-note">{modes.find(m => m.id === mode)?.hint}. Os filtros de segmento e gestor não se aplicam aqui.</p>
    {mode === 'anos' && <YearCompare rows={rows} year={year} filters={filters} />}
    {mode === 'versoes' && <VersionCompare rows={rows} filters={filters} />}
    {mode === 'planilha' && <SheetCompare rows={rows} year={year} />}
  </div>;
}

// ---------------------------------------------------------------- Ano × ano

function YearCompare({ rows, year, filters }: { rows: MatrixRow[]; year: number; filters: ReportFilters }) {
  const { data } = useApp();
  const others = (data.goal_years ?? data.years).filter(y => y !== year).sort((a, b) => b - a);
  const [chosen, setChosen] = useState(0);
  const target = others.includes(chosen) ? chosen : others.includes(year - 1) ? year - 1 : others[0] ?? 0;
  if (!target) return <Empty title="Não há outro ano para comparar"><p>Escolha "Novo ano…" no seletor de ano, no topo da tela, para iniciar outro ano e comparar com {year}.</p></Empty>;
  return <>
    <div className="reports-toolbar"><span><label htmlFor="cmp-year">Comparar {year} com</label><Select id="cmp-year" value={target} onChange={e => setChosen(Number(e.target.value))}>{others.map(y => <option key={y} value={y}>{y}</option>)}</Select></span></div>
    <YearCompareData key={target} rows={rows} year={year} other={target} filters={filters} />
  </>;
}

function YearCompareData({ rows, year, other, filters }: { rows: MatrixRow[]; year: number; other: number; filters: ReportFilters }) {
  const { tick, refresh } = useApp();
  const remote = useRemote<PlanningMatrix>(`/goals?year=${other}`, tick);
  const sections = useMemo(() => remote.data ? compareYears(buildLines(remote.data.rows, filters), buildLines(rows, filters)) : [], [remote.data, rows, filters]);
  if (remote.loading && !remote.data) return <Loading />;
  if (remote.error) return <Failure error={remote.error} retry={refresh} />;
  if (!sections.length) return <Empty title={`Sem metas em ${other} nos filtros atuais`}><p>Escolha outro ano ou limpe os filtros.</p></Empty>;
  const exportCsv = () => downloadCsv(`ano-${year}-contra-${other}.csv`, [['Subproduto', 'Unidade', 'Código agência', 'Agência', `Total ${other}`, `Total ${year}`, 'Diferença', 'Variação (%)', ...shortMonths.map(m => `${m}/${other}`), ...shortMonths.map(m => `${m}/${year}`)],
    ...sections.flatMap(s => s.rows.map(r => [s.product.sub_product, s.product.unit, r.agency.code, r.agency.name, r.a, r.b, r.delta, r.pct === null ? '' : Math.round(r.pct * 10000) / 100, ...r.monthsA, ...r.monthsB]))]);
  return <>
    <div className="reports-toolbar"><span className="reports-toolbar-note">{year} comparado com {other}: a variação é sobre {other}.</span><Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv}>Exportar comparação</Button></div>
    {sections.map(s => <Card key={s.product.id} title={s.product.sub_product} subtitle={`${s.product.name} · ${unitLabel(s.product.unit)}`}
      actions={s.additive ? <span className="compare-headline"><strong>{compact(s.totalB, s.product.unit)}</strong><span className={deltaClass(s.delta)}>{signed(s.pct)} sobre {compact(s.totalA, s.product.unit)} em {other}</span></span> : undefined} flush>
      <div className="table-scroll"><table className="app-table report-table">
        <caption className="sr-only">{s.product.sub_product}: {year} comparado com {other}</caption>
        <thead><tr><th>Agência</th><th className="numeric">{other}</th><th className="numeric">{year}</th><th className="numeric">Diferença</th><th className="numeric">Variação</th></tr></thead>
        <tbody>{s.rows.map(r => <tr key={r.key}>
          <th scope="row">{r.agency.code} · {r.agency.name}</th><td className="numeric">{matrixNumber(r.a, s.product.unit)}</td><td className="numeric">{matrixNumber(r.b, s.product.unit)}</td>
          <td className={`numeric ${deltaClass(r.delta)}`}>{signedNumber(r.delta, s.product.unit)}</td><td className={`numeric ${deltaClass(r.delta)}`}>{signed(r.pct)}</td></tr>)}
          {s.additive && <tr className="is-total"><th scope="row">Total</th><td className="numeric">{matrixNumber(s.totalA, s.product.unit)}</td><td className="numeric">{matrixNumber(s.totalB, s.product.unit)}</td><td className={`numeric ${deltaClass(s.delta)}`}>{signedNumber(s.delta, s.product.unit)}</td><td className={`numeric ${deltaClass(s.delta)}`}>{signed(s.pct)}</td></tr>}
        </tbody>
      </table></div>
      {s.additive && <div className="table-scroll compare-months"><table className="app-table report-table">
        <caption className="sr-only">Mês a mês de {s.product.sub_product}</caption>
        <thead><tr><th>Mês a mês</th>{shortMonths.map(m => <th className="numeric" key={m}>{m}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">{other}</th>{s.monthsA.map((v, i) => <td className="numeric" key={i}>{matrixNumber(v, s.product.unit)}</td>)}</tr>
          <tr><th scope="row">{year}</th>{s.monthsB.map((v, i) => <td className="numeric" key={i}>{matrixNumber(v, s.product.unit)}</td>)}</tr>
          <tr className="is-total"><th scope="row">Diferença</th>{s.monthsB.map((v, i) => { const d = Math.round((v - s.monthsA[i]) * 1000) / 1000; return <td className={`numeric ${deltaClass(d)}`} key={i}>{signedNumber(d, s.product.unit)}</td>; })}</tr>
        </tbody>
      </table></div>}
    </Card>)}
  </>;
}

// ---------------------------------------------------------------- Versão × versão

type History = { goal: { id: number; year: number; agency: { id: number; code: string; name: string }; product: { id: number; name: string; sub_product: string; unit: string } }; versions: VersionSnapshot[] };

function VersionCompare({ rows, filters }: { rows: MatrixRow[]; filters: ReportFilters }) {
  const agencies = useMemo(() => [...new Map(rows.map(r => [r.agency.id, r.agency])).values()].sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true })), [rows]);
  const [agencyId, setAgencyId] = useState(0);
  const [productId, setProductId] = useState(0);
  const agency = agencies.find(a => a.id === (agencyId || filters.agency))?.id ?? agencies[0]?.id ?? 0;
  const goals = rows.filter(r => r.agency.id === agency).map(r => r.goal);
  const goal = goals.find(g => g.product_id === (productId || filters.product)) ?? goals[0];
  if (!agencies.length || !goal) return <Empty title="Nenhuma meta para comparar"><p>Não há metas nos filtros atuais.</p></Empty>;
  return <>
    <div className="reports-toolbar">
      <span><label htmlFor="ver-agency">Agência</label><Select id="ver-agency" value={agency} onChange={e => { setAgencyId(Number(e.target.value)); setProductId(0); }}>{agencies.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</Select></span>
      <span><label htmlFor="ver-product">Subproduto</label><Select id="ver-product" value={goal.product_id} onChange={e => setProductId(Number(e.target.value))}>{goals.map(g => <option key={g.id} value={g.product_id}>{g.sub_product}</option>)}</Select></span>
    </div>
    <VersionCompareData key={goal.id} goalId={goal.id} />
  </>;
}

function VersionCompareData({ goalId }: { goalId: number }) {
  const { tick, refresh } = useApp();
  const remote = useRemote<History>(`/goals/${goalId}/versions`, tick);
  const [pickA, setPickA] = useState(0);
  const [pickB, setPickB] = useState(0);
  const versions = remote.data?.versions ?? [];
  const b = versions.find(v => v.version === pickB) ?? versions[0];
  const a = versions.find(v => v.version === pickA) ?? versions[1] ?? versions[0];
  const diff = useMemo(() => a && b ? diffVersions(a, b) : null, [a, b]);
  if (remote.loading && !remote.data) return <Loading />;
  if (remote.error) return <Failure error={remote.error} retry={refresh} />;
  if (!remote.data || !a || !b || !diff) return <Empty title="Nenhuma versão gravada" />;
  const unit = remote.data.goal.product.unit;
  const label = (v: VersionSnapshot) => `v${v.version} · ${dateTime(v.timestamp)} · ${v.actor ?? 'sem autor'} · ${ACTION_LABELS[v.action] ?? v.action}`;
  const changedWallets = diff.wallets.filter(w => w.delta !== 0 || w.months.some(m => m.a !== m.b));
  const exportCsv = () => downloadCsv(`versoes-${remote.data!.goal.agency.code}-${remote.data!.goal.product.sub_product}.csv`.replace(/\s+/g, '-'), [['Item', `Versão ${a.version}`, `Versão ${b.version}`, 'Diferença'],
    ['Total do ano', diff.annual.a, diff.annual.b, diff.annual.delta], ...diff.months.map(m => [months[m.month - 1], m.a, m.b, m.delta]),
    ...diff.wallets.flatMap(w => [[`Carteira ${w.name} · total`, w.a, w.b, w.delta], ...w.months.filter(m => m.a !== m.b).map(m => [`Carteira ${w.name} · ${months[m.month - 1]}`, m.a, m.b, Math.round((m.b - m.a) * 1000) / 1000])])]);
  return <>
    <div className="reports-toolbar">
      <span><label htmlFor="ver-a">Versão A (antes)</label><Select id="ver-a" value={a.version} onChange={e => setPickA(Number(e.target.value))}>{versions.map(v => <option key={v.version} value={v.version}>{label(v)}</option>)}</Select></span>
      <span><label htmlFor="ver-b">Versão B (depois)</label><Select id="ver-b" value={b.version} onChange={e => setPickB(Number(e.target.value))}>{versions.map(v => <option key={v.version} value={v.version}>{label(v)}</option>)}</Select></span>
      <Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv}>Exportar comparação</Button>
    </div>
    {versions.length < 2 && <p className="reports-scope-note">Esta meta tem uma única versão, então não há o que comparar ainda.</p>}
    <div className="reports-two">
      {[a, b].map((v, i) => <Card key={i} title={`${i === 0 ? 'A · antes' : 'B · depois'} · versão ${v.version}`} subtitle={`${dateTime(v.timestamp)} · ${v.actor ?? 'sem autor'}`}><p className="compare-detail">{v.detail}</p><strong className="compare-total">{money(v.annual_amount, unit)}</strong></Card>)}
    </div>
    <Card title="Mês a mês" subtitle={diff.changedMonths ? `${diff.changedMonths} ${diff.changedMonths === 1 ? 'mês mudou' : 'meses mudaram'} · total do ano ${signedNumber(diff.annual.delta, unit)}` : `Nenhum mês mudou · total do ano ${signedNumber(diff.annual.delta, unit)}`} flush>
      <div className="table-scroll"><table className="app-table report-table">
        <thead><tr><th>Mês</th><th className="numeric">Versão {a.version}</th><th className="numeric">Versão {b.version}</th><th className="numeric">Diferença</th></tr></thead>
        <tbody>{diff.months.map(m => <tr key={m.month} className={m.delta ? 'is-changed' : ''}><th scope="row">{months[m.month - 1]}</th><td className="numeric">{matrixNumber(m.a, unit)}</td><td className="numeric">{matrixNumber(m.b, unit)}</td><td className={`numeric ${deltaClass(m.delta)}`}>{signedNumber(m.delta, unit)}</td></tr>)}
          <tr className="is-total"><th scope="row">Total do ano</th><td className="numeric">{matrixNumber(diff.annual.a, unit)}</td><td className="numeric">{matrixNumber(diff.annual.b, unit)}</td><td className={`numeric ${deltaClass(diff.annual.delta)}`}>{signedNumber(diff.annual.delta, unit)}</td></tr></tbody>
      </table></div>
    </Card>
    <Card title="Carteiras" subtitle={changedWallets.length ? `${changedWallets.length} ${changedWallets.length === 1 ? 'carteira mudou' : 'carteiras mudaram'}` : 'Nenhuma carteira mudou'} flush>
      <div className="table-scroll"><table className="app-table report-table">
        <thead><tr><th>Carteira</th><th className="numeric">Versão {a.version}</th><th className="numeric">Versão {b.version}</th><th className="numeric">Diferença</th></tr></thead>
        <tbody>{diff.wallets.map(w => {
          const changed = w.months.filter(m => m.a !== m.b);
          return <tr key={w.id} className={changed.length ? 'is-changed' : ''}><th scope="row">{w.name}{changed.length > 0 && <details className="changes-more"><summary>{changed.length} {changed.length === 1 ? 'mês' : 'meses'} com mudança</summary><ul className="changes-list">{changed.map(m => <li key={m.month}>{months[m.month - 1]}: {matrixNumber(m.a, unit)} → {matrixNumber(m.b, unit)}</li>)}</ul></details>}</th>
            <td className="numeric">{matrixNumber(w.a, unit)}</td><td className="numeric">{matrixNumber(w.b, unit)}</td><td className={`numeric ${deltaClass(w.delta)}`}>{signedNumber(w.delta, unit)}</td></tr>;
        })}</tbody>
      </table></div>
    </Card>
  </>;
}

// ---------------------------------------------------------------- Planilha × sistema

type SheetEntry = { line: number; goal_id: number | null; agency_code: string; agency_name: string; regional_name: string; sub_product: string; unit: string; annual_amount: number; months: number[] | null; month_changes: { month: number; before: number; after: number }[]; locked_change: boolean };
type SheetPreview = { year: number; entries: SheetEntry[]; errors: string[] };

function SheetCompare({ rows, year }: { rows: MatrixRow[]; year: number }) {
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const systemTotal = useMemo(() => new Map(rows.map(r => [r.goal.id, r.goal.annual_amount])), [rows]);
  const load = async (file?: File) => {
    setPreview(null); setError(''); setFileName(file?.name ?? '');
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(apiUrl(`/annual-goals/preview?year=${year}`), { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Não foi possível ler a planilha.');
      setPreview(result);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const diffs = preview?.entries.filter(e => e.month_changes.length || (e.goal_id !== null && systemTotal.get(e.goal_id) !== e.annual_amount) || e.goal_id === null) ?? [];
  const monthCount = preview?.entries.reduce((n, e) => n + e.month_changes.length, 0) ?? 0;
  const exportCsv = () => downloadCsv(`planilha-contra-sistema-${year}.csv`, [['Linha', 'Regional', 'Código agência', 'Agência', 'Subproduto', 'Total no sistema', 'Total na planilha', 'Mês', 'Mês no sistema', 'Mês na planilha'],
    ...diffs.flatMap(e => { const system = e.goal_id !== null ? systemTotal.get(e.goal_id) ?? '' : ''; const base = [e.line, e.regional_name, e.agency_code, e.agency_name, e.sub_product, system, e.annual_amount];
      return e.month_changes.length ? e.month_changes.map(c => [...base, months[c.month - 1], c.before, c.after]) : [[...base, '', '', '']]; })]);
  return <>
    <div className="reports-toolbar">
      <span><label htmlFor="sheet-file">Arquivo Excel ou CSV (modelo de metas anuais ou CSV exportado)</label><input id="sheet-file" className="annual-file-input" type="file" accept=".xlsx,.csv" disabled={busy} onChange={e => void load(e.target.files?.[0])} /></span>
      {diffs.length > 0 && <Button icon={<ArrowDownToLine size={16} />} onClick={exportCsv}>Exportar diferenças</Button>}
    </div>
    <p className="reports-scope-note"><FileSpreadsheet size={14} />Só compara: nada é gravado. Para aplicar a planilha, use Importar Excel em Meta por Agência.</p>
    {busy && <Loading />}
    {error && <div className="form-error" role="alert">{error}</div>}
    {preview && !!preview.errors.length && <div className="form-error" role="alert"><strong>Corrija a planilha para comparar:</strong><ul>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
    {preview && !preview.errors.length && <>
      <p className="compare-summary"><strong>{fileName}</strong>: {preview.entries.length} {preview.entries.length === 1 ? 'linha lida' : 'linhas lidas'} · {diffs.length} com diferença · {monthCount} {monthCount === 1 ? 'mês diferente' : 'meses diferentes'}</p>
      {!diffs.length ? <Empty title="A planilha é igual ao sistema"><p>Nenhum total nem mês difere do que está gravado.</p></Empty> :
        <Card flush><div className="table-scroll"><table className="app-table report-table">
          <thead><tr><th>Linha</th><th>Agência</th><th>Subproduto</th><th className="numeric">Total no sistema</th><th className="numeric">Total na planilha</th><th>Meses diferentes</th></tr></thead>
          <tbody>{diffs.map(e => {
            const system = e.goal_id !== null ? systemTotal.get(e.goal_id) : undefined;
            return <tr key={e.line}><td>{e.line}</td><th scope="row">{e.agency_code} · {e.agency_name}</th><td>{e.sub_product}{e.goal_id === null && <Badge tone="info">Meta nova</Badge>}</td>
              <td className="numeric">{system === undefined ? '—' : matrixNumber(system, e.unit)}</td>
              <td className={`numeric ${system !== undefined && system !== e.annual_amount ? 'delta-down' : ''}`}>{matrixNumber(e.annual_amount, e.unit)}{e.locked_change && <small className="report-gap">total travado seria alterado</small>}</td>
              <td className="report-detail">{e.month_changes.length ? <ul className="changes-list">{e.month_changes.map(c => <li key={c.month}><strong>{shortMonths[c.month - 1]}</strong> {matrixNumber(c.before, e.unit)} → {matrixNumber(c.after, e.unit)}</li>)}</ul> : <span className="muted">Só o total difere</span>}</td></tr>;
          })}</tbody>
        </table></div></Card>}
    </>}
  </>;
}
