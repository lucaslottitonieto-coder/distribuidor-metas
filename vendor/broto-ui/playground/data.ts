// Dados de exemplo do catálogo.
import type { StatusMap } from 'broto-ui';

export type JobStatus = 'pending' | 'preparing' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'stopped';
export type ItemStatus = 'new' | 'in_progress' | 'successful' | 'failed' | 'abandoned' | 'retried' | 'deleted';

export const jobStatus: StatusMap<JobStatus> = {
  pending: { label: 'Pendente', tone: 'pending' },
  preparing: { label: 'Preparando', tone: 'info' },
  running: { label: 'Executando', tone: 'live', pulse: true },
  succeeded: { label: 'Sucesso', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
  stopped: { label: 'Parado', tone: 'dark' },
};

export const itemStatus: StatusMap<ItemStatus> = {
  new: { label: 'Novo', tone: 'info' },
  in_progress: { label: 'Em andamento', tone: 'live' },
  successful: { label: 'Sucesso', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  abandoned: { label: 'Abandonado', tone: 'orange' },
  retried: { label: 'Retentado', tone: 'pending' },
  deleted: { label: 'Excluído', tone: 'neutral' },
};

export const itemColor: Record<ItemStatus, string> = {
  new: 'var(--bt-blue-500)',
  in_progress: 'var(--bt-green-500)',
  successful: 'var(--bt-green-700)',
  failed: 'var(--bt-red-700)',
  abandoned: 'var(--bt-orange-600)',
  retried: 'var(--bt-yellow-500)',
  deleted: 'var(--bt-neutral-400)',
};

const now = Date.now();
const ago = (s: number) => new Date(now - s * 1000).toISOString();

export interface Job {
  id: string;
  process: string;
  version: string;
  type: 'rpa' | 'etl';
  status: JobStatus;
  runner: string;
  priority: 'high' | 'normal' | 'low';
  origin: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export const jobs: Job[] = [
  { id: '484f2d76-c286-4361-842b-1a2b3c4d5e6f', process: 'conciliacao-bancaria', version: '1.0.0', type: 'rpa', status: 'running', runner: 'LINUX-RUNNER-01', priority: 'high', origin: 'Manual', created_at: ago(140), started_at: ago(128), finished_at: null },
  { id: '7a540e3a-1111-4c22-9d3e-0f1e2d3c4b5a', process: 'extrato-diario', version: '2.3.1', type: 'etl', status: 'running', runner: 'LINUX-RUNNER-02', priority: 'normal', origin: 'Agendamento', created_at: ago(420), started_at: ago(400), finished_at: null },
  { id: '3aa15e77-2222-4c22-9d3e-0f1e2d3c4b5a', process: 'fechamento-caixa', version: '0.9.4', type: 'rpa', status: 'preparing', runner: 'WIN-RUNNER-01', priority: 'normal', origin: 'Fila de trabalho', created_at: ago(35), started_at: null, finished_at: null },
  { id: '2f2fe7dc-3333-4c22-9d3e-0f1e2d3c4b5a', process: 'carga-cadastro', version: '1.4.0', type: 'etl', status: 'pending', runner: '—', priority: 'low', origin: 'API', created_at: ago(18), started_at: null, finished_at: null },
  { id: '9c1d3b2a-4444-4c22-9d3e-0f1e2d3c4b5a', process: 'conciliacao-bancaria', version: '1.0.0', type: 'rpa', status: 'succeeded', runner: 'LINUX-RUNNER-01', priority: 'normal', origin: 'Agendamento', created_at: ago(3900), started_at: ago(3880), finished_at: ago(3700) },
  { id: '5e6f7a8b-5555-4c22-9d3e-0f1e2d3c4b5a', process: 'extrato-diario', version: '2.3.1', type: 'etl', status: 'failed', runner: 'LINUX-RUNNER-02', priority: 'high', origin: 'Manual', created_at: ago(7600), started_at: ago(7590), finished_at: ago(7420) },
  { id: '1b2c3d4e-6666-4c22-9d3e-0f1e2d3c4b5a', process: 'fechamento-caixa', version: '0.9.4', type: 'rpa', status: 'stopped', runner: 'WIN-RUNNER-01', priority: 'normal', origin: 'Manual', created_at: ago(9800), started_at: ago(9790), finished_at: ago(9500) },
];

export interface QueueItem {
  id: string;
  reference: string;
  status: ItemStatus;
  priority: 'high' | 'normal' | 'low';
  attempt: number;
  runner: string;
  job: string;
  created_at: string;
  error: string | null;
  retried?: boolean;
}

const refs = ['56cf9d', '87660', '43456', '47052', '65127', '87660', '36047', '34316', '47951', '64195', '43456', '56562', '75170', '60264', '47959'];
const st: ItemStatus[] = ['successful', 'failed', 'failed', 'successful', 'successful', 'retried', 'successful', 'successful', 'successful', 'failed', 'retried', 'successful', 'successful', 'failed', 'successful'];
const pr: QueueItem['priority'][] = ['normal', 'low', 'low', 'normal', 'high', 'low', 'high', 'normal', 'high', 'normal', 'low', 'high', 'normal', 'normal', 'normal'];

export const queueItems: QueueItem[] = refs.map((r, i) => ({
  id: `item-${i}`,
  reference: i === 0 ? `conta-ui-${r}` : `conta-${r}`,
  status: st[i]!,
  priority: pr[i]!,
  attempt: i === 1 || i === 2 ? 1 : 0,
  runner: 'LINUX-RUNNER-01',
  job: i % 2 ? '3aa15e77' : '7a540e3a',
  created_at: ago(i === 0 ? 2 : 16 + i),
  error:
    st[i] === 'failed' || st[i] === 'retried'
      ? i % 3 === 0
        ? `Negócio: valor negativo na conta ${r}`
        : 'Aplicação: valor acima do limite do lote (5000)'
      : null,
  retried: i === 1 || i === 2,
}));

export const timeline = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(now - (23 - i) * 3_600_000);
  d.setMinutes(0, 0, 0);
  const wave = Math.round(6 + 5 * Math.sin(i / 3.2) + (i % 5));
  return {
    hour: d.toISOString(),
    succeeded: i < 3 ? 0 : wave,
    failed: i % 7 === 3 ? 2 : i % 9 === 5 ? 1 : 0,
  };
});

export const logLines = [
  { ts: ago(128), stream: 'sdk', text: 'job reivindicado por LINUX-RUNNER-01 (tentativa 1)' },
  { ts: ago(127.5), stream: 'sdk', text: 'login no portal https://portal.homologacao.exemplo como robo01 (senha ***)' },
  { ts: ago(127.2), stream: 'stdout', text: 'data de referência 2026-10-02, agência 0101' },
  { ts: ago(120), stream: 'stdout', text: 'baixando extrato: 1.284 lançamentos' },
  { ts: ago(96), stream: 'stderr', level: 'warning', text: 'lançamento 0193 sem histórico; usando descrição padrão' },
  { ts: ago(80), stream: 'stdout', text: 'conciliados 1.201 de 1.284' },
  { ts: ago(62), stream: 'stderr', level: 'error', text: 'Falha ao abrir comprovante 77812: timeout após 30s' },
  { ts: ago(40), stream: 'stdout', text: 'reprocessando 83 pendentes em lote' },
  { ts: ago(12), stream: 'sdk', text: 'item conta-87660 marcado como sucesso' },
];
