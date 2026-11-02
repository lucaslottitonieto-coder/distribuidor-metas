import { Activity, AlarmClock, CircleCheck, CircleX, Hourglass, Inbox, PartyPopper, Play, Server, ShieldCheck } from 'lucide-react';
import {
  Card,
  CellTitle,
  DataTable,
  Duration,
  EmptyState,
  Grid,
  Hero,
  InlineCode,
  Kpi,
  Legend,
  LinkButton,
  LivePill,
  MetricList,
  Page,
  Priority,
  RelativeTime,
  SegmentBar,
  StackedBarChart,
  StatusBadge,
  Tag,
  formatHour,
  formatNumber,
  type Column,
} from 'broto-ui';
import { jobStatus, jobs, timeline, type Job } from '../data';

const active = jobs.filter((j) => ['running', 'preparing', 'pending'].includes(j.status));

const columns: Column<Job>[] = [
  { key: 'process', header: 'Processo', cell: (j) => <CellTitle title={j.process} sub={`v${j.version} · ${j.origin}`} /> },
  { key: 'type', header: 'Tipo', cell: (j) => <Tag display variant={j.type === 'rpa' ? 'solid' : 'outline'}>{j.type.toUpperCase()}</Tag> },
  { key: 'status', header: 'Status', cell: (j) => <StatusBadge status={j.status} map={jobStatus} /> },
  { key: 'priority', header: 'Prioridade', cell: (j) => <Priority level={j.priority} /> },
  { key: 'runner', header: 'Runner', cell: (j) => <span className="bt-strong">{j.runner}</span> },
  { key: 'created', header: 'Criado', cell: (j) => <RelativeTime value={j.created_at} /> },
  { key: 'duration', header: 'Duração', align: 'right', cell: (j) => <Duration start={j.started_at} end={j.finished_at} /> },
];

export function DashboardPage() {
  const succeeded = timeline.reduce((a, p) => a + p.succeeded, 0);
  const failed = timeline.reduce((a, p) => a + p.failed, 0);

  return (
    <Page>
      <Hero
        eyebrow="Desenvolvimento"
        title="Visão geral"
        description={
          <>
            Exemplo de dashboard montado só com componentes da lib. A fila global é <InlineCode>orq.global</InlineCode>.
          </>
        }
        actions={
          <>
            <LivePill>Ao vivo</LivePill>
            <LinkButton href="#/execucao" variant="hero" icon={<Play size={16} />}>
              Executar processo
            </LinkButton>
          </>
        }
      />

      <Grid layout="kpi-row" cols={6}>
        <Kpi variant="featured" href="#/execucao" icon={<Activity size={18} />} label="Em execução" value={2} foot={['1 preparando', '1 na fila']} />
        <Kpi href="#/dados" icon={<CircleCheck size={18} />} label="Sucesso em 24h" value={formatNumber(succeeded)} foot="96,4% dos finalizados" />
        <Kpi variant="danger" href="#/dados" icon={<CircleX size={18} />} label="Falhas em 24h" value={failed} foot={['1 parado', '0 cancelados']} />
        <Kpi icon={<Server size={18} />} label="Runners online" value={3} unit="de 4" foot={<SegmentBar used={3} total={6} unit="slots" />} />
        <Kpi icon={<Hourglass size={18} />} label="Backlog nas filas" value={1} foot={<span>maior: <span className="bt-mono">orq.global</span></span>} />
        <Kpi variant="alert" icon={<AlarmClock size={18} />} label="SLA em risco" value={2} foot="itens vencidos ou vencendo em 2h" />
      </Grid>

      <Grid layout="main-side">
        <Card
          title="Jobs concluídos por hora"
          subtitle="Últimas 24 horas, horário de Brasília"
          actions={
            <Legend
              items={[
                { label: 'Sucesso', color: 'var(--bt-green-500)', value: formatNumber(succeeded) },
                { label: 'Falha', color: 'var(--bt-red-700)', value: formatNumber(failed) },
              ]}
            />
          }
        >
          <StackedBarChart
            aria-label="Jobs concluídos por hora nas últimas 24 horas"
            series={[
              { key: 'succeeded', label: 'Com sucesso', color: 'var(--bt-green-500)' },
              { key: 'failed', label: 'Com falha', color: 'var(--bt-red-700)' },
            ]}
            data={timeline.map((p) => ({
              label: formatHour(p.hour),
              title: `${formatHour(p.hour)} às ${formatHour(new Date(new Date(p.hour).getTime() + 3_600_000))}`,
              values: { succeeded: p.succeeded, failed: p.failed },
            }))}
            labelEvery={3}
          />
        </Card>
        <Card title="Backlog por fila" subtitle="Jobs aguardando um runner livre">
          <MetricList
            items={[
              { key: 'g', title: <span className="bt-mono">orq.global</span>, sub: 'Fila global, 3 runners escutando', value: 1, progress: 20 },
              { key: 'w', title: <span className="bt-mono">orq.windows</span>, sub: 'Runners Windows, 1 escutando', value: 0, progress: 0 },
            ]}
          />
        </Card>
      </Grid>

      <Card title="Em execução agora" subtitle="Atualizado em tempo real" actions={<LinkButton href="#/dados" variant="ghost" size="sm">Ver todos os jobs ativos</LinkButton>} flush>
        <DataTable columns={columns} rows={active} getRowId={(j) => j.id} aria-label="Jobs em execução" />
      </Card>

      <Grid layout="2">
        <Card title="Falhas recentes" subtitle="Últimos jobs que terminaram com erro" actions={<LinkButton href="#/dados" variant="ghost" size="sm">Ver falhas</LinkButton>}>
          <EmptyState compact icon={<ShieldCheck size={22} />} title="Nenhuma falha recente" description="Os últimos jobs terminaram bem." />
        </Card>
        <Card title="Itens com SLA vencendo" subtitle="Prazo nas próximas 2 horas ou já vencido" actions={<LinkButton href="#/dados" variant="ghost" size="sm">Ver filas</LinkButton>}>
          <EmptyState compact icon={<Inbox size={22} />} title="Tudo dentro do prazo" description="Nenhum item com SLA em risco agora." />
        </Card>
      </Grid>

      <Card title="Nada em execução" subtitle="Estado vazio de uma lista em tempo real">
        <EmptyState icon={<PartyPopper size={24} />} title="Nada em execução agora" description="Os jobs aparecem aqui assim que entram na fila ou um runner os reivindica." />
      </Card>
    </Page>
  );
}
