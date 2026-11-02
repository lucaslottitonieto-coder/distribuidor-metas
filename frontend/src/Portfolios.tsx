import { segmentStyle } from './segmentColors';
import { useState } from 'react';
import { Badge, Button, Card, IconButton, SearchInput, Select } from 'broto-ui';
import { ArrowRight, Building2, ChevronDown, Pencil, Plus, WalletCards } from 'lucide-react';
import type { Portfolio } from './api';
import { useApp, useRemote } from './context';
import { AgencyOptions, RegionalSelect, RegionalTag, agenciesOf, useRegionalAgency } from './shared';
import { PortfolioDialog } from './Forms';
import { SegmentIcon } from './segmentIcon';
import { walletTone } from './matrixUtils';
import { Empty, Failure, Loading, PageHead } from './shared';

export default function PortfoliosPage() {
  const { data, tick, refresh, agencyId, setAgencyId, navigate } = useApp();
  const remote = useRemote<Portfolio[]>('/portfolios', tick);
  const { regional, agency, setRegional, setAgency } = useRegionalAgency();
  const [segment, setSegment] = useState(0);
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<Portfolio | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const search = query.trim().toLowerCase();
  const rows = (remote.data || []).filter(p =>
    (!regional || p.regional_id === regional) && (!agency || p.agency_id === agency) && (!segment || p.segment_id === segment) &&
    (showInactive || p.active) &&
    `${p.name} ${p.code} ${p.manager} ${p.agency_name} ${p.agency_code} ${p.regional_name}`.toLowerCase().includes(search)
  );
  const filtered = Boolean(search || segment || agency || regional);
  const groups = data.agencies
    .filter(a => (!regional || a.regional_id === regional) && (!agency || a.id === agency))
    .map(a => ({ agency: a, portfolios: rows.filter(p => p.agency_id === a.id) }))
    .filter(group => group.portfolios.length || (!search && !segment && (group.agency.active || showInactive)));

  return <>
    <PageHead title="Carteiras" description="Organize os segmentos e conecte cada carteira às metas da agência." actions={<Button variant="primary" icon={<Plus size={17}/>} onClick={() => setEdit('new')}>Nova carteira</Button>}/>
    <div className="segment-cards">
      {data.segments.filter(s => s.active).map(s => <button className={`segment-summary ${segment === s.id ? 'selected' : ''}`} key={s.id} onClick={() => { setSegment(segment === s.id ? 0 : s.id); setExpanded({}); }}>
        <span className="segment-summary-icon" style={segmentStyle(s.color)}><SegmentIcon segment={s} size={22}/></span>
        <span><small>{s.name}</small><strong>{(remote.data || []).filter(p => p.segment_id === s.id && p.active && (!regional || p.regional_id === regional) && (!agency || p.agency_id === agency)).length}<em>carteiras</em></strong></span>
        <Badge dot={false}>{s.code}</Badge>
      </button>)}
    </div>
    <Card flush title="Carteiras por agência" subtitle="Expanda uma agência para visualizar suas carteiras e participações sugeridas." actions={<Button variant="ghost" size="sm" onClick={() => setShowInactive(!showInactive)}>{showInactive ? 'Ocultar inativas' : 'Mostrar inativas'}</Button>}>
      <div className="table-toolbar expanded-toolbar">
        <SearchInput aria-label="Buscar carteira ou agência" value={query} onChange={e => { setQuery(e.target.value); setExpanded({}); }} placeholder="Buscar regional, agência, carteira ou responsável..."/>
        <RegionalSelect value={regional} onChange={r => { setRegional(r); setExpanded({}); }} label="Filtrar carteiras por regional"/>
        <Select aria-label="Filtrar carteiras por agência" value={agency} onChange={e => { setAgency(Number(e.target.value)); setExpanded({}); }}><option value={0}>Todas as agências</option><AgencyOptions agencies={agenciesOf(data.agencies, regional)} text={a => a.name}/></Select>
        <Select aria-label="Filtrar carteiras por segmento" value={segment} onChange={e => { setSegment(Number(e.target.value)); setExpanded({}); }}><option value={0}>Todos os segmentos</option>{data.segments.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</Select>
      </div>
      {remote.loading && !remote.data ? <Loading/> : remote.error ? <Failure error={remote.error} retry={refresh}/> : <div className="portfolio-agencies">
        {groups.map(({ agency: a, portfolios }) => {
          const open = expanded[a.id] ?? filtered;
          const panelId = `agency-portfolios-${a.id}`;
          return <section className="portfolio-agency" key={a.id}>
            <button className="portfolio-agency-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(current => ({ ...current, [a.id]: !open }))}>
              <span className="entity-icon"><Building2 size={21}/></span>
              <span className="portfolio-agency-name"><RegionalTag name={a.regional_name}/><strong>{a.name}</strong><small>Agência {a.code}</small></span>
              <span className="count-pill">{portfolios.length} {portfolios.length === 1 ? 'carteira' : 'carteiras'}</span>
              <ChevronDown size={19} className="portfolio-agency-chevron"/>
            </button>
            <div id={panelId} hidden={!open}>
              {portfolios.length ? <div className="table-scroll portfolio-agency-content"><table className="app-table">
                <thead><tr><th scope="col">Carteira</th><th scope="col">Segmento</th><th scope="col">Responsável</th><th scope="col" className="numeric">Sugestão</th><th scope="col">Situação</th><th scope="col"><span className="portfolio-actions-label">Ações</span></th></tr></thead>
                <tbody>{portfolios.map(p => <tr key={p.id}>
                  <td><div className="entity-cell"><span className="wallet-card" data-tone={walletTone(p.code)} aria-hidden="true">{p.code}</span><span className="entity-icon" style={segmentStyle(p.color)}><WalletCards size={20}/></span><span><strong>{p.name}</strong><small>Carteira {p.code}</small></span></div></td>
                  <td><span className="segment-badge" style={segmentStyle(p.color)}>{p.segment_code}</span></td>
                  <td>{p.manager || <span className="muted">Não informado</span>}</td>
                  <td className="numeric">{p.suggested_percent.toLocaleString('pt-BR')}%</td>
                  <td><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativa' : 'Inativa'}</Badge></td>
                  <td><IconButton label={`Editar carteira ${p.name} da agência ${a.name}`} icon={<Pencil size={16}/>} onClick={() => setEdit(p)}/></td>
                </tr>)}</tbody>
              </table></div> : <div className="portfolio-agency-empty">Nenhuma carteira cadastrada nesta agência com os filtros atuais.</div>}
            </div>
          </section>;
        })}
        {!groups.length && <Empty title="Nenhuma carteira encontrada"><p>Ajuste os filtros ou cadastre uma carteira.</p></Empty>}
      </div>}
      <div className="table-bottom"><span>{groups.length} {groups.length === 1 ? 'agência' : 'agências'} · {rows.length} carteiras encontradas</span><Button size="sm" variant="ghost" iconRight={<ArrowRight size={15}/>} onClick={() => { if (agency) setAgencyId(agency); navigate(agency || !regional ? `/metas-carteira?agencia=${agency || agencyId}` : `/metas-carteira?regional=${regional}`); }}>Ir para distribuição</Button></div>
    </Card>
    {edit && <PortfolioDialog portfolio={edit === 'new' ? undefined : edit} agencyId={agency || agencyId} onClose={() => setEdit(null)}/>}
  </>;
}
