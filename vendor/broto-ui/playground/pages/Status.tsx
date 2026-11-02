import { useState } from 'react';
import { Badge, Chip, Grid, LiveDot, Page, PageHeader, Priority, StatusDot, Tag, TONES, createStatusBadge, type Tone } from 'broto-ui';
import { Demo } from '../Demo';
import { itemStatus, jobStatus, type ItemStatus } from '../data';

const JobBadge = createStatusBadge(jobStatus);
const ItemBadge = createStatusBadge(itemStatus);

const toneLabel: Record<Tone, string> = {
  pending: 'pending',
  info: 'info',
  live: 'live',
  success: 'success',
  danger: 'danger',
  neutral: 'neutral',
  dark: 'dark',
  orange: 'orange',
  brand: 'brand',
};

export function StatusPage() {
  const [filters, setFilters] = useState<ItemStatus[]>(['failed']);
  const toggle = (s: ItemStatus) => setFilters((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s]));

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Status e etiquetas' }]} title="Status e etiquetas" description="Cores de apoio aparecem aqui — em estados e pequenos elementos." />

      <Demo
        title="Badges por tom"
        description="Cada tom tem fundo, texto e ponto próprios (tokens --bt-tone-*)"
        code={`<Badge tone="live" pulse>Executando</Badge>
<Badge tone="success" size="lg">Sucesso</Badge>
<Badge tone="danger" size="sm" dot={false}>Falha</Badge>`}
      >
        <div className="bt-stack">
          <div className="pg-demo-row">
            {TONES.map((t) => (
              <Badge key={t} tone={t} pulse={t === 'live'}>
                {toneLabel[t]}
              </Badge>
            ))}
          </div>
          <div className="pg-demo-row">
            <Badge tone="success" size="sm">
              pequeno
            </Badge>
            <Badge tone="success">médio</Badge>
            <Badge tone="success" size="lg">
              grande
            </Badge>
            <Badge tone="info" dot={false}>
              sem ponto
            </Badge>
          </div>
        </div>
      </Demo>

      <Demo
        title="Estados do seu domínio"
        description="createStatusBadge cria um badge tipado a partir de um mapa estado → rótulo + tom"
        code={`
const JobBadge = createStatusBadge({
  pending:   { label: 'Pendente',   tone: 'pending' },
  running:   { label: 'Executando', tone: 'live', pulse: true },
  succeeded: { label: 'Sucesso',    tone: 'success' },
  failed:    { label: 'Falha',      tone: 'danger' },
});

<JobBadge status={job.status} />   // status tipado: 'pending' | 'running' | …`}
      >
        <div className="bt-stack">
          <div className="pg-demo-row">
            {(Object.keys(jobStatus) as (keyof typeof jobStatus)[]).map((s) => (
              <JobBadge key={s} status={s} />
            ))}
          </div>
          <div className="pg-demo-row">
            {(Object.keys(itemStatus) as ItemStatus[]).map((s) => (
              <ItemBadge key={s} status={s} size="sm" />
            ))}
          </div>
        </div>
      </Demo>

      <Grid layout="2">
        <Demo
          title="Etiquetas"
          code={`<Tag>ETL</Tag>  <Tag variant="green">dev</Tag>  <Tag mono>1.0.0</Tag>
<Tag display variant="solid">RPA</Tag>  <Tag display variant="outline">ETL</Tag>`}
        >
          <div className="pg-demo-row">
            <Tag>financeiro</Tag>
            <Tag variant="green">dev</Tag>
            <Tag mono>1.0.0</Tag>
            <Tag mono>orq.global</Tag>
            <Tag display variant="solid">
              RPA
            </Tag>
            <Tag display variant="outline">
              ETL
            </Tag>
          </div>
        </Demo>

        <Demo title="Prioridade e pontos" code={`<Priority level="high" />  <StatusDot tone="danger" title="Offline" />  <LiveDot on />`}>
          <div className="pg-demo-row">
            <Priority level="high" />
            <Priority level="normal" />
            <Priority level="low" />
            <span className="bt-divider-v" style={{ height: 20 }} />
            <StatusDot tone="live" pulse title="Online" />
            <StatusDot tone="danger" title="Offline" />
            <StatusDot tone="pending" title="Drenando" />
            <span className="bt-row bt-small bt-muted">
              <LiveDot /> ao vivo
            </span>
            <span className="bt-row bt-small bt-muted">
              <LiveDot on={false} /> conectando
            </span>
          </div>
        </Demo>
      </Grid>

      <Demo
        title="Chips de filtro"
        description="Multi-seleção; quando selecionado assume as cores do tom"
        code={`<Chip tone="danger" pressed={sel.includes('failed')} onPressedChange={() => toggle('failed')} count={4}>Falha</Chip>`}
      >
        <div className="pg-demo-row">
          {(['new', 'in_progress', 'successful', 'failed', 'abandoned', 'retried'] as ItemStatus[]).map((s, i) => (
            <Chip key={s} tone={itemStatus[s].tone} pressed={filters.includes(s)} onPressedChange={() => toggle(s)} count={[0, 0, 9, 4, 0, 2][i]}>
              {itemStatus[s].label}
            </Chip>
          ))}
        </div>
      </Demo>
    </Page>
  );
}
