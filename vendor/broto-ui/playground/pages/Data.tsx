import { AlarmClock, Download, Plus, RotateCcw, Trash2, Upload, Workflow, Zap, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  BulkBar,
  Button,
  Card,
  CellLink,
  CountStrip,
  CountTile,
  DataTable,
  Drawer,
  EmptyState,
  FilterBar,
  Grid,
  JsonView,
  KeyValue,
  Menu,
  MetaItem,
  Page,
  PageHeader,
  Pagination,
  Priority,
  RelativeTime,
  SearchInput,
  SecretBox,
  StackBar,
  StatusBadge,
  Tabs,
  formatNumber,
  toast,
  type Column,
} from 'broto-ui';
import { Inbox } from 'lucide-react';
import { itemColor, itemStatus, queueItems, type ItemStatus, type QueueItem } from '../data';

const STATUSES: ItemStatus[] = ['new', 'in_progress', 'successful', 'failed', 'abandoned', 'retried'];

export function DataPage() {
  const [tab, setTab] = useState<'all' | ItemStatus>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const counts = useMemo(() => {
    const c = Object.fromEntries([...STATUSES, 'deleted'].map((s) => [s, 0])) as Record<ItemStatus, number>;
    queueItems.forEach((it) => (c[it.status] += 1));
    return c;
  }, []);

  const rows = queueItems.filter((it) => (tab === 'all' || it.status === tab) && (!q || it.reference.includes(q) || it.error?.includes(q)));
  const open = queueItems.find((it) => it.id === openId);

  const columns: Column<QueueItem>[] = [
    {
      key: 'ref',
      header: 'Referência',
      cell: (it) => (
        <span className="bt-nowrap">
          <CellLink href="#/dados" mono>
            <span className="bt-text-success">{it.reference}</span>
          </CellLink>
          {it.retried && <span className="bt-subtle bt-small"> (retentativa)</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (it) => <StatusBadge status={it.status} map={itemStatus} size="sm" /> },
    { key: 'prio', header: 'Prioridade', cell: (it) => <Priority level={it.priority} /> },
    { key: 'attempt', header: 'Tentativa', align: 'right', cell: (it) => it.attempt },
    { key: 'sla', header: 'Prazo', nowrap: true, cell: () => <span className="bt-subtle">no prazo</span> },
    {
      key: 'runner',
      header: 'Runner / job',
      nowrap: true,
      cell: (it) => (
        <div className="bt-cell-title">
          <span>{it.runner}</span>
          <span className="bt-cell-sub bt-mono">job {it.job}</span>
        </div>
      ),
    },
    { key: 'created', header: 'Criado', cell: (it) => <RelativeTime value={it.created_at} /> },
    {
      key: 'error',
      header: 'Erro',
      cell: (it) => (it.error ? <span className="bt-text-danger bt-truncate" style={{ display: 'inline-block', maxWidth: 260 }}>{it.error}</span> : <span className="bt-subtle">—</span>),
    },
    {
      key: 'actions',
      header: <span className="bt-sr-only">Ações</span>,
      actions: true,
      cell: () => (
        <Menu
          items={[
            { label: 'Reprocessar', icon: <RotateCcw size={16} />, onSelect: () => toast.success('Item reenfileirado') },
            'separator',
            { label: 'Excluir', icon: <Trash2 size={16} />, danger: true, onSelect: () => toast.error('Item excluído') },
          ]}
        />
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Filas de trabalho', href: '#/dados' }, { label: 'conciliacao-itens' }]}
        title="conciliacao-itens"
        description="Contas a conciliar no portal"
        meta={
          <>
            <MetaItem icon={<Workflow size={15} />}>
              <a className="bt-link" href="#/execucao">
                conciliacao-bancaria
              </a>
            </MetaItem>
            <MetaItem icon={<Zap size={15} />}>Gatilho ligado: até 2 jobs, a partir de 1 item</MetaItem>
            <MetaItem icon={<RefreshCw size={15} />}>até 1 retentativa</MetaItem>
            <MetaItem icon={<AlarmClock size={15} />}>SLA de 240 min</MetaItem>
          </>
        }
        actions={
          <>
            <Button icon={<Download size={16} />}>Exportar CSV</Button>
            <Button icon={<Upload size={16} />}>Upload CSV</Button>
            <Button variant="primary" icon={<Plus size={16} />}>
              Adicionar item
            </Button>
            <Menu triggerClassName="bt-btn bt-btn-icon" items={[{ label: 'Editar fila', onSelect: () => toast.info('Editar') }, { label: 'Excluir fila', danger: true }]} />
          </>
        }
      />

      <CountStrip>
        {STATUSES.map((s) => (
          <CountTile key={s} label={itemStatus[s].label} value={formatNumber(counts[s])} color={itemColor[s]} active={tab === s} onClick={() => setTab(tab === s ? 'all' : s)} />
        ))}
        <CountTile wide label="Distribuição" value={null}>
          <StackBar segments={STATUSES.map((s) => ({ key: s, label: itemStatus[s].label, value: counts[s], color: itemColor[s] }))} />
          <span className="bt-small bt-subtle">SLA em dia</span>
        </CountTile>
      </CountStrip>

      <Card bare>
        <Tabs
          inset
          aria-label="Filtrar por status"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setOffset(0);
          }}
          tabs={[
            { id: 'all' as const, label: 'Todos', count: queueItems.length },
            ...[...STATUSES, 'deleted' as const].map((s) => ({ id: s, label: itemStatus[s].label, count: counts[s] })),
          ]}
        />
        <FilterBar>
          <SearchInput placeholder="Buscar por referência ou conteúdo" value={q} onChange={(e) => setQ(e.target.value)} />
        </FilterBar>
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          <button className="bt-btn bt-btn-sm" onClick={() => toast.success(`${selected.length} itens reenfileirados`)}>
            <RotateCcw size={14} /> Reprocessar
          </button>
          <button className="bt-btn bt-btn-sm" onClick={() => toast.error(`${selected.length} itens excluídos`)}>
            <Trash2 size={14} /> Excluir
          </button>
        </BulkBar>
        <DataTable
          aria-label="Itens da fila"
          columns={columns}
          rows={rows}
          getRowId={(it) => it.id}
          selection={{ selected, onChange: setSelected }}
          onRowClick={(it) => setOpenId(it.id)}
          activeRowId={openId}
          empty={<EmptyState compact icon={<Inbox size={22} />} title="Nenhum item" description="Nenhum item corresponde ao filtro." />}
          footer={<Pagination total={rows.length} limit={25} offset={offset} onChange={setOffset} noun="itens" />}
        />
      </Card>

      <Grid layout="2">
        <Card title="Detalhes" subtitle="KeyValue">
          <KeyValue
            items={[
              ['Fila', <span className="bt-mono">conciliacao-itens</span>],
              ['Processo', <a className="bt-link" href="#/execucao">conciliacao-bancaria</a>],
              ['Criada', '02/10/2026 12:20:59'],
              ['Retentativas', 'até 1'],
              { label: 'Oculto', value: 'não aparece', hidden: true },
            ]}
          />
        </Card>
        <Card title="Saída" subtitle="JsonView · SecretBox">
          <div className="bt-stack">
            <JsonView value={{ falhas: 0, conciliados: 1201, lote: '2026-10-02', reprocessar: false, observacao: null }} />
            <SecretBox value="orq_rt_7f3a9c2e1b8d4f6a0e5c" />
          </div>
        </Card>
      </Grid>

      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.reference ?? ''}
        description={open ? <StatusBadge status={open.status} map={itemStatus} size="sm" /> : undefined}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Fechar</Button>
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={() => toast.success('Item reenfileirado')}>
              Reprocessar
            </Button>
          </>
        }
      >
        {open && (
          <div className="bt-stack">
            <KeyValue
              items={[
                ['Prioridade', <Priority level={open.priority} />],
                ['Tentativa', open.attempt],
                ['Runner', open.runner],
                ['Job', <span className="bt-mono">{open.job}</span>],
                ['Criado', <RelativeTime value={open.created_at} />],
              ]}
            />
            <JsonView value={{ conta: open.reference.replace('conta-', ''), valor: 123.45 }} />
          </div>
        )}
      </Drawer>
    </Page>
  );
}
