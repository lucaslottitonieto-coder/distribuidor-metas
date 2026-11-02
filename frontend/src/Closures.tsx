import { useEffect, useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Input, toast } from 'broto-ui';
import { CalendarCheck, History, LockKeyhole, LockKeyholeOpen, ShieldCheck } from 'lucide-react';
import { api, dateTime, errorText, months, type ClosureData, type MonthClosure } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading } from './shared';
import './closures.css';

export function useClosedMonths() {
  const { data, year } = useApp();
  return new Set((data.closures || []).filter(c => c.year === year && c.closed).map(c => c.month));
}

export function ClosureNotice() {
  const locked = useClosedMonths();
  if (!locked.size) return null;
  return <div className="closure-notice" role="status"><LockKeyhole size={18}/><div><strong>Meses fechados: {[...locked].map(m => months[m - 1]).join(', ')}</strong><span>Metas, percentuais e distribuições desses meses estão travados. Os ajustes e recálculos afetam somente os meses abertos. Cadastros vinculados ao histórico também estão protegidos.</span></div></div>;
}

export default function Closures() {
  const { year, tick, refresh, setUnsaved } = useApp();
  const [page, setPage] = useState(0);
  const remote = useRemote<ClosureData>(`/closures?year=${year}&offset=${page * 20}`, tick);
  const [editing, setEditing] = useState<MonthClosure | null>(null);
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const word = editing?.closed ? 'REABRIR' : 'FECHAR';
  useEffect(() => { setUnsaved(!!editing && !!(actor || reason || confirmation)); }, [editing, actor, reason, confirmation, setUnsaved]);
  useEffect(() => () => setUnsaved(false), [setUnsaved]);
  const open = (month: MonthClosure) => { setEditing(month); setActor(''); setReason(''); setConfirmation(''); setError(''); };
  const save = async () => {
    if (!editing || busy || actor.trim().length < 3 || reason.trim().length < 5 || confirmation !== word) return;
    setBusy(true); setError('');
    try {
      await api(`/closures/${editing.year}/${editing.month}`, { revision: editing.revision, closed: !editing.closed, actor: actor.trim(), reason: reason.trim(), confirmation }, 'PUT');
      toast.success(`${months[editing.month - 1]} de ${editing.year} ${editing.closed ? 'reaberto' : 'fechado'}`, 'Responsável, data, hora e justificativa registrados no histórico.');
      setEditing(null); setUnsaved(false); setPage(0); refresh();
    } catch (e) { setError(errorText(e)); refresh(); } finally { setBusy(false); }
  };
  if (!remote.data) return remote.error ? <Failure error={remote.error} retry={refresh}/> : <Loading/>;
  const data = remote.data;
  const closed = data.months.filter(m => m.closed).length;
  return <div className="closures-page">
    <div className="closure-overview"><div><span className="entity-icon"><CalendarCheck size={23}/></span><div><h2>Fechamentos de {year}</h2><p>Controle quais meses podem receber alterações em todas as agências.</p></div></div><div className="closure-counts"><Badge tone="neutral">{closed} {closed===1?'fechado':'fechados'}</Badge><Badge tone="success">{12 - closed} {12-closed===1?'aberto':'abertos'}</Badge></div></div>
    <div className="closure-notice"><ShieldCheck size={19}/><div><strong>Cada mês tem seu próprio bloqueio</strong><span>Fechar janeiro preserva janeiro. Fevereiro em diante continua editável enquanto estiver aberto. O bloqueio vale para metas, sazonalidade, carteiras e operações em lote de todas as agências do ano selecionado.</span></div></div>
    {!!remote.error && <Failure error={remote.error} retry={refresh}/>}
    <Card title="Situação dos meses" subtitle="A data do último fechamento permanece visível mesmo depois de uma reabertura." flush>
      <div className="table-scroll"><table className="app-table closure-table"><thead><tr><th>Mês / ano</th><th>Situação</th><th>Último fechamento</th><th>Responsável pelo fechamento</th><th>Última movimentação</th><th/></tr></thead><tbody>{data.months.map(m => <tr key={m.month} className={m.closed ? 'closure-row-closed' : ''}>
        <td><div className="entity-cell"><span className="entity-icon">{m.closed ? <LockKeyhole size={17}/> : <LockKeyholeOpen size={17}/>}</span><strong>{months[m.month - 1]} <small>{year}</small></strong></div></td>
        <td><Badge tone={m.closed ? 'neutral' : 'success'}>{m.closed ? 'Fechado' : 'Aberto'}</Badge></td><td>{m.closed_at ? dateTime(m.closed_at) : 'Ainda não fechado'}</td><td>{m.closed_by || '—'}</td>
        <td><span>{m.updated_at ? `${m.closed ? 'Fechado' : 'Reaberto'} em ${dateTime(m.updated_at)}` : 'Sem movimentações'}</span>{m.updated_by && <small>{m.updated_by}</small>}{m.reason && <small className="closure-reason" title={m.reason}>{m.reason}</small>}</td>
        <td><Button size="sm" disabled={remote.loading} variant={m.closed ? 'secondary' : 'primary'} icon={m.closed ? <LockKeyholeOpen size={14}/> : <LockKeyhole size={14}/>} onClick={() => open(m)}>{m.closed ? 'Reabrir mês' : 'Fechar mês'}</Button></td>
      </tr>)}</tbody></table></div>
    </Card>
    <Card title="Histórico de fechamentos" subtitle={`Fechamentos e reaberturas de ${year}, com responsável, data e justificativa.`} flush><div className="closure-history">{data.entries.map(e => <article key={e.id}><span className="entity-icon"><History size={17}/></span><div><strong>{e.detail}</strong><small>Responsável informado: {e.actor} · Registro #{e.id}</small></div><time>{dateTime(e.timestamp)}</time></article>)}{!data.entries.length && <Empty title="Nenhum fechamento registrado neste ano"/>}</div><div className="table-bottom"><span>{data.total} movimentações registradas</span><div className="pagination-controls"><Button size="sm" disabled={page === 0 || remote.loading} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page + 1}</span><Button size="sm" disabled={(page + 1) * 20 >= data.total || remote.loading} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></div></Card>
    {editing && <Dialog open title={`${editing.closed ? 'Reabrir' : 'Fechar'} ${months[editing.month - 1]} de ${editing.year}`} description={editing.closed ? 'A reabertura libera novas alterações neste mês em todas as agências.' : 'Todas as metas, sazonalidades e distribuições deste mês serão bloqueadas em todas as agências.'} onClose={() => !busy && setEditing(null)} onSubmit={() => void save()} footer={<><Button disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" variant="primary" loading={busy} disabled={actor.trim().length < 3 || reason.trim().length < 5 || confirmation !== word} icon={<LockKeyhole size={15}/>}>{editing.closed ? 'Confirmar reabertura' : 'Confirmar fechamento'}</Button></>}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="Responsável" hint="Nome informado para auditoria. Este ambiente ainda não possui autenticação." required><Input autoFocus required minLength={3} maxLength={100} value={actor} disabled={busy} onChange={e => setActor(e.target.value)} placeholder="Nome do responsável pela operação"/></Field>
      <Field label="Justificativa" required><Input required minLength={5} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="Informe o motivo desta operação"/></Field>
      <Field label={`Digite ${word} para confirmar`} required><Input required value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></Field>
    </Dialog>}
  </div>;
}
