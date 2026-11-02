import { useCallback, useEffect, useState } from 'react';
import { Badge, BoxMark, Button, Dialog, IconButton, Select, useConfirm } from 'broto-ui';
import { ArrowRight, Bell, Building2, CalendarDays, CircleHelp, FileBarChart2, History, LayoutDashboard, Menu, Network, Settings2, ShieldCheck, Target, WalletCards, X } from 'lucide-react';
import { AppContext, useRemote } from './context';
import type { Bootstrap } from './api';
import { Failure, Loading } from './shared';
import DashboardPage from './Dashboard';
import PlanningMatrixPage from './PlanningMatrix';
import AgenciesPage from './Agencies';
import AgencyOverviewPage from './AgencyOverview';
import PortfoliosPage from './Portfolios';
import SettingsPage from './Settings';
import SeasonalityPage from './Seasonality';
import { HistoryPage } from './Reports';
import { ReportsPage } from './ReportsHub';

const pages: Record<string,string> = { '/': 'Visão geral', '/distribuidor': 'Meta por Agência', '/metas-carteira': 'Meta por Carteira', '/sazonalidade': 'Sazonalidade', '/agencias': 'Agências', '/agencia': 'Raio-X da agência', '/carteiras': 'Cadastro de carteiras', '/parametros': 'Parametrizações', '/historico': 'Histórico de alterações', '/relatorios': 'Relatórios' };
export default function App() {
  const [tick, setTick] = useState(0);
  const remote = useRemote<Bootstrap>('/bootstrap',tick);
  const [year, setYear] = useState(2026);
  const [agencyId, setAgencyId] = useState(1);
  const [path, setPath] = useState(window.location.hash.slice(1).split('?')[0] || '/');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [info, setInfo] = useState<'help' | 'import' | null>(null);
  const [unsaved,setUnsaved] = useState(false);
  const confirm=useConfirm();
  const guard=useCallback(async(action:()=>void)=>{if(unsaved){const result=await confirm({title:'Descartar alterações não salvas?',description:'Salve seus ajustes para manter as alterações destas metas.',confirmLabel:'Descartar e continuar',tone:'danger'});if(!result.confirmed)return;}setUnsaved(false);action();},[unsaved,confirm]);
  const navigate = useCallback((p: string) => { void guard(()=>{window.location.hash = p; setMobileOpen(false);}); }, [guard]);
  const changeYear=useCallback((next:number)=>{void guard(()=>setYear(next));},[guard]);
  const refresh = useCallback(() => setTick(v => v+1),[]);
  useEffect(() => { const change = () => { setPath(window.location.hash.slice(1).split('?')[0] || '/'); window.scrollTo(0,0); }; window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change); }, []);
  useEffect(() => { document.title = `${pages[path] || 'Página não encontrada'} · Distribuidor de Metas`; },[path]);
  useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(unsaved){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[unsaved]);
  const data = remote.data;
  if (!data) return <div className="initial-loading">{remote.error ? <Failure error={remote.error} retry={refresh} /> : <Loading />}</div>;
  const nav = (p: string, label: string, Icon: typeof Target, badge?: string) => { const here = path === p || (p === '/agencias' && path === '/agencia'); return <button className={`nav-item ${here ? 'active' : ''}`} onClick={() => navigate(p)} aria-current={here ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{badge && <span className="nav-badge">{badge}</span>}{here && <span className="nav-dot" />}</button>; };
  return <AppContext.Provider value={{ data, year, setYear:changeYear, agencyId, setAgencyId, refresh, tick, navigate, setUnsaved }}>
    <div className="app-layout">
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand"><button className="brand-link" aria-label="SomaX Distribuidor de Metas" onClick={()=>navigate('/')}><BoxMark size={36} /><span>Soma<span className="brand-dot">X</span></span></button><IconButton label="Fechar menu" className="mobile-close" icon={<X size={20} />} onClick={() => setMobileOpen(false)} /></div>
        <div className="nav-label">PRINCIPAL</div>
        <nav aria-label="Navegação principal">{nav('/','Visão geral',LayoutDashboard)}{nav('/distribuidor','Meta por Agência',Building2)}{nav('/metas-carteira','Meta por Carteira',Network)}{nav('/sazonalidade','Sazonalidade',CalendarDays)}
          <div className="nav-label nav-label-second">GESTÃO</div>{nav('/agencias','Agências',Building2,String(data.agencies.filter(a=>a.active).length))}{nav('/carteiras','Carteiras',WalletCards)}{nav('/parametros','Parametrizações',Settings2)}{nav('/relatorios','Relatórios',FileBarChart2)}{nav('/historico','Histórico de alterações',History)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-status"><span className="status-light" /> API conectada <span>v1.0</span></div></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div className="topbar-start"><IconButton className="mobile-toggle" label="Abrir menu" icon={<Menu size={22} />} onClick={() => setMobileOpen(true)} /><span className="topbar-location">{pages[path] || 'Página não encontrada'}</span></div><div className="topbar-end"><div className="year-control"><CalendarDays size={16} /><Select aria-label="Ano das metas" value={year} onChange={e=>{const next=Number(e.target.value);if(next===-1)navigate(`/parametros?aba=anos&ano=${Math.max(...(data.goal_years??data.years),year)+1}`);else if((data.goal_years??data.years).includes(next))changeYear(next);else navigate(`/parametros?aba=anos&ano=${next}`);}}>{[...new Set([...(data.goal_years??data.years),2026,2027,2028,year])].sort().map(y=><option key={y} value={y}>{(data.goal_years??data.years).includes(y)||y===year?y:`${y} · iniciar`}</option>)}<option value={-1}>Novo ano…</option></Select></div><IconButton label="Ajuda sobre o sistema" icon={<CircleHelp size={20} />} onClick={()=>setInfo('help')} /><div className="notification-button"><IconButton label="Pendências da importação" icon={<Bell size={20} />} onClick={()=>setInfo('import')} />{data.import_report && <span />}</div><div className="topbar-divider" /><div className="profile-avatar">GC</div><div className="profile-text"><strong>Gestão comercial</strong><span>Ambiente local</span></div></div></header>
        <main id="main-content" className="main-content">
          {!!remote.error && <div className="inline-error">Falha ao atualizar os cadastros. <button onClick={refresh}>Tentar novamente</button></div>}
          {path==='/' ? <DashboardPage onImport={()=>setInfo('import')} /> : path==='/distribuidor' ? <PlanningMatrixPage key="agency" /> : path==='/metas-carteira' ? <PlanningMatrixPage key="portfolio" view="portfolio" /> : path==='/sazonalidade' ? <SeasonalityPage key={year} /> : path==='/agencias' ? <AgenciesPage /> : path==='/agencia' ? <AgencyOverviewPage key={window.location.hash} /> : path==='/carteiras' ? <PortfoliosPage /> : path==='/parametros' ? <SettingsPage /> : path==='/historico' ? <HistoryPage /> : path==='/relatorios' ? <ReportsPage /> : <div className="empty"><h1>Página não encontrada</h1><Button onClick={()=>navigate('/')}>Voltar à visão geral</Button></div>}
        </main>
      </div>
    </div>
    <Dialog open={info==='help'} onClose={()=>setInfo(null)} title="Da meta à carteira" description="Um fluxo conectado para distribuir suas metas com segurança." size="lg"><div className="help-steps">{[{icon:Settings2,title:'1. Configure seus padrões',text:'Cadastre regionais, produtos e subprodutos, segmentos e o modelo de carteiras em Parametrizações.'},{icon:Building2,title:'2. Crie a agência',text:'Escolha a regional. Os subprodutos, os 12 meses e as carteiras padrão são criados automaticamente.'},{icon:CalendarDays,title:'3. Carregue as metas',text:'Importe o Excel, informe o total anual ou defina o valor de cada mês. A sazonalidade distribui o total nos meses.'},{icon:Network,title:'4. Distribua nas carteiras',text:'Atribua percentuais ou valores às carteiras. Cada distribuição precisa fechar em 100%.'}].map(s=><div key={s.title}><span className="help-icon"><s.icon size={22} /></span><div><strong>{s.title}</strong><p>{s.text}</p></div></div>)}</div><div className="help-note"><ShieldCheck size={19} /> Cada distribuição precisa fechar em 100%. Alterações ficam registradas no histórico.</div></Dialog>
    <Dialog open={info==='import'} onClose={()=>setInfo(null)} title="Conferência da planilha de origem" description={data.import_report?.source || 'Referência da implantação'} size="lg" footer={<Button variant="primary" onClick={()=>{setInfo(null);navigate('/distribuidor');}}>Revisar metas <ArrowRight size={16} /></Button>}><div className="import-summary"><Badge tone="info">{data.import_report?.agencies || 0} agências</Badge><Badge tone="neutral">{data.import_report?.goals || 0} metas</Badge><Badge tone="pending">Revisão necessária</Badge></div><p className="muted">Os dados foram preservados. Totais exibidos são calculados pelos meses disponíveis; abril exige confirmação no editor de metas. A sugestão de carteiras da origem foi aplicada também à segunda agência.</p><ul className="import-warnings">{data.import_report?.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></Dialog>
  </AppContext.Provider>;
}
