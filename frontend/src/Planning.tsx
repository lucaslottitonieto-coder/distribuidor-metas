import { NumberInput } from './NumberInput';
import { applyRelativeInput, settleRelativeInput } from './numericInput';
import { segmentStyle } from './segmentColors';
import { MAX_AMOUNT, distributionStep, unitScale, unitSymbol } from './units';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Button, Card, Checkbox, Dialog, Field, IconButton, Segmented, Select, toast, useConfirm } from 'broto-ui';
import { CheckCheck, CircleAlert, Equal, Save, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { api, apportion, errorText, money, months, number, shortMonths, type Allocation, type Goal } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading } from './shared';
import { walletTone } from './matrixUtils';
import './planning-seasonality.css';
import { ClosureNotice, useClosedMonths } from './Closures';
import { apportionOpen, apportionWhole, monthlyBudget } from './math';

export function MonthlyDialog({goal,onClose,onSaved,onDirty,initialMonth,initialAmount,description}:{goal:Goal;onClose:()=>void;onSaved?:()=>void;onDirty?:(dirty:boolean)=>void;initialMonth?:number;initialAmount?:number;description?:string}){
  const {refresh}=useApp();
  const locked=useClosedMonths();
  const [values,setValues]=useState(goal.months.map(m=>String(m.month===initialMonth && initialAmount!==undefined ? initialAmount : m.amount)));
  const [expanded,setExpanded]=useState(!initialMonth);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const initial=useRef(values);
  // Valor que cada mês tinha ao receber o foco: "-49.200" ou "+49.200" digitado nele é um comando sobre esse valor.
  const bases=useRef<Record<number,number>>({});
  const baseOf=(i:number)=>bases.current[i]??Number(initial.current[i]);
  // Em metas negativas o "-" é um valor, não um comando.
  const command=(i:number)=>applyRelativeInput(baseOf(i),values[i],goal.annual_amount>=0);
  const effective=values.map((v,i)=>settleRelativeInput(baseOf(i),v,goal.annual_amount>=0));
  const budget=monthlyBudget(goal.annual_amount,effective.map(Number),unitScale(goal.unit));
  const valid=budget.valid && effective.every(v=>v.trim()!=='') && locked.size<12;
  const dirty=effective.some((value,i)=>value!==String(goal.months[i].amount));
  const resolve=(i:number)=>{
    const next=command(i);
    if(next===null){
      // Operador sobrando no fim ("1.000.800-") sai do campo.
      if(effective[i]!==values[i])setValues(v=>v.map((x,j)=>i===j?effective[i]:x));
      return;
    }
    if(next<0&&goal.annual_amount>=0){
      setError(`Esse ajuste deixaria ${months[i]} negativo (${money(next,goal.unit)}). Use um valor menor.`);
      setValues(v=>v.map((x,j)=>i===j?String(baseOf(i)):x));
      return;
    }
    bases.current[i]=next;
    setValues(v=>v.map((x,j)=>i===j?String(next):x));
    setError('');
  };
  useEffect(()=>{onDirty?.(dirty);},[dirty,onDirty]);
  const save=async()=>{
    if(!valid||busy)return;
    setBusy(true);setError('');
    try{
      if(initialMonth&&!expanded) await api(`/goals/${goal.id}/months/${initialMonth}`,{revision:goal.revision,amount:Number(effective[initialMonth-1])},'PUT');
      else await api(`/goals/${goal.id}`,{revision:goal.revision,mode:'monthly',amounts:effective.map(Number)},'PUT');
      onDirty?.(false);refresh();toast.success('Metas mensais salvas','O total anual planejado foi mantido.');(onSaved||onClose)();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  const field=(i:number)=>{
    const pending=command(i);
    const sum=/^(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/.exec(values[i]);
    const [left,op,right]=sum?[Number(sum[1]),sum[2],Number(sum[3])]:[baseOf(i),values[i].charAt(0),Math.abs(Number(values[i]))];
    const preview=pending===null?'':`Ajuste: ${money(left,goal.unit)} ${op==='-'?'−':'+'} ${money(right,goal.unit)} = ${money(pending,goal.unit)} · Enter aplica · `;
    return <Field key={i} label={`${months[i]} (${unitSymbol(goal.unit)})${locked.has(i+1)?' · Fechado':''}`} hint={`${preview}${goal.missing_months.includes(i+1)?'Revisão da origem · ':''}Valor atual: ${money(goal.months[i].amount,goal.unit)}`}>
      <NumberInput aria-label={`Meta de ${months[i]}`} autoFocus={initialMonth===i+1} disabled={busy||locked.has(i+1)} min={-MAX_AMOUNT} max={MAX_AMOUNT} step="0.001" required relative value={values[i]}
        onFocus={()=>{bases.current[i]=Number(effective[i]);}} onBlur={()=>resolve(i)} onKeyDown={e=>{if(e.key==='Enter'&&command(i)!==null){e.preventDefault();resolve(i);}}}
        onValueChange={value=>{setValues(v=>v.map((x,j)=>i===j?value:x));setError('');}}/>
    </Field>;
  };
  return <Dialog open onClose={()=>!busy&&onClose()} title={`${initialMonth?months[initialMonth-1]:'Metas mensais'} · ${goal.sub_product}`} description={description||'Ajuste os meses respeitando o total planejado para o ano.'} size={expanded?'lg':undefined} onSubmit={()=>void save()} footer={<><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" variant="primary" icon={<Save size={16}/>} loading={busy} disabled={!valid}>{initialMonth?'Salvar meta':'Salvar metas'}</Button></>}>
    <ClosureNotice/>{error&&<div className="form-error" role="alert">{error}</div>}
    {goal.missing_months.length>0&&<div className="source-note"><CircleAlert size={16}/><span>Há meses pendentes de revisão da origem. Informe os valores corretos ou confirme zero quando não houver meta.</span></div>}
    {initialMonth&&field(initialMonth-1)}
    <div className="monthly-budget" aria-live="polite">
      <div><span>Meta anual planejada</span><strong>{money(goal.annual_amount,goal.unit)}</strong></div>
      <div><span>Soma dos meses</span><strong className={budget.balance<0?'invalid-text':undefined}>{money(budget.total,goal.unit)}</strong></div>
      <div><span>{budget.balance<0?'Valor a compensar':'Saldo disponível'}</span><strong className={budget.balance<0?'invalid-text':'valid-text'}>{money(Math.abs(budget.balance),goal.unit)}</strong></div>
    </div>
    {budget.balance<0&&<div className="form-error" role="alert">Reduza {money(-budget.balance,goal.unit)} em outros meses para salvar. A soma dos meses não pode ultrapassar o planejado do ano.</div>}
    {initialMonth&&!expanded&&<Button disabled={busy} onClick={()=>setExpanded(true)}>Ajustar outros meses</Button>}
    {expanded&&<><p className="monthly-adjust-note">{initialMonth?'Escolha de quais meses retirar o valor para compensar o ajuste. Meses fechados não podem ser alterados.':'Os ajustes serão salvos juntos. A soma dos meses pode ser menor ou igual ao total anual planejado.'}{goal.annual_amount>=0&&' Dica: no fim do valor do mês digite -49.200 (ou +49.200), como 1.000.800-49.200, e tecle Enter para o sistema fazer a conta.'}</p><div className="monthly-fields">{months.map((_,i)=>initialMonth===i+1?null:field(i))}</div></>}
    <div className="help-note"><ShieldCheck size={17}/> O total anual permanece fixo. Os valores das carteiras são recalculados mantendo as participações.</div>
  </Dialog>;
}

export function AllocationEditor({goal,onDirty,onSaved,initialMonth=1,focusPortfolioId,footerTarget}:{goal:Goal;onDirty:(v:boolean)=>void;onSaved?:()=>void;initialMonth?:number;focusPortfolioId?:number;footerTarget?:HTMLElement|null}){
  const {tick,refresh}=useApp();const locked=useClosedMonths();const [month,setMonth]=useState(initialMonth);const [mode,setMode]=useState<'percent'|'amount'>('percent');const [values,setValues]=useState<string[]>([]);const [all,setAll]=useState(false);const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const remote=useRemote<Allocation>(`/goals/${goal.id}/allocations?month=${month}`,tick);const confirm=useConfirm();
  useEffect(()=>{if(remote.data&&!remote.loading){setValues(remote.data.entries.map(e=>String(mode==='percent'?e.percent:e.amount)));setDirty(false);onDirty(false);setError('');}},[remote.data,remote.loading]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const update=(newValues:string[])=>{setValues(newValues);setDirty(true);onDirty(true);setError('');};
  const changeMonth=async(m:number)=>{if(dirty){const r=await confirm({title:'Descartar alterações deste mês?',description:'Salve a distribuição antes de trocar o mês para manter seus ajustes.',confirmLabel:'Descartar e continuar',tone:'danger'});if(!r.confirmed)return;}setDirty(false);onDirty(false);setMonth(m);};
  if(remote.loading)return <Loading/>;if(remote.error)return <Failure error={remote.error} retry={refresh}/>;if(!remote.data)return null;
  const a=remote.data;const scale=unitScale(a.unit || 'BRL');const step=distributionStep(a.unit || 'BRL');const totalMinor=Math.round(a.total*scale);
  const nums=values.map(v=>Number(v||0));const exact=nums.every(v=>Number.isFinite(v)&&(mode==='amount'?Math.abs(v*scale-Math.round(v*scale))<.00001:v>=0&&Math.abs(v*100-Math.round(v*100))<.00001))&&!(mode==='amount'&&nums.some(v=>Math.round(v*scale)*totalMinor<0));
  const allocated=nums.reduce((s,v)=>s+Math.round(v*(mode==='percent'?100:scale)),0);const target=mode==='percent'?10000:totalMinor;const valid=exact&&allocated===target&&a.portfolios.length>0&&nums.length===a.portfolios.length&&!(mode==='amount'&&target===0);const percent=mode==='percent'?allocated/100:target?allocated/target*100:0;
  const weights=nums.map(v=>Math.round(v*100));const parts=mode==='amount'?nums.map(v=>Math.round(v*scale)):valid?apportionWhole(totalMinor,weights,step):nums.map(v=>Math.round(totalMinor*v/100));
  const deficit=(target-allocated)/(mode==='percent'?100:scale);
  const suggest=()=>{const bps=apportion(10000,a.portfolios.map(p=>p.suggested_percent>0?Math.round(p.suggested_percent*100):0));if(bps.every(v=>!v)){toast.error('Informe participações sugeridas nas carteiras.');return;}update(mode==='percent'?bps.map(v=>String(v/100)):apportionWhole(totalMinor,bps,step).map(v=>String(v/scale)));};
  const equal=()=>{const bps=apportion(10000,a.portfolios.map(()=>1));update(mode==='percent'?bps.map(v=>String(v/100)):apportionWhole(totalMinor,bps,step).map(v=>String(v/scale)));};
  const switchMode=(next:'percent'|'amount')=>{if(next===mode)return;if(next==='percent'&&totalMinor===0){setMode(next);update(a.entries.map(e=>String(e.percent)));return;}if(!valid){toast.warning('Feche a distribuição atual antes de trocar o modo.');return;}const nextValues=next==='amount'?parts.map(v=>String(v/scale)):apportion(10000,parts.map(Math.abs)).map(v=>String(v/100));setMode(next);if(next==='amount')setAll(false);update(nextValues);};
  const applyAll=mode==='percent'&&all;
  const save=async()=>{setBusy(true);setError('');try{const result=await api<Allocation>(`/goals/${goal.id}/allocations`,{revision:a.revision,month,mode,entries:a.entries.map((e,i)=>({portfolio_id:e.portfolio_id,value:nums[i]})),apply_to_all:applyAll},'PUT');setValues(result.entries.map(e=>String(mode==='percent'?e.percent:e.amount)));setDirty(false);onDirty(false);toast.success(applyAll?'Distribuição aplicada aos meses abertos':'Distribuição salva');refresh();onSaved?.();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const saveButton=<Button block={!footerTarget} variant="primary" loading={busy} disabled={!valid||a.closed} icon={<Save size={16}/>} onClick={()=>void save()}>Salvar distribuição</Button>;
  return <div className="allocation-layout"><div className="allocation-main"><Card title={`Distribuição · ${goal.sub_product}`} subtitle="Ajuste a participação de cada carteira. O total precisa fechar em 100%." actions={<Select aria-label="Mês da distribuição" value={month} onChange={e=>void changeMonth(Number(e.target.value))}>{months.map((m,i)=><option value={i+1} key={m}>{m}{locked.has(i+1)?' · Fechado':''}</option>)}</Select>} flush><div className="allocation-workspace"><nav className="month-status-strip" aria-label="Meses da distribuição">{shortMonths.map((label,i)=><button type="button" key={i} aria-label={months[i]} aria-current={month===i+1?'date':undefined} className={month===i+1?'active':''} onClick={()=>void changeMonth(i+1)}>{label}</button>)}</nav><fieldset className="allocation-content allocation-edit-fields" disabled={a.closed}><ClosureNotice/><div className="allocation-toolbar"><Segmented aria-label="Modo de distribuição" value={mode} onChange={switchMode} options={[{value:'percent',label:'Por percentual (%)'},{value:'amount',label:a.unit==='BRL'?'Por valor (R$)':a.unit==='PCT'?'Por meta (%)':'Por quantidade',disabled:totalMinor===0}]}/><div><Button size="sm" icon={<Sparkles size={14}/>} onClick={suggest}>Aplicar sugestão</Button><IconButton size="sm" label="Dividir igualmente" icon={<Equal size={17}/>} onClick={equal}/></div></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="table-scroll"><table className="app-table allocation-table"><thead><tr><th>Carteira / responsável</th><th>Segmento</th><th className="numeric">Sugerido</th><th className="numeric">{mode==='percent'?'Atribuído (%)':a.unit==='BRL'?'Atribuído (R$)':a.unit==='PCT'?'Meta (%)':'Quantidade'}</th><th className="numeric">{mode==='percent'?'Meta da carteira':'Participação'}</th></tr></thead><tbody>{a.portfolios.map((p,i)=><tr key={p.id}><td><div className="entity-cell"><span className="wallet-card" data-tone={walletTone(p.code)} aria-hidden="true">{p.code}</span><span><strong>{p.name}</strong><small>{p.manager||`Carteira ${p.code}`}</small></span></div></td><td><span className="segment-badge" style={segmentStyle(p.color)}>{p.segment_code}</span></td><td className="numeric muted">{number(p.suggested_percent,2)}%</td><td><div className="allocation-input"><NumberInput aria-label={`${mode==='percent'?'Percentual':'Valor'} de ${p.name}`} autoFocus={p.id===focusPortfolioId} min={mode==='percent'?0:-MAX_AMOUNT} max={mode==='percent'?100:MAX_AMOUNT} step={mode==='amount'?'0.001':'0.01'} value={values[i]??''} onValueChange={value=>update(values.map((v,j)=>i===j?value:v))}/>{mode==='percent'&&<span>%</span>}</div></td><td className="numeric"><strong>{mode==='percent'?money((parts[i]||0)/scale,a.unit):`${number(totalMinor?(parts[i]||0)/totalMinor*100:0,2)}%`}</strong></td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Total distribuído</td><td className={`numeric ${valid?'valid-text':'invalid-text'}`}>{mode==='percent'?`${number(percent,2)}%`:money(allocated/scale,a.unit)}</td><td className="numeric">{money(parts.reduce((s,v)=>s+v,0)/scale,a.unit)}</td></tr></tfoot></table></div>{!a.portfolios.length&&<Empty title="Esta agência precisa de carteiras ativas"/>}<div className="allocation-footer"><Checkbox checked={applyAll} disabled={mode!=='percent'} onChange={e=>setAll(e.target.checked)} label="Aplicar os mesmos percentuais aos meses abertos"/><small>{mode==='percent'?'Os valores serão recalculados conforme a meta de cada mês.':'Disponível apenas na distribuição por percentual.'}</small></div></fieldset></div></Card></div>
      <aside className="allocation-summary"><span className="summary-icon"><Target size={24}/></span><span className="eyebrow">RESUMO DA DISTRIBUIÇÃO</span><h3>{months[month-1]}</h3><span className="summary-product">{goal.sub_product}</span><div className="summary-total"><span>Meta da agência</span><strong>{money(a.total,a.unit)}</strong></div><div className={`allocation-gauge ${valid?'valid':'invalid'}`} style={{'--progress':`${Math.min(Math.max(percent,0),100)*3.6}deg`} as React.CSSProperties}><div><strong>{number(percent,percent%1?2:0)}<small>%</small></strong><span>atribuídos</span></div></div><div className={`balance-message ${valid?'balanced':'unbalanced'}`}>{valid?<CheckCheck size={18}/>:<CircleAlert size={18}/>}<div><strong>{valid?'Tudo certo com os valores':deficit>=0?'Ainda falta distribuir':'Distribuição acima da meta'}</strong><span>{valid?'O total fecha em 100%.':mode==='percent'?`${number(Math.abs(deficit),2)}% ${deficit>=0?'disponíveis para atribuir':'acima de 100%'}`:`Diferença de ${money(Math.abs(deficit),a.unit)}`}</span></div></div><div className="summary-divider"/><div className="summary-line"><span>Carteiras ativas</span><strong>{a.portfolios.length}</strong></div><div className="summary-line"><span>Situação do mês</span><Badge tone={dirty?'pending':'success'}>{a.closed?'Fechado':dirty?'Não salvo':'Salvo'}</Badge></div>{footerTarget?createPortal(saveButton,footerTarget):saveButton}<p className="summary-foot"><ShieldCheck size={13}/> O sistema só salva quando toda a meta está atribuída.</p></aside>
    </div>;
}

export function Seasonality({goal,onDirty}:{goal:Goal;onDirty:(v:boolean)=>void}){
  const {refresh}=useApp();const locked=useClosedMonths();const scale=unitScale(goal.unit || 'BRL');const total=Math.round(goal.annual_amount*scale);const initial=goal.seasonal_weights?.length===12?goal.seasonal_weights.map(w=>Math.round(w*100)):total?apportion(10000,goal.months.map(m=>Math.round(m.amount*scale))):apportion(10000,Array(12).fill(1));
  const [annual,setAnnual]=useState(String(goal.annual_amount));const [weights,setWeights]=useState(initial.map(v=>String(v/100)));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [dirty,setDirty]=useState(false);
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  const bps=weights.map(v=>Math.round(Number(v||0)*100));const sum=bps.reduce((a,b)=>a+b,0);const valid=sum===10000&&weights.every(v=>Number(v)>=0&&Number(v)<=100&&Math.abs(Number(v)*100-Math.round(Number(v)*100))<.00001)&&Number.isFinite(Number(annual));const preview=valid?apportionOpen(Math.round(Number(annual)*scale),bps,goal.months.map(m=>Math.round(m.amount*scale)),locked,distributionStep(goal.unit)):null;const amounts=preview||goal.months.map(m=>Math.round(m.amount*scale));
  const save=async()=>{setBusy(true);setError('');try{await api(`/goals/${goal.id}`,{revision:goal.revision,mode:'seasonal',annual_amount:Number(annual),weights:weights.map(Number)},'PUT');refresh();setDirty(false);toast.success('Sazonalidade aplicada','Os valores das carteiras foram recalculados.');}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  const uniform=()=>{setWeights((apportionOpen(10000,Array(12).fill(1),initial,locked)||initial).map(v=>String(v/100)));setDirty(true);};
  return <Card className="seasonality-editor" title={`Sazonalidade · ${goal.sub_product}`} subtitle="Ajuste o peso de cada mês e deixe o sistema calcular as metas." actions={<Button size="sm" icon={<Equal size={15}/>} disabled={locked.size===12} onClick={uniform}>Dividir igualmente</Button>}><ClosureNotice/><div className="seasonality-top"><Field label={`Meta anual (${unitSymbol(goal.unit)})`}><NumberInput aria-label="Meta anual para sazonalidade" min={-MAX_AMOUNT} max={MAX_AMOUNT} step="0.001" value={annual} onValueChange={value=>{setAnnual(value);setDirty(true);}}/></Field><div className="seasonality-total"><span>Soma dos pesos mensais</span><strong className={valid?'valid-text':'invalid-text'}>{number(sum/100,2)}% {valid?<CheckCheck size={19}/>:<CircleAlert size={19}/>}</strong><small>Os 12 meses precisam somar 100%.</small></div></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="season-months">{months.map((m,i)=><div className="season-month" key={m}><div><span>{String(i+1).padStart(2,'0')}</span><strong>{m}{locked.has(i+1)?' · Fechado':''}</strong></div><div className="season-mini-bar"><div style={{width:`${Math.min(Math.max(Number(weights[i])/25*100,0),100)}%`}}/></div><div className="weight-input"><NumberInput aria-label={`Peso de ${m}`} disabled={locked.has(i+1)} min={0} max={100} step="0.01" value={weights[i]} onValueChange={value=>{setWeights(w=>w.map((v,j)=>i===j?value:v));setDirty(true);}}/><span>%</span></div><small>{money(amounts[i]/scale,goal.unit)}</small></div>)}</div><div className="seasonality-footer"><span><CircleAlert size={16}/> Aplicar sazonalidade recalcula as metas mensais e os valores das carteiras.</span><Button variant="primary" icon={<Save size={16}/>} loading={busy} disabled={!valid||!dirty||!preview} onClick={()=>void save()}>Aplicar sazonalidade</Button></div></Card>;
}
