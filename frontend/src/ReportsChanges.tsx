import { useState } from 'react';
import { Badge, Button, Card, Select } from 'broto-ui';
import { ArrowDownToLine, ArrowUpRight, FileUp, History, LockKeyholeOpen, Users } from 'lucide-react';
import { api, dateTime, errorText, money, type Audit } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading, RegionalTag } from './shared';
import { ACTION_LABELS, NO_ACTOR, parseImport, parseUnlock, type VersionEntry, type VersionsResponse } from './reportData';
import { Metric, downloadCsv } from './reportUi';

const PAGE = 25;
type Kind = '' | 'unlock' | 'import';
const kindLabel: Record<Kind, string> = { '': 'Todas as mudanças', unlock: 'Totais destravados', import: 'Importações' };
const actionTone: Record<string, 'success' | 'info' | 'neutral' | 'brand' | 'pending'> = { create: 'info', baseline: 'neutral', update: 'neutral', import: 'brand', distribute: 'success' };

const changeText = (c: VersionEntry['changes'][number], unit: string) => `${c.label}: ${money(c.before, unit)} → ${money(c.after, unit)}`;

export function ChangesTab({ year, regional, agency, product, openAgency }: { year: number; regional: number; agency: number; product: number; openAgency: (id: number) => void }) {
  const { data, tick, refresh } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [kind, setKind] = useState<Kind>('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const query = `year=${year}${regional ? `&regional_id=${regional}` : ''}${agency ? `&agency_id=${agency}` : ''}${product ? `&product_id=${product}` : ''}${from ? `&date_from=${from}` : ''}${to ? `&date_to=${to}` : ''}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}${action ? `&action=${action}` : ''}${kind ? `&kind=${kind}` : ''}`;
  const remote = useRemote<VersionsResponse>(`/versions?${query}&limit=${PAGE}&offset=${page * PAGE}`, tick);
  const latest = useRemote<{ total: number; entries: Audit[] }>('/audit?limit=1', tick);
  const result = remote.data;
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE));
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(0); };
  const regionalName = (id?: number) => data.regionals.find(r => r.id === id)?.name ?? '';
  const filtered = !!(from || to || actor || action || kind);

  const exportCsv = async () => {
    setExporting(true); setExportError('');
    try {
      const all: VersionEntry[] = [];
      for (let offset = 0; offset < 5000; offset += 200) {
        const part = await api<VersionsResponse>(`/versions?${query}&limit=200&offset=${offset}`);
        all.push(...part.entries);
        if (all.length >= part.total || !part.entries.length) break;
      }
      downloadCsv(`mudancas-${year}.csv`, [['Data e hora', 'Autor', 'Regional', 'Código agência', 'Agência', 'Subproduto', 'Ação', 'Versão', 'Total do ano', 'Total destravado: antes', 'Total destravado: depois', 'Motivo do destravamento', 'Detalhe', 'O que mudou'],
        ...all.map(e => { const unlock = parseUnlock(e.detail); return [dateTime(e.timestamp), e.actor ?? '', regionalName(e.agency.regional_id), e.agency.code, e.agency.name, e.product.sub_product, ACTION_LABELS[e.action] ?? e.action, e.version, e.annual_amount, unlock?.before ?? '', unlock?.after ?? '', unlock?.reason ?? '', e.detail, e.changes.map(c => changeText(c, e.product.unit)).join(' | ')]; })]);
    } catch (e) { setExportError(errorText(e)); } finally { setExporting(false); }
  };

  return <div className="reports-panel">
    <div className="stats-grid">
      <Metric label="Mudanças registradas" value={String(result?.counts?.all ?? 0)} hint={`Metas de ${year}, no filtro atual`} Icon={History} color="green" onClick={() => reset(setKind)('')} />
      <Metric label="Totais destravados" value={String(result?.counts?.unlock ?? 0)} hint="Total anual alterado com motivo" Icon={LockKeyholeOpen} color="amber" onClick={() => reset(setKind)('unlock')} />
      <Metric label="Importações de planilha" value={String(result?.counts?.import ?? 0)} hint="Meses ou totais trocados por arquivo" Icon={FileUp} color="blue" onClick={() => reset(setKind)('import')} />
      <Metric label="Autores" value={String(result?.actors?.length ?? 0)} hint={latest.data?.entries[0] ? `Última: ${dateTime(latest.data.entries[0].timestamp)}` : 'Quem alterou metas'} Icon={Users} color="purple" />
    </div>
    <div className="reports-toolbar">
      <span><label htmlFor="chg-from">De</label><input id="chg-from" type="date" className="bt-input" value={from} max={to || undefined} onChange={e => reset(setFrom)(e.target.value)} /></span>
      <span><label htmlFor="chg-to">Até</label><input id="chg-to" type="date" className="bt-input" value={to} min={from || undefined} onChange={e => reset(setTo)(e.target.value)} /></span>
      <span><label htmlFor="chg-actor">Autor</label><Select id="chg-actor" value={actor} onChange={e => reset(setActor)(e.target.value)}><option value="">Todos os autores</option>{(result?.actors ?? []).map(a => <option key={a ?? NO_ACTOR} value={a ?? NO_ACTOR}>{a ?? 'Sem autor'}</option>)}</Select></span>
      <span><label htmlFor="chg-action">Ação</label><Select id="chg-action" value={action} onChange={e => reset(setAction)(e.target.value)}><option value="">Todas as ações</option>{(result?.actions ?? []).map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}</Select></span>
      {filtered && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); setActor(''); setAction(''); setKind(''); setPage(0); }}>Limpar período e tipo</Button>}
      <Button icon={<ArrowDownToLine size={16} />} loading={exporting} disabled={!result?.total} onClick={() => void exportCsv()}>Exportar mudanças</Button>
    </div>
    {exportError && <div className="form-error" role="alert">{exportError}</div>}
    <div className="issue-chips" role="group" aria-label="Tipo de mudança">
      {(['', 'unlock', 'import'] as Kind[]).map(k => <button type="button" key={k || 'all'} aria-pressed={kind === k} onClick={() => reset(setKind)(k)}>{kindLabel[k]} <span>{k === '' ? result?.counts?.all ?? 0 : result?.counts?.[k] ?? 0}</span></button>)}
    </div>
    {remote.loading && !result ? <Loading /> : remote.error ? <Failure error={remote.error} retry={refresh} /> : !result?.entries.length ? <Empty title="Nenhuma mudança neste filtro"><p>Ajuste o período, o autor ou o tipo para ver o histórico.</p></Empty> :
      <Card flush>
        <div className="table-scroll"><table className="app-table report-table changes-table">
          <caption className="sr-only">Mudanças nas metas de {year}</caption>
          <thead><tr><th>Quando</th><th>Quem</th><th>Agência</th><th>Subproduto</th><th>O que mudou</th><th /></tr></thead>
          <tbody>{result.entries.map(e => <ChangeRow key={e.id} entry={e} regionalName={regionalName(e.agency.regional_id)} openAgency={openAgency} />)}</tbody>
        </table></div>
        <div className="reports-pager"><span>{result.total} {result.total === 1 ? 'registro' : 'registros'}</span>
          <span><Button size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="reports-pager-page">Página {page + 1} de {pages}</span><Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Próxima</Button></span></div>
      </Card>}
  </div>;
}

function ChangeRow({ entry: e, regionalName, openAgency }: { entry: VersionEntry; regionalName: string; openAgency: (id: number) => void }) {
  const unlock = parseUnlock(e.detail);
  const imported = parseImport(e.detail);
  const unit = e.product.unit;
  const shown = e.changes.slice(0, 3);
  const rest = e.changes.slice(3);
  return <tr>
    <td className="changes-when">{dateTime(e.timestamp)}<small>versão {e.version}</small></td>
    <td>{e.actor ?? <span className="muted">Sem autor</span>}</td>
    <th scope="row"><RegionalTag name={regionalName} />{e.agency.code} · {e.agency.name}</th>
    <td>{e.product.sub_product}</td>
    <td className="report-detail">
      <div className="changes-badges"><Badge tone={actionTone[e.action] ?? 'neutral'}>{ACTION_LABELS[e.action] ?? e.action}</Badge>{unlock && <Badge tone="pending">Total destravado</Badge>}{imported && <Badge tone="brand">Planilha</Badge>}</div>
      {unlock && <p className="changes-unlock"><strong>Total {money(unlock.before, unit)} → {money(unlock.after, unit)}</strong><span>Motivo: {unlock.reason}</span></p>}
      {e.changes.length ? <ul className="changes-list">{shown.map((c, i) => <li key={i}>{changeText(c, unit)}</li>)}</ul> : <p className="muted">{e.detail}</p>}
      {rest.length > 0 && <details className="changes-more"><summary>+ {rest.length} {rest.length === 1 ? 'mudança' : 'mudanças'}</summary><ul className="changes-list">{rest.map((c, i) => <li key={i}>{changeText(c, unit)}</li>)}</ul></details>}
      {imported && !e.changes.length && <p className="muted">{imported.join(' · ')}</p>}
    </td>
    <td><button type="button" className="report-link" onClick={() => openAgency(e.agency.id)}>Abrir <ArrowUpRight size={14} /></button></td>
  </tr>;
}
