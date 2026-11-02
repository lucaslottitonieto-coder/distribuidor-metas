import { segmentStyle } from './segmentColors';
import { useState } from 'react';
import { Badge, Button, Card, TabPanel, Tabs } from 'broto-ui';
import { ArrowLeft, ArrowRight, Building2, CalendarCheck, CheckCheck, CircleAlert, Coins, LayoutDashboard, MapPin, Network, Pencil, Sparkles, Target, UserRound, WalletCards } from 'lucide-react';
import { compact, dateTime, money, months, shortMonths, type Audit, type Goal, type Plan, type PlanningMatrix } from './api';
import { useApp, useRemote } from './context';
import { AgencyDialog } from './Forms';
import { planningOrigin, totalPortfolio, walletTone } from './matrixUtils';
import PlanningMatrixPage from './PlanningMatrix';
import { ArrowLink, Empty, Failure, Loading, GoalBadge } from './shared';
import './agency-overview.css';

const agencyIdFromHash = () => Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('id')) || 0;
const tabs = ['resumo', 'agencia', 'carteira', 'editar-agencia', 'editar-carteira'] as const;
type Tab = typeof tabs[number];
const tabFromHash = (): Tab => { const t = new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab'); return tabs.find(x => x === t) ?? 'resumo'; };
const percent = (part: number, total: number) => total > 0 ? Math.round(part / total * 1000) / 10 : 0;

export default function AgencyOverviewPage() {
  const { data, year, tick, refresh, navigate, setAgencyId } = useApp();
  const id = agencyIdFromHash();
  const agency = data.agencies.find(a => a.id === id);
  const plan = useRemote<Plan>(agency ? `/agencies/${id}/goals?year=${year}` : '/health', tick);
  const matrix = useRemote<PlanningMatrix>(agency ? `/goals?year=${year}&agency_id=${id}` : '/health', tick);
  const audit = useRemote<{ total: number; entries: Audit[] }>(agency ? `/audit?agency_id=${id}&limit=5` : '/health', tick);
  const [edit, setEdit] = useState(false);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  // troca de módulo grava na URL sem criar entrada no histórico: o "voltar" continua levando às agências
  const setTab = (t: Tab) => { setTabState(t); window.history.replaceState(null, '', `#/agencia?id=${id}${t === 'resumo' ? '' : `&tab=${t}`}`); window.scrollTo(0, 0); };
  const back = <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate('/agencias')}>Voltar para agências</Button>;
  if (!agency) return <div className="empty"><h1>Agência não encontrada</h1><p>O endereço não aponta para uma agência cadastrada.</p>{back}</div>;
  if (plan.error || matrix.error) return <Failure error={plan.error || matrix.error} retry={refresh} />;
  if (!plan.data || !matrix.data) return <Loading />;

  const { goals, portfolios } = plan.data;
  const rows = new Map(matrix.data.rows.map(r => [r.goal.id, r]));
  const brlTotal = goals.filter(g => g.unit === 'BRL').reduce((sum, g) => sum + g.annual_amount, 0);
  const loaded = goals.filter(g => g.annual_amount !== 0).length;
  const toPlan = (path: string) => { setAgencyId(id); navigate(`${path}?agencia=${id}`); };

  const alerts: { text: string; action?: string; path?: string }[] = [];
  const missing = goals.filter(g => g.missing_months.length);
  if (missing.length) alerts.push({ text: `${missing.length} subproduto${missing.length > 1 ? 's' : ''} com mês ausente na planilha de origem (${[...new Set(missing.flatMap(g => g.missing_months))].map(m => months[m - 1]).join(', ')}).`, action: 'Revisar metas', path: '/distribuidor' });
  const undistributed = goals.filter(g => g.annual_pending);
  if (undistributed.length) alerts.push({ text: `${undistributed.length} subproduto${undistributed.length > 1 ? 's' : ''} com meta anual ainda não distribuída nos meses.`, action: 'Distribuir meses', path: '/distribuidor' });
  if (goals.length && !portfolios.length) alerts.push({ text: 'A agência tem metas, mas nenhuma carteira ativa para recebê-las.', action: 'Cadastrar carteiras', path: '/carteiras' });
  const unloaded = goals.length - loaded;
  if (unloaded > 0) alerts.push({ text: `${unloaded} subproduto${unloaded > 1 ? 's' : ''} sem meta carregada em ${year}.`, action: 'Carregar metas', path: '/distribuidor' });

  return <div className="xray">
    <div className="xray-back">{back}</div>
    <section className="xray-hero">
      <span className="large-entity-icon"><Building2 size={24} /></span>
      <div className="xray-hero-main">
        <small className="eyebrow">{agency.regional_name.toUpperCase()} · RAIO-X DA AGÊNCIA {agency.code} · {year}</small>
        <h1>{agency.name}</h1>
        <div className="xray-hero-meta"><span><MapPin size={14} />{agency.city}, {agency.state}</span><span><UserRound size={14} />{agency.manager || 'Responsável não informado'}</span><Badge tone={agency.active ? 'success' : 'neutral'}>{agency.active ? 'Ativa' : 'Inativa'}</Badge><GoalBadge loaded={!!goals.length && loaded === goals.length} missing={missing.length > 0} /></div>
      </div>
      <div className="xray-hero-actions"><Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Editar agência</Button><Button variant="primary" iconRight={<ArrowRight size={16} />} onClick={() => toPlan('/distribuidor')}>Editar metas</Button></div>
    </section>

    <Tabs idPrefix="xray" value={tab} onChange={setTab} aria-label="Módulos da agência" tabs={[
      { id: 'resumo', label: 'Resumo', icon: <LayoutDashboard size={16} />, count: alerts.length || undefined },
      { id: 'agencia', label: 'Meta por agência', icon: <Target size={16} />, count: goals.length },
      { id: 'carteira', label: 'Meta por carteira', icon: <WalletCards size={16} />, count: portfolios.length },
      { id: 'editar-agencia', label: 'Editar meta por agência', icon: <Pencil size={16} /> },
      { id: 'editar-carteira', label: 'Editar meta por carteira', icon: <Network size={16} /> },
    ]} />

    {tab === 'resumo' && <TabPanel id="resumo" idPrefix="xray"><div className="xray-panel">
      <div className="stats-grid">
        <Kpi label="Metas financeiras" value={compact(brlTotal)} hint="Soma dos subprodutos em reais" Icon={Coins} color="green" />
        <Kpi label="Subprodutos com meta" value={String(loaded).padStart(2, '0')} hint={`de ${goals.length} subprodutos`} Icon={Target} color="blue" />
        <Kpi label="Carteiras ativas" value={String(portfolios.length).padStart(2, '0')} hint={`${new Set(portfolios.map(p => p.segment_id)).size} segmento(s) atendido(s)`} Icon={WalletCards} color="purple" />
        <Kpi label="Média mensal" value={compact(brlTotal / 12)} hint="Média dos 12 meses em reais" Icon={CalendarCheck} color="amber" />
      </div>

      {alerts.length > 0 && <Card className="xray-alerts" title="Pontos de atenção" subtitle="O que ainda precisa da sua revisão nesta agência." flush>
        <ul>{alerts.map((a, i) => <li key={i}><CircleAlert size={17} /><span>{a.text}</span>{a.path && <ArrowLink onClick={() => toPlan(a.path!)}>{a.action}</ArrowLink>}</li>)}</ul>
      </Card>}
      {!alerts.length && goals.length > 0 && <div className="xray-ok"><CheckCheck size={18} /><span><strong>Tudo certo por aqui.</strong> Todas as metas estão carregadas e distribuídas nos meses.</span></div>}

      {goals.some(g => g.unit === 'BRL') && portfolios.length > 0 && <Card title="Peso das carteiras na meta financeira" subtitle="Participação de cada carteira na soma dos subprodutos em reais.">
        <WeightBar goals={goals.filter(g => g.unit === 'BRL')} rows={rows} portfolios={portfolios} total={brlTotal} />
      </Card>}

      <Card className="xray-activity" title="Últimas movimentações" subtitle="Alterações registradas nesta agência." actions={<ArrowLink onClick={() => navigate('/historico')}>Ver histórico</ArrowLink>} flush>
        {audit.data?.entries.length ? <ul>{audit.data.entries.map(e => <li key={e.id}><span className="activity-symbol"><Sparkles size={15} /></span><span>{e.detail}</span><time>{dateTime(e.timestamp)}</time></li>)}</ul> : <p className="xray-empty">{audit.loading ? 'Carregando...' : 'Nenhuma movimentação registrada ainda.'}</p>}
      </Card>
    </div></TabPanel>}

    {tab === 'agencia' && <TabPanel id="agencia" idPrefix="xray"><div className="xray-panel">
      <Card title="Metas por subproduto" subtitle={`O que a agência precisa entregar em ${year}, mês a mês.`} actions={<ArrowLink onClick={() => toPlan('/distribuidor')}>Editar metas</ArrowLink>} flush>
        {goals.length ? <div className="table-scroll"><table className="app-table xray-table"><thead><tr><th>Subproduto</th><th className="numeric">Meta anual</th><th>Sazonalidade</th><th>Origem</th><th>Situação</th></tr></thead><tbody>
          {goals.map(g => <GoalRow key={g.id} goal={g} />)}
        </tbody></table></div> : <Empty title="Nenhuma meta para este ano"><p>Esta agência ainda não tem metas em {year}. Troque o ano no topo ou crie as metas do ano.</p><Button onClick={() => toPlan('/distribuidor')}>Ir para as metas</Button></Empty>}
      </Card>

    </div></TabPanel>}

    {tab === 'editar-agencia' && <TabPanel id="editar-agencia" idPrefix="xray"><PlanningMatrixPage key={`agency-${id}`} view="agency" agencyLock={id} /></TabPanel>}
    {tab === 'editar-carteira' && <TabPanel id="editar-carteira" idPrefix="xray"><PlanningMatrixPage key={`portfolio-${id}`} view="portfolio" agencyLock={id} /></TabPanel>}

    {tab === 'carteira' && <TabPanel id="carteira" idPrefix="xray"><div className="xray-panel">
      <Card title="Carteiras e participação nas metas" subtitle="Quanto cada carteira carrega da meta anual de cada subproduto." actions={<ArrowLink onClick={() => toPlan('/metas-carteira')}>Meta por carteira</ArrowLink>} flush>
        {portfolios.length ? <div className="table-scroll"><table className="app-table xray-table"><thead><tr><th>Carteira</th><th>Segmento</th>{goals.map(g => <th key={g.id} className="numeric">{g.sub_product}</th>)}</tr></thead><tbody>
          {portfolios.map(p => <tr key={p.id}>
            <td><span className="entity-cell"><span className="wallet-card" data-tone={walletTone(p.code)}>{p.code}</span><span><strong>{p.name}</strong><small>{p.manager || 'Gestor não informado'}</small></span></span></td>
            <td><span className="matrix-segment" style={segmentStyle(p.color)}>{p.segment_name}</span><small className="xray-sub">sugerido {p.suggested_percent.toLocaleString('pt-BR')}%</small></td>
            {goals.map(g => { const own = rows.get(g.id)?.portfolios.find(x => x.id === p.id); const value = own ? totalPortfolio(own.months, g.unit) : 0; const share = percent(value, g.annual_amount); return <td key={g.id} className="numeric"><strong>{own?.months.length ? money(value, g.unit) : '—'}</strong>{!!own?.months.length && g.unit !== 'PCT' && <small className="xray-share">{share.toLocaleString('pt-BR')}% da meta</small>}</td>; })}
          </tr>)}
        </tbody>{goals.length > 0 && <tfoot><tr><td colSpan={2}>Total da agência</td>{goals.map(g => <td key={g.id} className="numeric"><strong>{money(g.annual_amount, g.unit)}</strong></td>)}</tr></tfoot>}</table></div> : <Empty title="Nenhuma carteira ativa"><p>Cadastre carteiras para distribuir as metas desta agência.</p><Button onClick={() => navigate('/carteiras')}>Gerenciar carteiras</Button></Empty>}
      </Card>

    </div></TabPanel>}
    {edit && <AgencyDialog agency={agency} onClose={() => setEdit(false)} />}
  </div>;
}

function GoalRow({ goal: g }: { goal: Goal }) {
  const origin = planningOrigin(g);
  const max = Math.max(...g.months.map(m => m.amount), 1);
  return <tr>
    <td><span className="entity-cell"><span><strong>{g.sub_product}</strong><small>{g.product_name}</small></span></span></td>
    <td className="numeric"><strong>{money(g.annual_amount, g.unit)}</strong></td>
    <td><div className="xray-spark" role="img" aria-label={`Metas mensais de ${g.sub_product}`}>{g.months.map((m, i) => <span key={m.month} className={g.missing_months.includes(m.month) ? 'missing' : ''} title={`${shortMonths[i]}: ${money(m.amount, g.unit)}`}><i style={{ height: `${Math.max(m.amount / max * 100, 6)}%` }} /></span>)}</div></td>
    <td><span className={`matrix-origin origin-${origin.tone}`}>{origin.label}</span></td>
    <td><GoalBadge loaded={g.annual_amount !== 0} missing={g.missing_months.length > 0} /></td>
  </tr>;
}

function WeightBar({ goals, rows, portfolios, total }: { goals: Goal[]; rows: Map<number, PlanningMatrix['rows'][number]>; portfolios: Plan['portfolios']; total: number }) {
  const parts = portfolios.map(p => ({ p, value: goals.reduce((sum, g) => { const own = rows.get(g.id)?.portfolios.find(x => x.id === p.id); return sum + (own ? totalPortfolio(own.months, g.unit) : 0); }, 0) }));
  const assigned = parts.reduce((sum, x) => sum + x.value, 0);
  return <>
    <div className="xray-weight" role="img" aria-label="Participação das carteiras na meta financeira">{parts.filter(x => x.value > 0).map(({ p, value }) => <span key={p.id} style={{ width: `${value / Math.max(assigned, 1) * 100}%`, background: p.color }} title={`${p.name}: ${percent(value, assigned)}%`} />)}</div>
    <ul className="xray-weight-legend">{parts.map(({ p, value }) => <li key={p.id}><i style={{ background: p.color }} /><span>{p.code} · {p.name}</span><strong>{percent(value, assigned).toLocaleString('pt-BR')}%</strong><small>{compact(value)}</small></li>)}</ul>
    {assigned < total * 0.999 && <p className="xray-weight-note"><Network size={14} /> {compact(total - assigned)} da meta ainda não foi distribuído entre as carteiras.</p>}
  </>;
}

function Kpi({ label, value, hint, Icon, color }: { label: string; value: string; hint: string; Icon: typeof Coins; color: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={19} strokeWidth={1.7} /></span></div><strong>{value}</strong><small>{hint}</small></div>;
}
