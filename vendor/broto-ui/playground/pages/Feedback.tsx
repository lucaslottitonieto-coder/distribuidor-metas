import { Inbox, PanelRight, Square } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Callout,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Grid,
  KeyValue,
  Page,
  PageHeader,
  Skeleton,
  SkeletonBlock,
  Spinner,
  toast,
  useConfirm,
} from 'broto-ui';
import { Demo } from '../Demo';

export function FeedbackPage() {
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Feedback e overlays' }]} title="Feedback e overlays" description="Avisos, confirmações, diálogos, gavetas, estados vazios e carregamento." />

      <Grid layout="2">
        <Demo
          title="Avisos (toasts)"
          description="Funcionam fora do React: chame toast.* em interceptors, mutations…"
          code={`
// uma vez, perto da raiz:
<Toaster />

toast.success('Item criado', 'Na fila conciliacao-itens.');
toast.error('Falha ao salvar', { details: ['nome: obrigatório', 'sla: deve ser > 0'] });
toast.info('Exportação iniciada');
toast.warning('Runner drenando');`}
        >
          <div className="pg-demo-row">
            <Button onClick={() => toast.success('Item criado', 'Na fila conciliacao-itens.')}>Sucesso</Button>
            <Button onClick={() => toast.error('Falha ao salvar', { details: ['nome: obrigatório', 'sla_minutes: deve ser maior que 0'] })}>Erro</Button>
            <Button onClick={() => toast.info('Exportação iniciada', 'Você recebe o arquivo em instantes.')}>Info</Button>
            <Button onClick={() => toast.warning('Runner drenando', 'Não recebe novos jobs.')}>Atenção</Button>
          </div>
        </Demo>

        <Demo
          title="Confirmação"
          description="useConfirm() devolve uma promise; pode pedir motivo"
          code={`
const confirm = useConfirm();   // requer <ConfirmProvider>
const { confirmed, reason } = await confirm({
  title: 'Parar este job?',
  description: 'O robô recebe o sinal e encerra no próximo ponto seguro.',
  confirmLabel: 'Parar job',
  reason: { label: 'Motivo', required: true },
});`}
        >
          <div className="pg-demo-row">
            <Button
              variant="danger"
              icon={<Square size={14} />}
              onClick={async () => {
                const r = await confirm({
                  title: 'Parar este job?',
                  description: 'O robô recebe o sinal e encerra no próximo ponto seguro.',
                  confirmLabel: 'Parar job',
                  reason: { label: 'Motivo', placeholder: 'ex.: dados de entrada errados', required: true },
                });
                if (r.confirmed) toast.success('Job parado', `Motivo: ${r.reason}`);
              }}
            >
              Parar job
            </Button>
            <Button
              onClick={async () => {
                const r = await confirm({ title: 'Publicar versão 1.1.0?', tone: 'primary', confirmLabel: 'Publicar' });
                if (r.confirmed) toast.success('Versão publicada');
              }}
            >
              Confirmação simples
            </Button>
          </div>
        </Demo>
      </Grid>

      <Grid layout="2">
        <Demo title="Diálogo e gaveta" code={`<Dialog open={open} onClose={close} title="…" footer={…}>…</Dialog>\n<Drawer open={open} onClose={close} title="…">…</Drawer>`}>
          <div className="pg-demo-row">
            <Button onClick={() => setDialog(true)}>Abrir diálogo</Button>
            <Button icon={<PanelRight size={16} />} onClick={() => setDrawer(true)}>
              Abrir gaveta
            </Button>
          </div>
        </Demo>
        <Demo title="Carregando" code={`<Spinner />  <Skeleton width={120} />  <SkeletonBlock lines={3} />`}>
          <div className="bt-stack">
            <div className="pg-demo-row">
              <Spinner />
              <Skeleton width={160} />
              <Skeleton width={60} height={28} />
            </div>
            <SkeletonBlock lines={3} />
          </div>
        </Demo>
      </Grid>

      <Demo
        title="Alertas em linha"
        code={`<Callout tone="warning" title="2 linhas recusadas" items={['linha 4: conta vazia', …]}>Corrija e envie de novo.</Callout>`}
      >
        <div className="bt-stack">
          <Callout tone="info" title="Modo de desenvolvimento">
            A API identifica você pelo cabeçalho <code>X-User</code>. Em produção, o login usa SSO.
          </Callout>
          <Callout tone="success" title="15 itens criados">
            Todas as linhas foram aceitas.
          </Callout>
          <Callout tone="warning" title="13 itens criados" items={['linha 4: conta vazia', 'linha 9: valor não é número']}>
            2 linhas foram recusadas. Corrija e envie só essas linhas de novo.
          </Callout>
          <Callout tone="danger" title="Manifesto inválido" items={['entrypoint: obrigatório', 'params.agencia: tipo desconhecido "texto"']} />
        </div>
      </Demo>

      <Grid layout="2">
        <Card title="Estado vazio">
          <EmptyState icon={<Inbox size={24} />} title="Nenhuma fila ainda" description="Filas guardam itens para os robôs processarem em lote." action={<Button variant="primary">Criar fila</Button>} />
        </Card>
        <Card title="Erro ao carregar">
          <ErrorState error={new Error('A API não respondeu em 30 s.')} onRetry={() => toast.info('Tentando de novo…')} />
        </Card>
      </Grid>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Novo agendamento"
        description="Executa o processo nos horários definidos."
        footer={
          <>
            <Button onClick={() => setDialog(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setDialog(false)}>
              Salvar
            </Button>
          </>
        }
      >
        <p className="bt-muted">Conteúdo do diálogo. O foco fica preso aqui, Esc fecha e o foco volta para o botão que abriu.</p>
      </Dialog>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="conta-87660" description="Item da fila conciliacao-itens" footer={<Button onClick={() => setDrawer(false)}>Fechar</Button>}>
        <KeyValue items={[['Status', 'Falha'], ['Tentativa', 1], ['Erro', 'Aplicação: valor acima do limite do lote (5000)']]} />
      </Drawer>
    </Page>
  );
}
