import { useEffect, useState } from 'react';
import { Badge, Button, Dialog, Select } from 'broto-ui';
import { ChevronRight, History } from 'lucide-react';
import { dateTime, money } from './api';
import type { Unit } from './units';
import { useApp, useRemote } from './context';
import { Empty, Failure, Loading } from './shared';
import './versions.css';

type Change = { kind: 'annual' | 'month' | 'portfolio'; label: string; before: number; after: number };
type Version = {
  id: number; goal_id: number; version: number; timestamp: string; actor: string | null; action: string; detail: string; year: number;
  agency: { id: number; code: string; name: string };
  product: { id: number; name: string; sub_product: string; unit: Unit };
  annual_amount: number; changes: Change[];
};

const PAGE = 20;
const actionLabels: Record<string, string> = { create: 'Criação', baseline: 'Situação inicial', update: 'Alteração', import: 'Importação', distribute: 'Distribuição' };

/** Botão "Versões": todas as versões gravadas das metas do ano, com autor, data/hora e valores antes e depois. */
export function GoalVersions({ agencyLock = 0 }: { agencyLock?: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button icon={<History size={16} />} onClick={() => setOpen(true)}>Versões</Button>
    {open && <VersionsDialog agencyLock={agencyLock} onClose={() => setOpen(false)} />}
  </>;
}

function VersionsDialog({ agencyLock, onClose }: { agencyLock: number; onClose: () => void }) {
  const { data, year, tick, refresh } = useApp();
  const [agency, setAgency] = useState(agencyLock);
  const [product, setProduct] = useState(0);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => { setPage(0); setExpanded(new Set()); }, [agency, product, year]);
  const remote = useRemote<{ total: number; entries: Version[] }>(`/versions?year=${year}&limit=${PAGE}&offset=${page * PAGE}${agency ? `&agency_id=${agency}` : ''}${product ? `&product_id=${product}` : ''}`, tick);
  const total = remote.data?.total || 0;
  const toggle = (id: number) => setExpanded(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  return <Dialog open size="xl" className="versions-dialog" title="Versões das metas" description={`Metas de ${year} · cada alteração fica gravada no banco com autor, data e hora e nunca é apagada.`} onClose={onClose}
    footer={<><span className="versions-count">{total} {total === 1 ? 'versão registrada' : 'versões registradas'}</span><div className="pagination-controls"><Button size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page + 1}</span><Button size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div></>}>
    <div className="versions-filters">
      <Select aria-label="Filtrar versões por agência" value={agency} disabled={!!agencyLock} onChange={e => setAgency(Number(e.target.value))}>
        <option value={0}>Todas as agências</option>
        {data.agencies.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
      </Select>
      <Select aria-label="Filtrar versões por subproduto" value={product} onChange={e => setProduct(Number(e.target.value))}>
        <option value={0}>Todos os subprodutos</option>
        {data.products.map(p => <option key={p.id} value={p.id}>{p.sub_product} · {p.name}</option>)}
      </Select>
    </div>
    {remote.loading ? <Loading /> : remote.error ? <Failure error={remote.error} retry={refresh} /> : !remote.data?.entries.length ? <Empty title="Nenhuma versão encontrada" /> :
      <ul className="versions-list">{remote.data.entries.map(v => {
        const isOpen = expanded.has(v.id);
        const unit = v.product.unit;
        return <li key={v.id} className="versions-item">
          <button type="button" className="versions-head" aria-expanded={isOpen} onClick={() => toggle(v.id)}>
            <ChevronRight size={16} className={`versions-chevron ${isOpen ? 'open' : ''}`} aria-hidden />
            <span className="versions-main">
              <strong>{v.agency.code} · {v.agency.name} <span>·</span> {v.product.sub_product}</strong>
              <small>{v.detail}</small>
            </span>
            <span className="versions-meta">
              <Badge tone={v.action === 'baseline' || v.action === 'create' ? 'info' : v.action === 'import' ? 'brand' : 'neutral'} size="sm">{actionLabels[v.action] || 'Alteração'}</Badge>
              <span className="versions-number">v{v.version}</span>
            </span>
            <span className="versions-who"><b>{v.actor || 'Não identificado'}</b><time>{dateTime(v.timestamp)}</time></span>
          </button>
          {isOpen && <div className="versions-body">
            <p>Total do ano nesta versão: <strong>{money(v.annual_amount, unit)}</strong></p>
            {v.changes.length ? <table className="app-table versions-table"><thead><tr><th>O que mudou</th><th className="numeric">Antes</th><th className="numeric">Depois</th></tr></thead>
              <tbody>{v.changes.map((c, i) => <tr key={i}><td>{c.kind === 'portfolio' ? `Carteira · ${c.label}` : c.label}</td><td className="numeric">{money(c.before, unit)}</td><td className="numeric"><strong>{money(c.after, unit)}</strong></td></tr>)}</tbody></table>
              : <p className="versions-none">{v.action === 'baseline' || v.action === 'create' ? 'Versão de partida: as próximas alterações serão comparadas com ela.' : 'Nenhum valor mudou nesta versão (apenas a forma de distribuição).'}</p>}
          </div>}
        </li>;
      })}</ul>}
  </Dialog>;
}
