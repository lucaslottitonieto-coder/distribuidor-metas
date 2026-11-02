import { NumberInput } from './NumberInput';
import { distributionStep, unitScale } from './units';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Checkbox, Dialog, Field, Input, Select, toast } from 'broto-ui';
import { ArrowRight, CheckCheck, ChevronRight, CircleAlert, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { api, apportion, errorText, money, months, number, shortMonths, type Agency, type MatrixRow, type Product, type PlanningMatrix, type SeasonalityData, type SeasonalityProfile } from './api';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading, PageHead } from './shared';
import { AgencyOptions, RegionalSelect, RegionalTag, agenciesOf, useRegionalAgency } from './shared';
import './seasonality.css';
import { ClosureNotice, useClosedMonths } from './Closures';
import { apportionOpen } from './math';
import { SeasonalityPresets } from './SeasonalityPresets';
import { seasonalityDraftMatches } from './seasonalityModels';

const colors = ['#197844', '#20b8e8', '#3da30d', '#e75b15', '#9973b1', '#ffcd00'];
type SaveAction = 'save' | 'apply';
type SaveReview = { product: Product; year: number; revision: number; weights: number[]; agencies: Agency[]; targets: MatrixRow[] };

export default function SeasonalityPage() {
  const { year, tick, refresh } = useApp();
  const profiles = useRemote<SeasonalityData>(`/seasonality?year=${year}`, tick);
  const planning = useRemote<PlanningMatrix>(`/goals?year=${year}`, tick);
  if (!profiles.data || !planning.data) {
    const error = profiles.error || planning.error;
    return error ? <Failure error={error} retry={refresh} /> : <Loading />;
  }
  return <SeasonalityWorkspace profiles={profiles.data.profiles} planning={planning.data} loading={profiles.loading || planning.loading} error={profiles.error || planning.error} />;
}

function SeasonalityWorkspace({ profiles, planning, loading, error }: { profiles: SeasonalityProfile[]; planning: PlanningMatrix; loading: boolean; error: unknown }) {
  const { data, year, refresh, navigate, setUnsaved } = useApp();
  const locked = useClosedMonths();
  const products = data.products.filter(p => p.active);
  const [productId, setProductId] = useState(products[0]?.id || 0);
  const { regional, agency: agencyId, setRegional, setAgency: setAgencyId } = useRegionalAgency();
  const [drafts, setDrafts] = useState<Record<number, string[]>>({});
  const [saved, setSaved] = useState<Record<number, SeasonalityProfile>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState<SaveReview | null>(null);
  const [action, setAction] = useState<SaveAction>('save');
  const [selectedGoals, setSelectedGoals] = useState<number[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const product = products.find(p => p.id === productId);
  const profile = saved[productId] || profiles.find(p => p.product_id === productId);
  const weights = drafts[productId] || profile?.weights.map(String) || [];
  const dirty = !!drafts[productId] && !seasonalityDraftMatches(drafts[productId], profile?.weights);
  const nums = weights.map(v => Number(v));
  const bps = nums.map(v => Math.round(v * 100));
  const sum = bps.reduce((a, b) => a + b, 0);
  const validFields = weights.length === 12 && weights.every((v, i) => v.trim() !== '' && Number.isFinite(nums[i]) && nums[i] >= 0 && nums[i] <= 100 && Math.abs(nums[i] * 100 - bps[i]) < .00001);
  const valid = validFields && sum === 10000;
  const rows = planning.rows.filter(r => r.goal.product_id === productId && (!regional || r.agency.regional_id === regional) && (!agencyId || r.agency.id === agencyId));
  const productRows = planning.rows.filter(r => r.goal.product_id === productId);
  const scale = unitScale(product?.unit || 'BRL');
  const total = rows.reduce((s, r) => s + Math.round(r.goal.annual_amount * scale), 0);
  const peak = Math.max(...nums.filter(Number.isFinite), 1);
  const totalDirty = Object.entries(drafts).filter(([id, values]) =>
    !seasonalityDraftMatches(values, (saved[Number(id)] || profiles.find(p => p.product_id === Number(id)))?.weights),
  ).length;
  const availableTargets = review?.targets || [];
  const selectedTargets = availableTargets.filter(r => selectedGoals.includes(r.goal.id));
  const confirmationWord = action === 'apply' ? 'APLICAR' : 'SALVAR';
  const canConfirm = !!review && confirmation.trim() === confirmationWord && (action === 'save' || selectedTargets.length > 0);

  useEffect(() => { setUnsaved(totalDirty > 0); }, [totalDirty, setUnsaved]);
  useEffect(() => () => setUnsaved(false), [setUnsaved]);
  useEffect(() => {
    setSaved(current => Object.fromEntries(Object.entries(current).filter(([id, local]) => (profiles.find(p => p.product_id === Number(id))?.revision ?? 0) < local.revision)));
  }, [profiles]);

  const update = (values: string[]) => {
    if (review || busy || applying) return;
    setDrafts(d => ({ ...d, [productId]: values }));
    setFormError('');
  };
  const reset = () => {
    setDrafts(d => { const next = { ...d }; delete next[productId]; return next; });
    setFormError('');
  };
  const openSave = (nextAction: SaveAction) => {
    if (!valid || !profile || !product || busy || loading || error) return;
    setReview({ product, year, revision: profile.revision, weights: [...nums], agencies: data.agencies.filter(a => a.active), targets: productRows });
    setAction(nextAction);
    setSelectedGoals(productRows.map(r => r.goal.id));
    setConfirmation(''); setFormError('');
  };
  const changeAction = (nextAction: SaveAction) => {
    setAction(nextAction); setConfirmation(''); setFormError('');
  };
  const selectGoals = (ids: number[]) => {
    setSelectedGoals(ids); setConfirmation(''); setFormError('');
  };
  const confirmSave = async () => {
    if (!review || !canConfirm || busy || loading || error) return;
    setBusy(true); setApplying(action === 'apply'); setFormError('');
    try {
      const result = await api<{ profile: SeasonalityProfile; applied: number }>(`/seasonality/${review.product.id}/${review.year}/save`, {
        revision: review.revision, weights: review.weights, action, confirmation: confirmation.trim(),
        goals: action === 'apply' ? selectedTargets.map(r => ({ goal_id: r.goal.id, revision: r.goal.revision })) : [],
      }, 'POST');
      setSaved(s => ({ ...s, [review.product.id]: result.profile }));
      // Mantém nos campos a resposta confirmada, inclusive durante o refresh dos perfis.
      // Apagar o rascunho aqui faria a tela depender novamente do perfil anterior.
      setDrafts(d => ({ ...d, [review.product.id]: result.profile.weights.map(String) }));
      setReview(null); setConfirmation(''); refresh();
      if (action === 'apply') toast.success('Percentuais salvos e aplicados', `${result.applied} ${result.applied === 1 ? 'agência atualizada' : 'agências atualizadas'}. Revise as distribuições por carteira.`);
      else toast.success('Percentuais salvos', `O padrão de ${review.product.sub_product} para ${review.year} foi salvo. As metas das agências foram mantidas.`);
    } catch (e) { setFormError(errorText(e)); } finally { setBusy(false); setApplying(false); }
  };

  if (!product || !profile) return <><PageHead title="Sazonalidade" description="Configure os percentuais mensais de cada subproduto." /><Empty title="Cadastre um subproduto ativo para configurar a sazonalidade"><Button onClick={() => navigate('/parametros')}>Gerenciar subprodutos</Button></Empty></>;

  return <div className="season-page" aria-busy={busy || applying}>
    <PageHead title="Sazonalidade" description="Defina quanto da meta anual de cada subproduto pertence a cada mês." /><ClosureNotice/>
    {!!error && <Failure error={error} retry={refresh} />}
    <div className="season-workspace">
      <aside className="season-products" aria-label="Subprodutos para configurar">
        <div className="season-products-title"><span>SUBPRODUTOS</span><small>{products.length}</small></div>
        {products.map(p => {
          const configured = saved[p.id] || profiles.find(s => s.product_id === p.id);
          return <button key={p.id} type="button" aria-pressed={productId === p.id} disabled={busy || applying} onClick={() => { setProductId(p.id); setFormError(''); }} className={`season-product ${productId === p.id ? 'selected' : ''}`}>
            <span className="season-product-color" style={{ background: colors[(p.id - 1) % colors.length] }} /><span><strong>{p.sub_product}</strong><small>{p.name} · {drafts[p.id] && !seasonalityDraftMatches(drafts[p.id], configured?.weights) ? 'Alterações não salvas' : configured?.revision ? 'Percentuais salvos' : 'A configurar'}</small></span><ChevronRight size={15} />
          </button>;
        })}
        <p>Os percentuais são independentes por subproduto e ano.</p>
      </aside>
      <Card className="season-profile" title={product.sub_product} subtitle={`${product.name} · Participação mensal na meta anual`} actions={<Badge tone={dirty ? 'pending' : profile.revision ? 'success' : 'neutral'}>{dirty ? 'Não salvo' : profile.revision ? 'Salvo' : 'A configurar'}</Badge>} flush>
        <div className="season-editor-toolbar"><span><strong>Percentuais por mês</strong><small>{product.unit === 'BRL' ? 'Ex.: 10% de R$ 100.000 = R$ 10.000 no mês.' : product.unit === 'PCT' ? 'Ex.: peso de 10% sobre uma meta de 25% = 2,5% no mês.' : 'Ex.: 10% de 1.000 unidades = 100 unidades no mês.'}</small></span><div><Button size="sm" icon={<RotateCcw size={14} />} disabled={!dirty || busy || applying} onClick={reset}>Desfazer</Button></div></div>
        <SeasonalityPresets weights={bps} original={profile.weights.map(v => Math.round(v * 100))} closed={locked} disabled={!!review || busy || applying || loading || !!error} onSelect={(_, values) => update(values)} />
        <fieldset className="season-grid" disabled={!!review || busy || applying}><legend className="sr-only">Percentuais mensais de {product.sub_product}</legend>{months.map((m, i) => <div className="season-weight" key={m}>
          <label htmlFor={`season-weight-${i}`}><small>{String(i + 1).padStart(2, '0')}</small>{m}{locked.has(i+1)?' · Fechado':''}</label>
          <div className="season-bar" aria-hidden="true"><span style={{ height: `${Math.min(Math.max(Number.isFinite(nums[i]) ? nums[i] : 0, 0), 100) / peak * 100}%` }} /></div>
          <div className="season-percent-input"><NumberInput adjustOnWheel title="Role para cima para aumentar ou para baixo para diminuir em 0,01%." disabled={locked.has(i+1)} id={`season-weight-${i}`} aria-label={`Percentual de ${m}`} aria-invalid={weights[i] === '' || !Number.isFinite(nums[i]) || nums[i] < 0 || nums[i] > 100 || Math.abs(nums[i] * 100 - bps[i]) >= .00001} min={0} max={100} step="0.01" value={weights[i] ?? ''} onValueChange={value => update(weights.map((v, j) => i === j ? value : v))} /><span>%</span></div>
        </div>)}</fieldset>
        <div className="season-quarter-summary">{[0, 1, 2, 3].map(q => <span key={q}>{q + 1}º trimestre <strong>{validFields ? `${number(bps.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0) / 100, 2)}%` : '—'}</strong></span>)}</div>
        <div className="season-save-footer"><div className={`season-balance ${valid ? 'valid-text' : 'invalid-text'}`} role="status">{valid ? <CheckCheck size={21} /> : <CircleAlert size={21} />}<div><strong>{validFields ? `${number(sum / 100, 2)}%` : 'Revise os percentuais'}<span>{valid ? ' de 100% distribuídos' : validFields ? sum < 10000 ? ` · Faltam ${number((10000 - sum) / 100, 2)}%` : ` · Excedeu ${number((sum - 10000) / 100, 2)}%` : ''}</span></strong><small>{valid ? 'Pronto para distribuir a meta ao longo do ano.' : 'Use valores de 0 a 100 com até 2 casas decimais. O total deve ser 100%.'}</small></div></div><Button variant="primary" icon={<Save size={16} />} loading={busy} disabled={!valid || busy || applying || loading || !!error || locked.size===12} onClick={() => openSave('save')}>Salvar percentuais</Button></div>
        {formError && !review && <div className="form-error" role="alert">{formError}</div>}
      </Card>
    </div>
    <Card className="season-preview" title="Prévia das metas mensais" subtitle={`Veja como os percentuais de ${product.sub_product} distribuem as metas de ${year}.`} actions={<div className="season-agency-filter"><label htmlFor="season-regional">REGIONAL</label><div className="season-regional-select"><RegionalSelect id="season-regional" value={regional} onChange={setRegional} label="Filtrar prévia por regional"/></div><label htmlFor="season-agency">AGÊNCIA</label><Select id="season-agency" value={agencyId} disabled={applying || !!review} onChange={e => setAgencyId(Number(e.target.value))}><option value={0}>Todas as agências</option><AgencyOptions agencies={agenciesOf(data.agencies.filter(a => a.active), regional)}/></Select></div>} flush>
      {rows.length ? <div className="table-scroll"><table className="app-table season-preview-table"><caption className="sr-only">Prévia da distribuição sazonal de {product.sub_product}. Os valores serão gravados ao aplicar.</caption><thead><tr><th>Agência</th><th className="numeric">Meta anual</th>{shortMonths.map(m => <th key={m} className="numeric">{m}</th>)}<th>Situação</th></tr></thead><tbody>{rows.map(r => {
        const amounts = valid ? apportionOpen(Math.round(r.goal.annual_amount * scale), bps, r.goal.months.map(m=>Math.round(m.amount*scale)), locked, distributionStep(product.unit)) : null;
        return <tr key={r.goal.id}><td><RegionalTag name={r.agency.regional_name}/><strong>{r.agency.code} {r.agency.name}</strong></td><td className="numeric season-annual">{money(r.goal.annual_amount, product.unit)}</td>{months.map((m, i) => <td key={m} className="numeric">{amounts ? money(amounts[i] / scale, product.unit) : '—'}</td>)}<td><Badge tone={r.goal.annual_amount === 0 ? 'neutral' : 'pending'}>{r.goal.annual_amount === 0 ? 'Meta anual zerada' : 'Disponível para aplicar'}</Badge></td></tr>;
      })}</tbody></table></div> : <Empty title="Nenhuma meta para esta seleção"><p>Informe as metas anuais em Meta por Agência.</p><Button onClick={() => navigate('/distribuidor')}>Ir para metas por agência</Button></Empty>}
      <div className="season-preview-footer"><div><strong>{rows.length} {rows.length === 1 ? 'agência' : 'agências'} · {money(total / scale, product.unit)} no ano</strong><small>Ao salvar, escolha entre guardar os percentuais ou aplicar às agências que você selecionar.</small></div><Button variant="primary" iconRight={<ArrowRight size={16} />} disabled={!valid || !productRows.length || loading || !!error || busy || applying || locked.size===12} onClick={() => openSave('apply')}>Aplicar às metas</Button></div>
    </Card>
    <div className="season-footnote"><ShieldCheck size={16} /><span>Salvar percentuais cria o padrão do subproduto. Aplicar às metas recalcula também os valores das carteiras.</span>{totalDirty > 1 && <strong>{totalDirty} subprodutos com alterações não salvas</strong>}</div>
    <Dialog open={!!review} onClose={() => !busy && setReview(null)} title={`Salvar sazonalidade · ${review?.product.sub_product || product.sub_product}`} description={`Escolha como salvar os percentuais de ${review?.year || year}.`} size="lg" className="season-save-dialog" onSubmit={confirmSave} footer={<div className="season-confirm-footer">
      <Field label={`Digite ${confirmationWord} para confirmar`} hint={action === 'apply' ? `Aplicar em ${selectedTargets.length} ${selectedTargets.length === 1 ? 'agência selecionada' : 'agências selecionadas'}.` : 'Guardar a configuração, sem alterar as metas.'}><Input aria-label={`Digite ${confirmationWord} para confirmar`} autoComplete="off" spellCheck={false} disabled={busy} placeholder={confirmationWord} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field>
      <div className="season-confirm-actions"><Button disabled={busy} onClick={() => setReview(null)}>Cancelar</Button><Button type="submit" variant="primary" icon={<Save size={16} />} loading={busy} disabled={!canConfirm || busy || loading || !!error}>{action === 'apply' ? 'Salvar e aplicar' : 'Salvar percentuais'}</Button></div>
    </div>}>
      <fieldset className="season-save-options" disabled={busy}><legend>O que deseja fazer?</legend>
        <label className={`season-save-option ${action === 'save' ? 'selected' : ''}`}><input type="radio" name="season-save-action" value="save" checked={action === 'save'} onChange={() => changeAction('save')} /><span><strong>Salvar somente os percentuais</strong><small>Guarda a configuração nesta tela, sem alterar as metas das agências.</small></span></label>
        <label className={`season-save-option ${action === 'apply' ? 'selected' : ''}`}><input type="radio" name="season-save-action" value="apply" checked={action === 'apply'} onChange={() => changeAction('apply')} /><span><strong>Salvar e aplicar às metas</strong><small>Recalcula os meses abertos de {review?.product.sub_product} nas agências selecionadas.</small></span></label>
      </fieldset>
      {action === 'apply' && review && <div className="season-target-picker">
        <div className="season-target-heading"><strong>Em quais agências aplicar?</strong><Badge tone={selectedTargets.length ? 'success' : 'pending'}>{selectedTargets.length} de {availableTargets.length} selecionadas</Badge></div>
        <p>Todas as agências disponíveis começam selecionadas. Desmarque as que quiser ou use “Somente esta” para escolher uma única agência.</p>
        <div className="season-target-toolbar"><Checkbox label="Todas as agências disponíveis" disabled={busy || !availableTargets.length} checked={availableTargets.length > 0 && selectedTargets.length === availableTargets.length} indeterminate={selectedTargets.length > 0 && selectedTargets.length < availableTargets.length} onChange={e => selectGoals(e.target.checked ? availableTargets.map(r => r.goal.id) : [])} /><Select aria-label="Aplicar somente a uma regional" value={0} disabled={busy || !availableTargets.length} onChange={e => selectGoals(availableTargets.filter(r => r.agency.regional_id === Number(e.target.value)).map(r => r.goal.id))}><option value={0}>Somente uma regional…</option>{data.regionals.filter(g => availableTargets.some(r => r.agency.regional_id === g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Select><Button size="sm" variant="ghost" disabled={busy || !selectedTargets.length} onClick={() => selectGoals([])}>Desmarcar todas</Button></div>
        <div className="season-target-list" role="group" aria-label="Agências para aplicar a sazonalidade">{review.agencies.map(a => {
          const target = review.targets.find(r => r.agency.id === a.id);
          const available = !!target;
          const checked = !!target && selectedGoals.includes(target.goal.id);
          return <div className={`season-target-row ${checked ? 'selected' : ''} ${!available ? 'unavailable' : ''}`} key={a.id}>
            <Checkbox disabled={busy || !available} checked={checked} aria-label={`Aplicar na agência ${a.code} ${a.name}`} onChange={e => { if (target) selectGoals(e.target.checked ? [...selectedGoals, target.goal.id] : selectedGoals.filter(id => id !== target.goal.id)); }} label={<span><RegionalTag name={a.regional_name}/><strong>{a.code} · {a.name}</strong><small>{!target ? `Sem meta em ${review.year}` : `Meta anual: ${money(target.goal.annual_amount, review.product.unit)}`}</small></span>} />
            {available && <Button size="sm" variant="ghost" aria-label={`Selecionar somente a agência ${a.code} ${a.name}`} disabled={busy} onClick={() => selectGoals([target.goal.id])}>Somente esta</Button>}
          </div>;
        })}</div>
        {!selectedTargets.length && <p className="invalid-text" role="status">Selecione pelo menos uma agência para aplicar.</p>}
        <div className="season-apply-impact"><strong>{selectedTargets.length} {selectedTargets.length === 1 ? 'agência será atualizada' : 'agências serão atualizadas'} · {review.product.sub_product} · {review.year}</strong><p>O total anual de cada agência e os percentuais das carteiras serão mantidos. As metas e os ajustes manuais dos meses abertos serão recalculados. Os meses fechados serão preservados.</p></div>
        {selectedTargets.some(r => r.goal.annual_amount === 0) && <p className="muted">Agências com meta anual zero continuarão com os meses zerados.</p>}
      </div>}
      {formError && <div className="form-error" role="alert">{formError}</div>}
    </Dialog>
  </div>;
}
