# Broto UI

Biblioteca de componentes React com uma identidade visual verde: o **box** (retângulo com o canto superior esquerdo reto e os outros três arredondados), títulos em **Exo 2** itálico, interface em **Nunito** e ícones de linha fina.

Nasceu do console do Orquestrador e foi separada para ser usada em qualquer projeto React: sem dependências além do React, sem router obrigatório e com CSS prefixado (`.bt-*`, `--bt-*`) para não colidir com o que já existe no seu app.

- **60+ componentes**: botões, campos, badges de status, KPIs, tabelas com seleção, abas, diálogos, gaveta, menu, avisos, confirmação, etapas, painel de logs, gráfico de barras, layout completo (barra lateral + barra superior), login e telas de status.
- **Acessível**: foco preso em diálogos, Esc fecha, navegação por setas em menus e abas, `aria-*` ligados automaticamente em `<Field>`.
- **TypeScript**, ESM + CJS, `"use client"` para Next.js App Router.
- **Textos em pt-BR** por padrão (substituíveis), datas no fuso `America/Sao_Paulo`.

---

## Instalação

A lib ainda não está no npm. Escolha uma das formas:

```bash
# 1) Direto do GitHub — o build roda na instalação (script "prepare")
npm install github:edumartinsrib/broto-ui

# 2) A partir da pasta local, empacotando antes
cd broto-ui
npm install
npm pack                       # gera broto-ui-0.1.0.tgz
cd ../meu-app
npm install ../broto-ui/broto-ui-0.1.0.tgz
```

> Evite `npm install ../broto-ui` (link simbólico): o pacote linkado enxerga o próprio `node_modules/react` e o app acaba com **duas cópias do React** ("Invalid hook call"). Se precisar do link para desenvolver a lib junto com o app, adicione no Vite do app `resolve: { dedupe: ['react', 'react-dom'] }`.

Requisitos: React 18.2+ ou 19.

## Configuração

```tsx
// main.tsx
import 'broto-ui/fonts.css';   // opcional: Exo 2 + Nunito do Google Fonts
import 'broto-ui/styles.css';  // tokens + reset + componentes

import { createRoot } from 'react-dom/client';
import { ConfirmProvider, Toaster, UIProvider } from 'broto-ui';
import { RouterLink } from './RouterLink';

createRoot(document.getElementById('root')!).render(
  <UIProvider linkComponent={RouterLink}>
    <ConfirmProvider>
      <App />
      <Toaster />
    </ConfirmProvider>
  </UIProvider>,
);
```

| Arquivo CSS | Conteúdo |
| --- | --- |
| `broto-ui/styles.css` | Tudo: tokens + reset global + componentes. O jeito mais simples. |
| `broto-ui/tokens.css` | Só as variáveis `--bt-*`. |
| `broto-ui/base.css` | Reset e base tipográfica (`body`, `h1`–`h4`, `a`, `:focus-visible`). |
| `broto-ui/components.css` | Só os componentes (`.bt-*`). |
| `broto-ui/fonts.css` | `@import` das fontes no Google Fonts. |

**O projeto já tem um reset (Tailwind, Bootstrap…)?** Importe `tokens.css` + `components.css` e envolva a área da lib com `className="bt-root"` para aplicar fonte e cor do texto.

**Sem acesso ao Google Fonts** (rede corporativa, offline)? Hospede as fontes você mesmo:

```bash
npm install @fontsource-variable/exo-2 @fontsource-variable/nunito
```

```ts
import '@fontsource-variable/exo-2';
import '@fontsource-variable/exo-2/wght-italic.css';
import '@fontsource-variable/nunito';
```

e defina `--bt-font-display: 'Exo 2 Variable', sans-serif; --bt-font-ui: 'Nunito Variable', sans-serif;` no seu CSS.

### Integração com o router

Os componentes que navegam (barra lateral, trilha, KPIs, menus, `LinkButton`, `CellLink`) recebem `href` e usam o `linkComponent` do `<UIProvider>`. Sem provider, usam `<a>` comum.

```tsx
// react-router — o Link espera "to"
import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router';

export const RouterLink = forwardRef<HTMLAnchorElement, Omit<LinkProps, 'to'> & { href: string }>(
  ({ href, ...rest }, ref) => <Link ref={ref} to={href} {...rest} />,
);
```

```tsx
// Next.js — next/link já aceita href
import NextLink from 'next/link';
<UIProvider linkComponent={NextLink}>…</UIProvider>
```

### Next.js (App Router) e SSR

- O pacote principal é marcado com `"use client"`: use os componentes em arquivos de cliente (ou dentro deles).
- Funções puras — formatação, `cx`, `buttonClass`, `toneColor` — também saem por **`broto-ui/utils`**, sem `"use client"`, para usar em Server Components.
- No servidor, `RelativeTime` mostra a data absoluta e troca para "há 3 min" depois da hidratação; `AppShell` aplica a barra recolhida salva só no cliente. Não há aviso de hidratação.

```tsx
// app/jobs/page.tsx (Server Component)
import { formatDateTime } from 'broto-ui/utils';
```

## Exemplo

```tsx
import { AppShell, Brand, Button, Card, DataTable, Grid, Kpi, Page, PageHeader, SidebarStatus, UserMenu, createStatusBadge, toast } from 'broto-ui';
import { Activity, LayoutDashboard, ListChecks, Plus } from 'lucide-react';
import { useLocation } from 'react-router';

const JobBadge = createStatusBadge({
  pending: { label: 'Pendente', tone: 'pending' },
  running: { label: 'Executando', tone: 'live', pulse: true },
  succeeded: { label: 'Sucesso', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
});

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <AppShell
      brand={<Brand name="Meu Produto" />}
      currentPath={pathname}
      nav={[
        { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} />, end: true },
        { label: 'Jobs', href: '/jobs', icon: <ListChecks size={20} /> },
      ]}
      sidebarFooter={<SidebarStatus live label="Tempo real ativo" detail="v1.0.0" />}
      topbarEnd={<UserMenu name="Ana Souza" role="Administradora" items={[{ label: 'Sair', onSelect: logout }]} />}
    >
      {children}
    </AppShell>
  );
}

export function JobsPage({ jobs }: { jobs: Job[] }) {
  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Início', href: '/' }, { label: 'Jobs' }]}
        title="Jobs"
        description="Execuções dos últimos 7 dias."
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => toast.success('Job criado')}>Novo job</Button>}
      />
      <Grid layout="kpi">
        <Kpi variant="featured" icon={<Activity size={18} />} label="Em execução" value={3} foot={['1 preparando', '2 na fila']} />
      </Grid>
      <Card title="Execuções" flush>
        <DataTable
          rows={jobs}
          getRowId={(j) => j.id}
          columns={[
            { key: 'name', header: 'Processo', cell: (j) => j.process },
            { key: 'status', header: 'Status', cell: (j) => <JobBadge status={j.status} /> },
          ]}
        />
      </Card>
    </Page>
  );
}
```

## Componentes

O catálogo completo, com exemplos vivos e o código de cada um, roda com `npm run dev` (veja [Desenvolvimento](#desenvolvimento)).

| Grupo | Componentes |
| --- | --- |
| **Estrutura** | `AppShell`, `SidebarStatus`, `ContextSwitcher`, `UserMenu`, `Page`, `PageHeader`, `MetaItem`, `Section`, `Grid`, `Hero`, `LivePill`, `Lanes`, `Brand`, `BoxMark` |
| **Telas** | `AuthLayout`, `AuthCard`, `FullScreen`, `FullScreenLoader`, `StatusCard`, `NotFound`, `PageLoading` |
| **Ações** | `Button`, `IconButton`, `LinkButton`, `TextButton`, `ButtonGroup`, `buttonClass()`, `Menu` |
| **Formulários** | `Field`, `FormGrid`, `FormSection`, `Input`, `SearchInput`, `Select`, `Textarea`, `Switch`, `Checkbox`, `Radio`, `Segmented`, `TagInput`, `JsonTextarea`, `Dropzone` |
| **Status** | `Badge`, `StatusBadge`, `createStatusBadge()`, `StatusDot`, `LiveDot`, `Tag`, `Chip`, `Priority` |
| **Superfícies e indicadores** | `Card` (+ `CardHeader`, `CardBody`, `CardFooter`), `IconTile`, `Kpi`, `CountTile`, `CountStrip`, `MetricList`, `ProgressBar`, `SegmentBar`, `StackBar`, `Legend` |
| **Dados** | `DataTable`, `Table`, `SkeletonRows`, `CellTitle`, `CellLink`, `Pagination`, `TableFooter`, `FilterBar`, `BulkBar`, `Tabs`, `TabPanel`, `KeyValue`, `CodeBlock`, `JsonView`, `InlineCode`, `CopyButton`, `SecretBox` |
| **Execução e gráficos** | `Stepper`, `EventList`, `LogViewer`, `StackedBarChart`, `RelativeTime`, `Duration` |
| **Sobreposições** | `Dialog` (+ `DialogBody`, `DialogFooter`, `DialogSpacer`), `Drawer`, `Modal`, `ConfirmProvider` + `useConfirm()`, `Toaster` + `toast` |
| **Feedback** | `Spinner`, `EmptyState`, `ErrorState`, `Skeleton`, `SkeletonBlock`, `Callout`, `Avatar`, `Stack`, `Divider` |
| **Utilitários** | `formatNumber`, `formatDateTime`, `formatDate`, `formatTime`, `formatRelative`, `formatDuration`, `initials`, `shortId`, `pluralize`, `useNow`, `useDebounced`, `useElementWidth`, `useDocumentTitle`, `copyToClipboard`, `parseJson`, `prettyJson`, `cx` |

### Estados do seu domínio

Os tons (`pending`, `info`, `live`, `success`, `danger`, `neutral`, `dark`, `orange`, `brand`) carregam a semântica visual; o seu domínio só diz qual tom cada estado usa:

```tsx
const ItemBadge = createStatusBadge({
  new: { label: 'Novo', tone: 'info' },
  in_progress: { label: 'Em andamento', tone: 'live' },
  successful: { label: 'Sucesso', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  abandoned: { label: 'Abandonado', tone: 'orange' },
});

<ItemBadge status={item.status} />   // status é tipado pelas chaves do mapa
```

Para barras e gráficos, `toneColor[tone]` devolve a cor sólida de cada tom.

### Avisos e confirmação

```tsx
toast.success('Item criado', 'Na fila conciliacao-itens.');
toast.error('Falha ao salvar', { details: ['nome: obrigatório'] });   // funciona fora do React

const confirm = useConfirm();
const { confirmed, reason } = await confirm({
  title: 'Parar este job?',
  confirmLabel: 'Parar job',
  reason: { label: 'Motivo', required: true },
});
```

### Ícones

A lib desenha os poucos ícones que usa internamente. Para os ícones do seu app, a recomendação é o [lucide-react](https://lucide.dev), que segue o mesmo desenho de linha fina e cantos arredondados:

```tsx
import { Workflow } from 'lucide-react';
<Kpi icon={<Workflow size={18} />} … />
```

## Tema

Tudo sai de variáveis CSS. Redefina os tokens semânticos num seletor seu, depois do import da lib:

```css
:root {
  --bt-primary: #146e37;          /* botão primário */
  --bt-primary-hover: #0a4b1e;
  --bt-sidebar-bg: #0d5a26;       /* barra lateral */
  --bt-title: #0a4b1e;            /* títulos */
  --bt-page-max-w: 1280px;        /* largura máxima do conteúdo */
  --bt-sidebar-w: 232px;
}
```

A paleta, a tipografia e as regras de uso do box estão em [docs/identidade-visual.md](docs/identidade-visual.md).

## Textos

Os textos de interface (Fechar, Carregando, Página 1 de 3, …) estão em pt-BR. Para trocar, passe só o que mudar:

```tsx
<UIProvider labels={{ close: 'Close', loading: 'Loading', pageOf: (p, n) => `Page ${p} of ${n}` }}>
```

## Desenvolvimento

```bash
npm install
npm run dev          # catálogo em http://localhost:5180 (lê direto de src/, recarrega ao salvar)
npm run build        # dist/: index.js (ESM), index.cjs, index.d.ts e os CSS
npm run typecheck
npm run build:playground            # catálogo estático em playground/dist
SINGLE=1 npm run build:playground   # catálogo num único index.html
```

Estrutura:

```
src/
  components/   botões, campos, badges, tabela, diálogos, logs, gráfico…
  layout/       AppShell, PageHeader, Hero, login, telas de status, marca
  styles/       tokens.css, base.css e o CSS dos componentes (prefixo bt-)
  utils/        formatação pt-BR, hooks, JSON, clipboard
  provider.tsx  UIProvider (linkComponent e textos)
playground/     catálogo (Vite) com exemplos de todos os componentes
```

## Licença

MIT
