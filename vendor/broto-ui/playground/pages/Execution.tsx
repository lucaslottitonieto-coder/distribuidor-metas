import { ExternalLink, Clock, GitCommitHorizontal, Layers, Server, User, RotateCcw, Download } from 'lucide-react';
import {
  Button,
  Card,
  CopyButton,
  EventList,
  Grid,
  JsonView,
  KeyValue,
  Legend,
  LinkButton,
  LogViewer,
  MetaItem,
  Page,
  PageHeader,
  Priority,
  ProgressBar,
  SegmentBar,
  StackBar,
  StatusBadge,
  Stepper,
  Tag,
  formatTime,
  toast,
  type Step,
} from 'broto-ui';
import { jobStatus, jobs, logLines } from '../data';

const job = jobs[0]!;
const t0 = new Date(job.created_at).getTime();
const at = (s: number) => new Date(t0 + s * 1000).toISOString();

const steps: Step[] = [
  { key: 'queued', label: 'Na fila', state: 'done', meta: formatTime(at(0)) },
  { key: 'claimed', label: 'Reivindicado', state: 'done', meta: formatTime(at(4)), delta: '+4s' },
  { key: 'code', label: 'Obtendo código', state: 'done', meta: formatTime(at(7)), delta: '+3s' },
  { key: 'env', label: 'Preparando ambiente', state: 'done', meta: formatTime(at(12)), delta: '+5s' },
  { key: 'run', label: 'Executando', state: 'current', meta: 'agora' },
  { key: 'end', label: 'Finalizado', state: 'pending', meta: '—' },
];

export function ExecutionPage() {
  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Jobs', href: '#/dados' }, { label: '484f2d76' }]}
        title={job.process}
        badge={<StatusBadge status={job.status} map={jobStatus} size="lg" />}
        meta={
          <>
            <MetaItem icon={<GitCommitHorizontal size={15} />}>
              versão <Tag mono>{job.version}</Tag>
            </MetaItem>
            <MetaItem icon={<Server size={15} />}>{job.runner}</MetaItem>
            <MetaItem icon={<Layers size={15} />}>
              <span className="bt-mono">orq.global</span>
            </MetaItem>
            <Priority level={job.priority} />
            <MetaItem icon={<User size={15} />}>Manual por ana</MetaItem>
            <MetaItem icon={<Clock size={15} />}>2m 08s</MetaItem>
          </>
        }
        actions={
          <>
            <Button icon={<RotateCcw size={16} />} onClick={() => toast.success('Job reenfileirado')}>
              Reexecutar
            </Button>
            <LinkButton href="https://temporal.io" external icon={<ExternalLink size={16} />}>
              Abrir no Temporal
            </LinkButton>
          </>
        }
      />

      <Card title="Fases da execução" actions={<span className="bt-card-sub">Horários de Brasília</span>}>
        <Stepper steps={steps} />
        <EventList
          summary="Todos os eventos (7)"
          items={[
            { key: '1', time: formatTime(at(0)), title: 'Na fila' },
            { key: '2', time: formatTime(at(4)), title: 'Reivindicado', detail: 'por LINUX-RUNNER-01' },
            { key: '3', time: formatTime(at(5)), title: 'Prioridade alterada', detail: 'normal → alta' },
            { key: '4', time: formatTime(at(7)), title: 'Obtendo código' },
            { key: '5', time: formatTime(at(12)), title: 'Preparando ambiente', detail: 'cache reaproveitado' },
            { key: '6', time: formatTime(at(14)), title: 'Executando' },
          ]}
        />
      </Card>

      <Grid layout="main-side">
        <LogViewer
          live
          lines={logLines}
          streams={[{ id: 'stdout' }, { id: 'stderr' }, { id: 'sdk' }]}
          actions={
            <button type="button" className="bt-logs-icon-btn" aria-label="Baixar" title="Baixar" onClick={() => toast.info('Download dos logs')}>
              <Download size={16} />
            </button>
          }
        />
        <Card title="Detalhes">
          <KeyValue
            items={[
              ['Job', <span className="bt-row" style={{ gap: 4 }}><span className="bt-mono bt-truncate" style={{ maxWidth: 160 }}>{job.id}</span><CopyButton value={job.id} label="Copiar id" /></span>],
              ['Processo', <a className="bt-link" href="#/dados">{job.process}</a>],
              ['Subfila', <a className="bt-link" href="#/dados">conciliacao-itens</a>],
              ['Criado', '02/10/2026 12:20:59'],
              ['Início', '02/10/2026 12:20:59'],
              ['Em fila', '0s'],
              ['Tentativa', '1'],
            ]}
          />
        </Card>
      </Grid>

      <Grid layout="2">
        <Card title="Entrada" actions={<span className="bt-card-sub">Parâmetros mesclados e validados</span>}>
          <JsonView value={{ agencia: '0101', data_ref: '2026-10-02', reprocessar: false }} />
        </Card>
        <Card title="Barras" subtitle="ProgressBar · SegmentBar · StackBar · Legend">
          <div className="bt-stack">
            <ProgressBar value={64} live label="Conciliação" />
            <ProgressBar value={88} tone="warning" />
            <ProgressBar value={30} tone="danger" />
            <SegmentBar used={3} total={4} unit="slots" />
            <StackBar
              height={10}
              segments={[
                { key: 'ok', label: 'Sucesso', value: 9, color: 'var(--bt-green-700)' },
                { key: 'fail', label: 'Falha', value: 4, color: 'var(--bt-red-700)' },
                { key: 'retry', label: 'Retentado', value: 2, color: 'var(--bt-yellow-500)' },
              ]}
            />
            <Legend
              items={[
                { label: 'Sucesso', color: 'var(--bt-green-700)', value: 9 },
                { label: 'Falha', color: 'var(--bt-red-700)', value: 4 },
                { label: 'Retentado', color: 'var(--bt-yellow-500)', value: 2 },
              ]}
            />
          </div>
        </Card>
      </Grid>

      <Card title="Execução com falha" subtitle="Estados failed e halted no Stepper">
        <Stepper
          steps={[
            { key: 'a', label: 'Na fila', state: 'done', meta: '12:20:59' },
            { key: 'b', label: 'Reivindicado', state: 'done', meta: '12:21:01', delta: '+2s' },
            { key: 'c', label: 'Executando', state: 'done', meta: '12:21:03', delta: '+2s' },
            { key: 'd', label: 'Falhou', state: 'failed', meta: '12:24:10', delta: '+3m 07s' },
          ]}
        />
      </Card>
    </Page>
  );
}
