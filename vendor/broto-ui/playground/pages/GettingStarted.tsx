import { Card, Callout, CodeBlock, Grid, Page, PageHeader, Section } from 'broto-ui';

const install = `# 1) direto do GitHub (o build roda no install, via "prepare")
npm install github:edumartinsrib/broto-ui

# 2) ou de uma pasta local, empacotando antes
cd broto-ui && npm install && npm pack          # gera broto-ui-0.1.0.tgz
cd ../meu-app && npm install ../broto-ui/broto-ui-0.1.0.tgz`;

const setup = `// main.tsx
import 'broto-ui/fonts.css';   // opcional: Exo 2 + Nunito do Google Fonts
import 'broto-ui/styles.css';  // tokens + reset + componentes

import { ConfirmProvider, Toaster, UIProvider } from 'broto-ui';

createRoot(root).render(
  <UIProvider linkComponent={RouterLink}>
    <ConfirmProvider>
      <App />
      <Toaster />
    </ConfirmProvider>
  </UIProvider>,
);`;

const router = `// react-router: a lib passa "href"; o Link do router espera "to"
import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router';

export const RouterLink = forwardRef<HTMLAnchorElement, Omit<LinkProps, 'to'> & { href: string }>(
  ({ href, ...rest }, ref) => <Link ref={ref} to={href} {...rest} />,
);

// Next.js: next/link já aceita href
import NextLink from 'next/link';
<UIProvider linkComponent={NextLink}>…</UIProvider>`;

const shell = `import { AppShell, Brand, Page, PageHeader, SidebarStatus, UserMenu } from 'broto-ui';
import { LayoutDashboard, ListChecks } from 'lucide-react';

<AppShell
  brand={<Brand name="Meu Produto" />}
  currentPath={location.pathname}
  nav={[
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} />, end: true },
    { label: 'Jobs', href: '/jobs', icon: <ListChecks size={20} /> },
    'divider',
    { heading: 'Administração' },
  ]}
  sidebarFooter={<SidebarStatus live label="Tempo real ativo" detail="v1.2.0" />}
  topbarEnd={<UserMenu name="Ana Souza" role="Administradora" items={[{ label: 'Sair', onSelect: logout }]} />}
>
  <Page>
    <PageHeader title="Jobs" description="Execuções dos últimos 7 dias." />
    …
  </Page>
</AppShell>`;

const theme = `/* Tema: redefina tokens semânticos num seletor seu */
:root {
  --bt-primary: #146e37;
  --bt-sidebar-bg: #0d5a26;
  --bt-page-max-w: 1280px;
}`;

export function GettingStartedPage() {
  return (
    <Page>
      <PageHeader crumbs={[{ label: 'Broto UI', href: '#/' }, { label: 'Como usar' }]} title="Como usar" description="Instalação, CSS, integração com o router e tema." />

      <Grid layout="2">
        <Card title="1. Instalar">
          <CodeBlock>{install}</CodeBlock>
        </Card>
        <Card title="2. Importar o CSS e os providers">
          <CodeBlock>{setup}</CodeBlock>
        </Card>
      </Grid>

      <Grid layout="2">
        <Card title="3. Ligar ao seu router" subtitle="Navegação, trilha, KPIs e menus usam esse componente">
          <CodeBlock>{router}</CodeBlock>
        </Card>
        <Card title="4. Montar a tela">
          <CodeBlock>{shell}</CodeBlock>
        </Card>
      </Grid>

      <Section title="Tema e convivência com outro CSS">
        <Grid layout="2">
          <Card title="Tokens">
            <CodeBlock>{theme}</CodeBlock>
          </Card>
          <Card title="Sem conflitos">
            <div className="bt-stack-sm">
              <Callout tone="info" title="Tudo com prefixo">
                Classes <code>.bt-*</code> e variáveis <code>--bt-*</code>: não colidem com Tailwind, Bootstrap ou o CSS do seu projeto.
              </Callout>
              <Callout tone="warning" title="Reset opcional">
                <code>styles.css</code> inclui um reset global (body, h1–h4, links). Se o projeto já tem o seu, importe <code>tokens.css</code> +{' '}
                <code>components.css</code> e use <code>className="bt-root"</code> num contêiner para aplicar fonte e cor.
              </Callout>
            </div>
          </Card>
        </Grid>
      </Section>
    </Page>
  );
}
