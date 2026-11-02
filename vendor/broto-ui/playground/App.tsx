import {
  BookOpen,
  Boxes,
  Check,
  FlaskConical,
  FormInput,
  Gauge,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  MonitorPlay,
  MousePointerClick,
  Palette,
  Table2,
  Tags,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
import {
  AppShell,
  Brand,
  ConfirmProvider,
  ContextSwitcher,
  LinkButton,
  SidebarStatus,
  Tag,
  Toaster,
  UserMenu,
  toast,
  type NavEntry,
} from 'broto-ui';
import { DashboardPage } from './pages/Dashboard';
import { FoundationsPage } from './pages/Foundations';
import { ActionsPage } from './pages/Actions';
import { FormsPage } from './pages/Forms';
import { StatusPage } from './pages/Status';
import { DataPage } from './pages/Data';
import { ExecutionPage } from './pages/Execution';
import { FeedbackPage } from './pages/Feedback';
import { ScreensPage } from './pages/Screens';
import { GettingStartedPage } from './pages/GettingStarted';

const ROUTES: Record<string, ComponentType> = {
  '#/': DashboardPage,
  '#/comecar': GettingStartedPage,
  '#/fundamentos': FoundationsPage,
  '#/acoes': ActionsPage,
  '#/formularios': FormsPage,
  '#/status': StatusPage,
  '#/dados': DataPage,
  '#/execucao': ExecutionPage,
  '#/feedback': FeedbackPage,
  '#/telas': ScreensPage,
};

const NAV: NavEntry[] = [
  { label: 'Exemplo: dashboard', href: '#/', icon: <LayoutDashboard size={20} />, end: true },
  { label: 'Como usar', href: '#/comecar', icon: <BookOpen size={20} /> },
  { heading: 'Componentes' },
  { label: 'Fundamentos', href: '#/fundamentos', icon: <Palette size={20} /> },
  { label: 'Ações e menus', href: '#/acoes', icon: <MousePointerClick size={20} /> },
  { label: 'Formulários', href: '#/formularios', icon: <FormInput size={20} /> },
  { label: 'Status e etiquetas', href: '#/status', icon: <Tags size={20} /> },
  { label: 'Tabelas e dados', href: '#/dados', icon: <Table2 size={20} /> },
  { label: 'Execução e gráficos', href: '#/execucao', icon: <Gauge size={20} /> },
  { label: 'Feedback e overlays', href: '#/feedback', icon: <MessageSquareWarning size={20} /> },
  'divider',
  { label: 'Telas prontas', href: '#/telas', icon: <MonitorPlay size={20} /> },
];

function useHashRoute(): string {
  const read = () => (window.location.hash && ROUTES[window.location.hash.split('?')[0]!] ? window.location.hash.split('?')[0]! : '#/');
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => {
      setHash(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const ENVS = [
  { id: 'dev', name: 'Desenvolvimento', dev: true },
  { id: 'hml', name: 'Homologação', dev: false },
  { id: 'prd', name: 'Produção', dev: false },
];

export function App() {
  const route = useHashRoute();
  const [env, setEnv] = useState(ENVS[0]!);
  const PageComponent = ROUTES[route] ?? DashboardPage;

  return (
    <ConfirmProvider>
      <AppShell
        brand={<Brand name="Broto UI" />}
        brandHref="#/"
        brandLabel="Broto UI — início"
        nav={NAV}
        currentPath={route}
        sidebarFooter={<SidebarStatus live label="Catálogo de componentes" detail="v0.1.0" />}
        topbarStart={
          <ContextSwitcher
            label="Ambiente"
            value={env.name}
            icon={<Layers size={18} />}
            badge={env.dev ? <Tag variant="green">dev</Tag> : undefined}
            items={[
              { heading: 'Ambientes' },
              ...ENVS.map((e) => ({
                label: e.name,
                icon: e.id === env.id ? <Check size={16} /> : e.dev ? <FlaskConical size={16} /> : <Layers size={16} />,
                onSelect: () => {
                  setEnv(e);
                  toast.info(`Ambiente: ${e.name}`, 'Exemplo de ContextSwitcher.');
                },
              })),
            ]}
          />
        }
        topbarEnd={
          <>
            <LinkButton href="#/comecar" variant="ghost" icon={<Boxes size={16} />} className="bt-topbar-hide-md">
              Instalação
            </LinkButton>
            <UserMenu
              name="Ana Souza"
              role="Administradora"
              items={[
                { label: 'Meu perfil', icon: <UserRound size={16} />, onSelect: () => toast.info('Perfil') },
                'separator',
                { label: 'Sair', icon: <LogOut size={16} />, danger: true, onSelect: () => toast.success('Até logo!') },
              ]}
            />
          </>
        }
      >
        <PageComponent />
      </AppShell>
      <Toaster />
    </ConfirmProvider>
  );
}
