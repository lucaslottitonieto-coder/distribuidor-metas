import { Download, ExternalLink, Pencil, Play, Plus, RotateCcw, Square, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonGroup, Grid, IconButton, LinkButton, Menu, Page, PageHeader, TextButton, buttonClass, toast } from 'broto-ui';
import { Demo } from '../Demo';

export function ActionsPage() {
  const [loading, setLoading] = useState(false);
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Ações e menus' }]} title="Ações e menus" description="Botões, links com cara de botão e menus suspensos." />

      <Demo
        title="Variantes"
        description="primary para a ação principal da tela (uma só); secondary é o padrão"
        code={`
<Button variant="primary" icon={<Plus size={16} />}>Adicionar item</Button>
<Button icon={<Upload size={16} />}>Upload CSV</Button>
<Button variant="ghost">Cancelar</Button>
<Button variant="danger">Excluir</Button>
<Button variant="ghost-danger" icon={<Trash2 size={16} />}>Remover</Button>
<Button variant="primary" loading>Salvando</Button>`}
      >
        <div className="pg-demo-row">
          <Button variant="primary" icon={<Plus size={16} />}>
            Adicionar item
          </Button>
          <Button icon={<Upload size={16} />}>Upload CSV</Button>
          <Button icon={<Download size={16} />}>Exportar CSV</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger" icon={<Square size={14} />}>
            Parar job
          </Button>
          <Button variant="ghost-danger" icon={<Trash2 size={16} />}>
            Remover
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => {
                setLoading(false);
                toast.success('Salvo', 'O loading troca o ícone por um spinner.');
              }, 1400);
            }}
          >
            {loading ? 'Salvando…' : 'Clique: loading'}
          </Button>
          <Button disabled>Desabilitado</Button>
        </div>
      </Demo>

      <Grid layout="2">
        <Demo title="Tamanhos" code={`<Button size="sm">…</Button>  <Button>…</Button>  <Button size="lg">…</Button>`}>
          <div className="pg-demo-row">
            <Button size="sm" variant="primary">
              Pequeno
            </Button>
            <Button variant="primary">Médio</Button>
            <Button size="lg" variant="primary" icon={<Play size={18} />}>
              Grande
            </Button>
          </div>
        </Demo>

        <Demo
          title="Somente ícone"
          description="label vira aria-label e title"
          code={`<IconButton label="Editar" icon={<Pencil size={16} />} />
<IconButton label="Reexecutar" variant="secondary" icon={<RotateCcw size={16} />} />`}
        >
          <div className="pg-demo-row">
            <IconButton label="Editar" icon={<Pencil size={16} />} />
            <IconButton label="Reexecutar" variant="secondary" icon={<RotateCcw size={16} />} />
            <IconButton label="Excluir" variant="ghost-danger" icon={<Trash2 size={16} />} />
            <IconButton label="Executar" variant="primary" size="sm" icon={<Play size={14} />} />
          </div>
        </Demo>
      </Grid>

      <Grid layout="2">
        <Demo
          title="Links"
          description="LinkButton usa o linkComponent do <UIProvider> (seu router)"
          code={`
<LinkButton href="/jobs" variant="primary">Ver jobs</LinkButton>
<LinkButton href="https://…" external icon={<ExternalLink size={16} />}>Abrir no Temporal</LinkButton>
<TextButton onClick={…}>limpar filtros</TextButton>

// Em um <Link> do seu router, use só as classes:
<Link to="/jobs" className={buttonClass('primary', 'sm')}>Ver jobs</Link>`}
        >
          <div className="pg-demo-row">
            <LinkButton href="#/dados" variant="primary">
              Ver jobs
            </LinkButton>
            <LinkButton href="https://temporal.io" external icon={<ExternalLink size={16} />}>
              Abrir no Temporal
            </LinkButton>
            <span className="bt-muted">
              Nenhum resultado — <TextButton onClick={() => toast.info('Filtros limpos')}>limpar filtros</TextButton>
            </span>
            <a className={buttonClass('ghost', 'sm')} href="#/">
              buttonClass()
            </a>
          </div>
        </Demo>

        <Demo
          title="Menu"
          description="Setas, Home/End e Esc; itens podem ser links, perigosos ou desabilitados"
          code={`
<Menu items={[
  { label: 'Editar', icon: <Pencil size={16} />, onSelect: edit },
  { label: 'Reexecutar', icon: <RotateCcw size={16} />, onSelect: retry },
  'separator',
  { label: 'Excluir', icon: <Trash2 size={16} />, danger: true, onSelect: remove },
]} />`}
        >
          <ButtonGroup>
            <Menu
              items={[
                { label: 'Editar', icon: <Pencil size={16} />, onSelect: () => toast.info('Editar') },
                { label: 'Reexecutar', icon: <RotateCcw size={16} />, onSelect: () => toast.success('Job reenfileirado') },
                { label: 'Abrir no Temporal', icon: <ExternalLink size={16} />, href: 'https://temporal.io', external: true },
                { label: 'Indisponível', disabled: true },
                'separator',
                { label: 'Excluir', icon: <Trash2 size={16} />, danger: true, onSelect: () => toast.error('Excluído') },
              ]}
            />
            <Menu
              label="Exportar"
              triggerClassName={buttonClass('secondary')}
              trigger={
                <>
                  <Download size={16} /> Exportar
                </>
              }
              align="start"
              items={[{ heading: 'Formato' }, { label: 'CSV', onSelect: () => toast.success('CSV gerado') }, { label: 'JSON', onSelect: () => toast.success('JSON gerado') }]}
            />
          </ButtonGroup>
        </Demo>
      </Grid>
    </Page>
  );
}
