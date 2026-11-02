import { useState } from 'react';
import { Button, Checkbox, Dialog, Field, Input, Select, toast } from 'broto-ui';
import { ArrowDownToLine, CalendarDays, CircleAlert, Equal, Lock, LockOpen, Percent, Save, Upload } from 'lucide-react';
import { api, apiUrl, apportion, errorText, money, number, shortMonths, type MatrixRow, type SeasonalityData } from './api';
import { useApp, useRemote } from './context';
import { RegionalTag, SubproductOptions } from './shared';
import { MAX_AMOUNT, distributionStep, unitScale, unitSymbol } from './units';
import { NumberInput } from './NumberInput';
import './annual-planning.css';
import { ClosureNotice, useClosedMonths } from './Closures';
import { apportionOpen } from './math';

type Method = 'annual' | 'seasonal' | 'percent' | 'equal';
export type AnnualEditor = { kind: 'annual' | 'distribute'; productId: number; agencyId?: number; regionalId?: number; goalId?: number };

export function AnnualPlanningDialog({ rows, editor, onClose, onDirty }: { rows: MatrixRow[]; editor: AnnualEditor; onClose: (saved?: boolean) => void; onDirty: (dirty: boolean) => void }) {
  const { data, year, refresh, tick } = useApp();
  const locked = useClosedMonths();
  const [productId, setProductId] = useState(editor.productId || rows[0]?.goal.product_id || 0);
  const [method, setMethod] = useState<Method>(editor.kind === 'annual' && locked.size < 12 ? 'annual' : 'equal');
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(rows.map(r => [r.goal.id, String(r.goal.annual_amount)])));
  const [selected, setSelected] = useState(rows.filter(r => (!editor.agencyId || r.agency.id === editor.agencyId) && (!editor.regionalId || r.agency.regional_id === editor.regionalId) && (!editor.goalId || r.goal.id === editor.goalId)).map(r => r.goal.id));
  const [weights, setWeights] = useState(apportion(10000, Array(12).fill(1)).map(w => String(w / 100)));
  // Total já informado fica travado; destravar exige um motivo, que vai para o histórico.
  const [unlocked, setUnlocked] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const profiles =useRemote<SeasonalityData>(`/seasonality?year=${year}`, tick);
  const product = data.products.find(p => p.id === productId);
  const profile = profiles.data?.profiles.find(p => p.product_id === productId);
  const visible = rows.filter(r => r.goal.product_id === productId && (!editor.agencyId || r.agency.id === editor.agencyId) && (!editor.regionalId || r.agency.regional_id === editor.regionalId) && (!editor.goalId || r.goal.id === editor.goalId));
  const isLocked = (r: MatrixRow) => r.goal.annual_amount !== 0;
  // "Definir depois" só mexe em quem não tem total ou teve o total destravado e alterado: o resto já está travado e fica como está (os meses não são zerados).
  const targets = visible.filter(r => selected.includes(r.goal.id) && (method !== 'annual' || !isLocked(r) || Number(amounts[r.goal.id]) !== r.goal.annual_amount));
  const changedLocked = targets.filter(r => isLocked(r) && Number(amounts[r.goal.id]) !== r.goal.annual_amount);
  const reasonOk = !changedLocked.length || reason.trim().length >= 5;
  const unlock = (r: MatrixRow) => { setUnlocked(u => [...u, r.goal.id]); setSelected(s => s.includes(r.goal.id) ? s : [...s, r.goal.id]); change(); };
  const relock = (r: MatrixRow) => { setUnlocked(u => u.filter(id => id !== r.goal.id)); setAmounts(a => ({ ...a, [r.goal.id]: String(r.goal.annual_amount) })); change(); };
  const scale = unitScale(product?.unit || 'BRL');
  const bps = (method === 'seasonal' ? profile?.weights || [] : weights.map(Number)).map(w => Math.round(w * 100));
  const validWeights = method === 'annual' || method === 'equal' || (bps.length === 12 && bps.reduce((s, w) => s + w, 0) === 10000 && (method !== 'seasonal' || !!profile?.revision) && (method !== 'percent' || weights.every(w => w.trim() !== '' && Number.isFinite(Number(w)) && Number(w) >= 0 && Number(w) <= 100 && Math.abs(Number(w) * 100 - Math.round(Number(w) * 100)) < .00001)));
  const valid = validWeights && locked.size<12 && reasonOk && targets.length > 0 && targets.every(r => {
    const value = Number(amounts[r.goal.id]);
    return amounts[r.goal.id]?.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT && Number.isSafeInteger(Math.round(value * scale)) && Math.abs(value * scale - Math.round(value * scale)) < .00001 && (method==='annual'||!!apportionOpen(Math.round(value*scale),method==='equal'?Array(12).fill(1):bps,r.goal.months.map(m=>Math.round(m.amount*scale)),locked,distributionStep(product?.unit)));
  });
  const preview = (r: MatrixRow) => apportionOpen(Math.round(Number(amounts[r.goal.id]) * scale), method === 'equal' ? Array(12).fill(1) : bps, r.goal.months.map(m=>Math.round(m.amount*scale)), locked, distributionStep(product?.unit));
  const change = () => { onDirty(true); setError(''); };
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      await api('/annual-goals', { year, product_id: productId, method, profile_revision: method === 'seasonal' ? profile?.revision : null, weights: method === 'percent' ? weights.map(Number) : [], ...(changedLocked.length ? { unlock_reason: reason.trim() } : {}), entries: targets.map(r => ({ goal_id: r.goal.id, revision: r.goal.revision, annual_amount: Number(amounts[r.goal.id]) })) }, 'POST');
      toast.success(method === 'annual' ? 'Totais anuais salvos' : 'Metas distribuídas nos meses abertos', method === 'annual' ? 'Selecione o subproduto e a forma de distribuição para calcular os meses.' : 'O total anual foi preservado.');
      onDirty(false); refresh(); onClose(true);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const close = () => { if (!busy) onClose(); };
  return <Dialog open size="xl" className="annual-dialog" title={editor.kind === 'annual' ? 'Informar metas anuais' : 'Distribuir metas nos meses'} description={`Metas de ${year} · Selecione o subproduto e as agências.`} onClose={close} onSubmit={()=>void save()} footer={<><span className="annual-footer-count">{targets.length} {targets.length === 1 ? 'agência selecionada' : 'agências selecionadas'}</span><Button disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" variant="primary" icon={<Save size={16}/>} disabled={!valid} loading={busy}>{method === 'annual' ? 'Salvar totais anuais' : 'Salvar distribuição mensal'}</Button></>}>
    <ClosureNotice/>{error && <div className="form-error" role="alert">{error}</div>}
    <div className="annual-product-select"><Field label="Subproduto / tipo de meta"><Select aria-label="Subproduto para distribuir metas" disabled={busy || !!editor.goalId} value={productId} onChange={e=>{setProductId(Number(e.target.value));setError('');}}><SubproductOptions products={data.products.filter(p=>p.active)} suffix={p=>` · ${unitSymbol(p.unit)}`}/></Select></Field><p>{editor.kind === 'annual' ? 'Informe o total do ano de cada agência. Você pode distribuir agora ou definir a regra depois.' : 'Use o total anual cadastrado para calcular os valores dos 12 meses.'}</p></div>
    <div className="annual-agencies"><div className="annual-agency-heading"><Checkbox label="Selecionar agências disponíveis" disabled={busy || !visible.length} checked={visible.length > 0 && visible.every(r=>selected.includes(r.goal.id))} onChange={e=>{setSelected(e.target.checked ? [...new Set([...selected,...visible.map(r=>r.goal.id)])] : selected.filter(id=>!visible.some(r=>r.goal.id===id)));change();}}/><strong>Total do ano ({unitSymbol(product?.unit || 'BRL')})</strong></div>{visible.map(r=><div className="annual-agency-row" key={r.goal.id}><Checkbox checked={selected.includes(r.goal.id)} disabled={busy} label={<span><RegionalTag name={r.agency.regional_name}/>{r.agency.code} · {r.agency.name}<small>{r.goal.annual_pending?(isLocked(r)?'Total anual travado · aguardando distribuição':'Total anual aguardando distribuição'):isLocked(r)?'Meta carregada · total travado':'Sem meta carregada'}</small></span>} onChange={e=>{setSelected(e.target.checked?[...selected,r.goal.id]:selected.filter(id=>id!==r.goal.id));change();}}/>{editor.kind==='annual'?<span className="annual-total-field">{isLocked(r)&&(unlocked.includes(r.goal.id)?<Button size="sm" variant="ghost" icon={<Lock size={14}/>} disabled={busy} title="Voltar ao total travado" onClick={()=>relock(r)}>Travar</Button>:<Button size="sm" variant="ghost" icon={<LockOpen size={14}/>} disabled={busy} title="Total anual travado. Destrave para alterar; o motivo fica registrado no histórico." onClick={()=>unlock(r)}>Destravar</Button>)}<NumberInput aria-label={`Total anual de ${r.agency.name}`} required={selected.includes(r.goal.id)} disabled={busy || !selected.includes(r.goal.id) || (isLocked(r) && !unlocked.includes(r.goal.id))} min={-MAX_AMOUNT} max={MAX_AMOUNT} step="0.001" value={amounts[r.goal.id]} onValueChange={value=>{setAmounts({...amounts,[r.goal.id]:value});change();}}/></span>:<strong>{money(r.goal.annual_amount,r.goal.unit)}</strong>}</div>)}{!visible.length&&<p className="annual-empty">Não há metas deste subproduto para a seleção. Crie as metas do ano em Meta por Agência.</p>}</div>
    {unlocked.length>0&&<Field label="Motivo do destravamento" required><Input required minLength={5} maxLength={500} value={reason} disabled={busy} onChange={e=>{setReason(e.target.value);change();}} placeholder="Ex.: revisão de meta aprovada pela diretoria. Fica registrado no histórico."/></Field>}
    <Field label="Como deseja distribuir o total anual?"><Select aria-label="Forma de distribuição mensal" value={method} disabled={busy} onChange={e=>{setMethod(e.target.value as Method);change();}}>{editor.kind==='annual'&&<option value="annual">Definir depois · salvar somente o total anual</option>}<option value="seasonal">Sazonalidade do subproduto</option><option value="percent">Percentuais personalizados (%)</option><option value="equal">Divisão igual mês a mês</option></Select></Field>
    <div className="annual-method-note">{method==='annual'?<><CircleAlert size={18}/><span>Ao salvar somente o total, os meses abertos e os valores das carteiras selecionadas serão zerados. Os meses fechados não mudam e os percentuais das carteiras são mantidos para a próxima distribuição. Totais já informados ficam travados: só entram aqui os que você destravar.</span></>:method==='equal'?<><Equal size={18}/><span>O saldo anual, descontadas as metas dos meses fechados, será dividido igualmente entre os meses abertos. O total do ano será preservado.</span></>:method==='seasonal'?<><CalendarDays size={18}/><span>{profiles.loading?'Carregando sazonalidade…':profiles.error?'Não foi possível carregar a sazonalidade. Feche e tente novamente.':profile?.revision?`Serão usados os percentuais de ${product?.sub_product} cadastrados em Sazonalidade para ${year}.`:'Cadastre e salve os percentuais deste subproduto e ano na página Sazonalidade antes de distribuir.'}</span></>:<><Percent size={18}/><span>Informe a participação de cada mês. A soma precisa fechar em 100%.</span></>}</div>
    {(method==='percent'||method==='seasonal')&&<><div className="annual-weights">{shortMonths.map((m,i)=><Field key={m} label={m}><NumberInput aria-label={`Percentual de ${m}`} min={0} max={100} step="0.01" value={method==='seasonal'?(profile?.weights[i]??''):weights[i]} disabled={busy||method==='seasonal'||locked.has(i+1)} onValueChange={value=>{setWeights(w=>w.map((v,j)=>i===j?value:v));change();}}/></Field>)}</div><p className={validWeights?'valid-text':'invalid-text'}>Total: {number(bps.reduce((s,w)=>s+w,0)/100,2)}%</p></>}
    {method!=='annual'&&<div className="annual-preview"><h3>Prévia da distribuição mensal</h3><div className="table-scroll"><table className="app-table"><thead><tr><th>Agência</th><th className="numeric">Total do ano</th>{shortMonths.map(m=><th className="numeric" key={m}>{m}</th>)}</tr></thead><tbody>{targets.map(r=><tr key={r.goal.id}><th><RegionalTag name={r.agency.regional_name}/>{r.agency.code} · {r.agency.name}</th><td className="numeric"><strong>{previewValue(Number(amounts[r.goal.id])||0,r.goal.unit)}</strong></td>{shortMonths.map((m,i)=><td className="numeric" key={m}>{valid&&preview(r)?previewValue(preview(r)![i]/scale,r.goal.unit):'—'}</td>)}</tr>)}</tbody></table></div><p>Salvar recalcula os valores das carteiras.</p></div>}
  </Dialog>;
}

/** Na prévia a unidade é a mesma da linha toda: quantidade aparece só como número, sem o "un.". */
const previewValue = (value: number, unit: string) => unit === 'UN' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : money(value, unit);

type ImportEntry = { line: number; goal_id: number | null; revision: number; agency_id: number; product_id: number; agency_code: string; agency_name: string; regional_name: string; product_name: string; sub_product: string; unit: 'BRL'|'UN'|'PCT'; annual_amount: number; months: number[] | null; changed_months: number[]; month_changes: { month: number; before: number; after: number }[]; locked_change: boolean };
type ImportPreview = { year: number; entries: ImportEntry[]; errors: string[] };

export function AnnualImportDialog({ onClose, onDirty }: { onClose: (saved?: boolean) => void; onDirty: (dirty: boolean) => void }) {
  const { year, refresh } = useApp();
  const locked = useClosedMonths();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async (file?: File) => {
    setPreview(null); setReason(''); setConfirmed(false); setError(''); onDirty(false);
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(apiUrl(`/annual-goals/preview?year=${year}`), { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Não foi possível conferir a planilha.');
      setPreview(result); onDirty(true);
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const lockedChanges = preview?.entries.filter(e => e.locked_change) ?? [];
  const reasonOk = !lockedChanges.length || reason.trim().length >= 5;
  // Meses que a planilha troca por valores diferentes dos do sistema só entram depois de uma confirmação explícita.
  const replacedMonths = preview?.entries.reduce((n, e) => n + (e.month_changes?.length ?? 0), 0) ?? 0;
  const replacedGoals = preview?.entries.filter(e => e.month_changes?.length).length ?? 0;
  const confirmOk = !replacedMonths || confirmed;
  const save = async () => {
    if (!preview?.entries.length || preview.errors.length || busy || locked.size === 12 || !reasonOk || !confirmOk) return;
    setBusy(true); setError('');
    try {
      await api('/annual-goals', { year, method: 'annual', source: 'excel', ...(lockedChanges.length ? { unlock_reason: reason.trim() } : {}), entries: preview.entries.map(({ goal_id, revision, agency_id, product_id, annual_amount, months })=>({goal_id, revision, agency_id, product_id, annual_amount, months})) }, 'POST');
      onDirty(false); refresh(); onClose(true); toast.success('Totais anuais importados', 'Selecione um subproduto e clique em Distribuir metas para calcular os meses.');
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <Dialog open size="xl" className="annual-dialog" title="Importar totais anuais do Excel" description={`Ano selecionado: ${year}. Uma linha por agência, subproduto e ano.`} onClose={()=>{if(!busy)onClose();}} footer={<><span className="annual-footer-count">{preview?.entries.length || 0} totais conferidos</span><Button disabled={busy} onClick={()=>onClose()}>Cancelar</Button><Button variant="primary" icon={<Upload size={16}/>} loading={busy} disabled={!preview?.entries.length || !!preview.errors.length || locked.size===12 || !reasonOk || !confirmOk} onClick={()=>void save()}>Importar totais anuais</Button></>}>
    <ClosureNotice/><div className="annual-import-guide"><a href={apiUrl(`/annual-goals/template?year=${year}`)} className="bt-btn bt-btn-secondary"><ArrowDownToLine size={16}/>Baixar modelo Excel</a><p>Colunas: <strong>Agência, Produto, Subproduto, Ano e Total anual</strong>. Use o código da agência e o nome do subproduto; a coluna Produto é opcional e só é necessária quando o mesmo subproduto existe em mais de um produto. Deixe em branco as metas que não deseja importar; zero substitui a meta por zero. Preencha valores, sem fórmulas. O CSV gerado por “Exportar” também é aceito: a coluna Ano é opcional e vale o ano selecionado. Se a planilha trouxer Jan a Dez preenchidos, os meses também são importados (a soma não pode passar do total). Valores podem ser negativos e ter até 3 casas decimais; casas além da terceira são arredondadas.</p></div>
    <Field label="Arquivo Excel ou CSV (.xlsx, .csv, até 5 MB)"><input aria-label="Planilha de totais anuais" className="annual-file-input" type="file" accept=".xlsx,.csv"disabled={busy||locked.size===12} onChange={e=>void load(e.target.files?.[0])}/></Field>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {!!preview?.errors.length&&<div className="form-error" role="alert"><strong>Corrija a planilha e carregue novamente. Nenhum valor será importado enquanto houver erros.</strong><ul>{preview.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
    {!!lockedChanges.length&&!preview?.errors.length&&<div className="annual-method-note"><Lock size={18}/><span>{lockedChanges.length===1?'1 total já informado será alterado':`${lockedChanges.length} totais já informados serão alterados`}. Totais são travados: informe o motivo para destravá-los. Ele fica registrado no histórico de cada meta. Meses fechados não mudam.</span></div>}
    {!!lockedChanges.length&&!preview?.errors.length&&<Field label="Motivo do destravamento" required><Input required minLength={5} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Ex.: revisão de meta aprovada pela diretoria"/></Field>}
    {!!replacedMonths&&!preview?.errors.length&&<div className="annual-method-note"><CircleAlert size={18}/><span>A planilha traz {replacedMonths} {replacedMonths===1?'mês diferente':'meses diferentes'} do sistema em {replacedGoals} {replacedGoals===1?'meta':'metas'}. Veja abaixo o valor atual → o da planilha: ao importar, os valores do sistema são substituídos e cada mês fica registrado no histórico.</span></div>}
    {!!replacedMonths&&!preview?.errors.length&&<Checkbox checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} label={`Confirmo substituir ${replacedMonths} ${replacedMonths===1?'mês':'meses'} pelos valores da planilha`}/>}
    {preview&&<div className="annual-preview"><h3>Conferência dos totais anuais</h3><div className="table-scroll"><table className="app-table"><thead><tr><th>Linha</th><th>Agência</th><th>Produto</th><th>Subproduto</th><th>Ano</th><th className="numeric">Total do ano</th><th>Meses</th></tr></thead><tbody>{preview.entries.map(e=><tr key={e.line}><td>{e.line}</td><td><RegionalTag name={e.regional_name}/>{e.agency_code} · {e.agency_name}</td><td>{e.product_name}</td><td><strong>{e.sub_product}</strong></td><td>{preview.year}</td><td className="numeric">{money(e.annual_amount,e.unit)}</td><td>{!e.months ? 'Zera a distribuição' : e.changed_months.length ? <ul className="annual-month-diff">{(e.month_changes??[]).map(c=><li key={c.month}><strong>{shortMonths[c.month-1]}</strong> {money(c.before,e.unit)} → <b>{money(c.after,e.unit)}</b></li>)}</ul> : 'Sem alteração'}</td></tr>)}</tbody></table></div></div>}
    <div className="annual-method-note"><CircleAlert size={18}/><span>Linhas só com o total anual ficam com a distribuição a definir: os meses e valores das carteiras são zerados e os percentuais mantidos. Linhas com os 12 meses preenchidos gravam esses meses e preservam o resto. Depois, escolha o subproduto e distribua por sazonalidade, percentual ou divisão igual.</span></div>
  </Dialog>;
}
