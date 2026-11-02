import { NumberInput } from './NumberInput';
import { useState } from 'react';
import { Button, Dialog, Field, FormGrid, Input, Select, Switch, toast } from 'broto-ui';
import { Building2, Check, Layers3, Sprout } from 'lucide-react';
import { api, errorText, type Agency, type Portfolio, type Product, type Regional, type Segment } from './api';
import { useApp } from './context';
import { AgencyOptions } from './shared';
import { segmentPalette } from './segmentColors';

function FormError({ error }: { error: string }) { return error ? <div className="form-error" role="alert">{error}</div> : null; }
function Footer({ busy, onClose, label = 'Salvar cadastro' }: { busy: boolean; onClose: () => void; label?: string }) { return <><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" variant="primary" loading={busy} icon={<Check size={16} />}>{label}</Button></>; }
export function AgencyDialog({ agency, regionalId, onClose, onCreated }: { agency?: Agency; regionalId?: number; onClose: () => void; onCreated?: (id: number) => void }) {
  const { year, refresh, data } = useApp();
  // Regionais ativas; a atual da agência continua na lista mesmo se tiver sido inativada.
  const regionals = data.regionals.filter(r => r.active || r.id === agency?.regional_id);
  const [form, setForm] = useState({ code: agency?.code || '', name: agency?.name || '', regional_id: agency?.regional_id || regionalId || regionals[0]?.id || 0, city: agency?.city || '', state: agency?.state || 'PR', manager: agency?.manager || '', active: agency ? !!agency.active : true, year });
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const change = (key: string, value: unknown) => setForm(f=>({...f,[key]:value}));
  const save = async () => { setBusy(true);setError('');try { const result = await api<{agency: Agency}>(`/agencies${agency ? `/${agency.id}` : ''}`,form,agency ? 'PUT' : 'POST'); refresh();toast.success(agency ? 'Agência atualizada' : 'Agência criada com seus produtos e carteiras');onClose();if (!agency && onCreated) onCreated(result.agency.id); } catch(e) {setError(errorText(e));} finally {setBusy(false);} };
  return <Dialog open onClose={()=>!busy&&onClose()} title={agency ? 'Editar agência' : 'Uma nova agência, pronta para receber metas'} description={agency ? 'Mantenha os dados e o responsável da agência atualizados.' : `Os produtos e as carteiras padrão serão criados para ${year}.`} size="lg" onSubmit={save} footer={<Footer busy={busy} onClose={onClose} label={agency?'Salvar alterações':'Criar agência'} />}><FormError error={error} /><FormGrid><Field label="Regional" required span={2} hint={regionals.length ? 'Cada agência pertence a uma regional.' : 'Cadastre uma regional em Parametrizações antes de salvar a agência.'}><Select required value={form.regional_id} onChange={e=>change('regional_id',Number(e.target.value))}>{regionals.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field><Field label="Código da agência" required><Input required pattern="[0-9A-Za-z-]+" maxLength={12} value={form.code} onChange={e=>change('code',e.target.value)} placeholder="Ex.: 073708" /></Field><Field label="Nome da agência" required><Input required minLength={2} maxLength={100} value={form.name} onChange={e=>change('name',e.target.value)} placeholder="Ex.: Pato Branco Sul" /></Field><Field label="Cidade" required><Input required minLength={2} value={form.city} onChange={e=>change('city',e.target.value)} placeholder="Nome da cidade" /></Field><Field label="Estado" required><Select value={form.state} onChange={e=>change('state',e.target.value)}>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf=><option key={uf}>{uf}</option>)}</Select></Field><Field label="Responsável" span={2}><Input maxLength={100} value={form.manager} onChange={e=>change('manager',e.target.value)} placeholder="Nome do responsável pela agência" /></Field>{agency&&<Switch label="Agência ativa" checked={form.active} onCheckedChange={v=>change('active',v)} />}</FormGrid>{!agency&&<div className="auto-setup"><span><Sprout size={24} /></span><div><strong>A configuração inicial já vem com ela.</strong><p>{data.products.filter(p=>p.active).length} produtos de metas, {data.templates.length} carteiras padrão e os 12 meses do ano.</p></div></div>}</Dialog>;
}

export function RegionalDialog({ regional, onClose }: { regional?: Regional; onClose: () => void }) {
  const { refresh } = useApp();
  const [form, setForm] = useState({ name: regional?.name || '', active: regional ? !!regional.active : true });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => { setBusy(true); setError(''); try { await api(`/regionals${regional ? `/${regional.id}` : ''}`, form, regional ? 'PUT' : 'POST'); refresh(); toast.success('Regional salva'); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return <Dialog open onClose={() => !busy && onClose()} title={regional ? 'Editar regional' : 'Nova regional'} description="A regional agrupa agências: ela aparece acima da agência e é um filtro em todo o sistema." onSubmit={save} footer={<Footer busy={busy} onClose={onClose} />}><FormError error={error} /><FormGrid><Field label="Nome da regional" required span={2}><Input required autoFocus minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Regional Sudoeste" /></Field>{regional && <Switch label="Regional ativa" checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />}</FormGrid></Dialog>;
}

export function ProductDialog({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { refresh, data } = useApp();
  const [form,setForm] = useState({ name:product?.name||'', sub_product:product?.sub_product||'', unit:product?.unit||'BRL', active:product?!!product.active:true });
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const save=async()=>{setBusy(true);setError('');try {await api(`/products${product?`/${product.id}`:''}`,form,product?'PUT':'POST');refresh();toast.success(product?'Subproduto atualizado':'Subproduto criado nas agências ativas');onClose();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  return <Dialog open onClose={()=>!busy&&onClose()} title={product?'Editar subproduto de meta':'Novo subproduto de meta'} description="A meta e a distribuição por carteira acontecem em cada subproduto. Os ativos ficam disponíveis automaticamente nas metas das agências." onSubmit={save} footer={<Footer busy={busy} onClose={onClose} />}><FormError error={error} /><FormGrid><Field label="Produto" required hint="Escolha um produto existente ou digite um novo."><Input required minLength={2} maxLength={100} list="product-names" autoComplete="off" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Crédito" /></Field><datalist id="product-names">{[...new Set(data.products.map(p=>p.name))].map(n=><option key={n} value={n}/>)}</datalist><Field label="Subproduto" required hint="Recebe a meta e é distribuído nas carteiras."><Input required minLength={2} maxLength={100} value={form.sub_product} onChange={e=>setForm({...form,sub_product:e.target.value})} placeholder="Ex.: Crédito rural" /></Field><Field label="Unidade de medida"><Select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value as Product['unit']})}><option value="BRL">Reais (R$)</option><option value="UN">Quantidade</option><option value="PCT">Percentual (%)</option></Select></Field><Switch label="Subproduto ativo" checked={form.active} onCheckedChange={v=>setForm({...form,active:v})} /></FormGrid></Dialog>;
}

export function SegmentDialog({ segment, onClose }: { segment?: Segment; onClose: () => void }) {
  const { refresh }=useApp();
  const [form,setForm]=useState({ code:segment?.code||'', name:segment?.name||'', color:segment?.color||segmentPalette[0].color, active:segment?!!segment.active:true });
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const save=async()=>{setBusy(true);setError('');try{await api(`/segments${segment?`/${segment.id}`:''}`,form,segment?'PUT':'POST');refresh();toast.success('Segmento salvo');onClose();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  return <Dialog open onClose={()=>!busy&&onClose()} title={segment?'Editar segmento':'Novo segmento'} description="Organize as carteiras de acordo com o perfil de relacionamento." onSubmit={save} footer={<Footer busy={busy} onClose={onClose} />}>
    <FormError error={error}/><FormGrid>
      <Field label="Sigla" required><Input required pattern="[A-Z0-9]+" maxLength={10} value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="Ex.: PF"/></Field>
      <Field label="Nome do segmento" required><Input required minLength={2} maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Pessoa física"/></Field>
      <Field label="Cor de identificação" span={2}>
        <div className="segment-color-palette" role="group" aria-label="Paleta de cores do segmento">
          {segmentPalette.map(option=><button key={option.color} type="button" className="segment-color-option" aria-label={`${option.name} ${option.color}`} aria-pressed={form.color.toLowerCase()===option.color.toLowerCase()} title={`${option.name} · ${option.color}`} style={{background:option.color,color:option.ink}} onClick={()=>setForm({...form,color:option.color})} disabled={busy}>
            {form.color.toLowerCase()===option.color.toLowerCase()&&<Check size={18} strokeWidth={3} style={{color:option.color===option.ink?'#fff':option.ink}}/>}
          </button>)}
        </div>
        <div className="segment-custom-color"><Input type="color" aria-label="Cor personalizada do segmento" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/><span>{form.color.toUpperCase()}</span><small>Ou escolha uma cor personalizada</small></div>
      </Field>
      <Switch label="Segmento ativo" checked={form.active} onCheckedChange={v=>setForm({...form,active:v})}/>
    </FormGrid>
  </Dialog>;
}

export function PortfolioDialog({ portfolio, agencyId, onClose }: { portfolio?: Portfolio; agencyId?: number; onClose: () => void }) {
  const { data,refresh }=useApp();
  const [selected,setSelected]=useState(portfolio?.agency_id||agencyId||data.agencies.find(a=>a.active)?.id||0);
  const [form,setForm]=useState({code:portfolio?.code||'',name:portfolio?.name||'',segment_id:portfolio?.segment_id||data.segments.find(s=>s.active)?.id||0,manager:portfolio?.manager||'',suggested_percent:portfolio?.suggested_percent||0,active:portfolio?!!portfolio.active:true});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const save=async()=>{setBusy(true);setError('');try{await api(portfolio?`/portfolios/${portfolio.id}`:`/agencies/${selected}/portfolios`,form,portfolio?'PUT':'POST');refresh();toast.success('Carteira salva');onClose();}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  return <Dialog open onClose={()=>!busy&&onClose()} title={portfolio?'Editar carteira':'Nova carteira'} description="A carteira passa a integrar a distribuição de todos os produtos da agência." size="lg" onSubmit={save} footer={<Footer busy={busy} onClose={onClose} />}><FormError error={error} /><FormGrid>{!portfolio&&<Field label="Agência" span={2}><Select value={selected} onChange={e=>setSelected(Number(e.target.value))}><AgencyOptions agencies={data.agencies.filter(a=>a.active)}/></Select></Field>}<Field label="Código da carteira" required><Input required maxLength={20} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Ex.: 7" /></Field><Field label="Nome da carteira" required><Input required minLength={2} maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Pessoa física III" /></Field><Field label="Segmento"><Select value={form.segment_id} onChange={e=>setForm({...form,segment_id:Number(e.target.value)})}>{data.segments.filter(s=>s.active||s.id===form.segment_id).map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select></Field><Field label="Participação sugerida (%)" hint="Usada ao aplicar a sugestão de distribuição."><NumberInput min={0} max={100} step="0.01" required value={form.suggested_percent} onValueChange={value=>setForm({...form,suggested_percent:Number(value)})} /></Field><Field label="Responsável" span={2}><Input maxLength={100} value={form.manager} onChange={e=>setForm({...form,manager:e.target.value})} placeholder="Nome do responsável pela carteira" /></Field>{portfolio&&<Switch label="Carteira ativa" checked={form.active} onCheckedChange={v=>setForm({...form,active:v})} />}</FormGrid><div className="help-note"><Layers3 size={18} /> Ao adicionar uma carteira, revise as distribuições existentes. A participação inicial é zero.</div></Dialog>;
}
