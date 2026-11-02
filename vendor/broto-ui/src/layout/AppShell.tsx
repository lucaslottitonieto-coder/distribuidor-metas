import { useState, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconChevronDown, IconPanelLeftClose, IconPanelLeftOpen } from '../internal/icons';
import { useLabels, useUI } from '../provider';
import { readStorage, useIsomorphicLayoutEffect, writeStorage } from '../utils/hooks';
import { LiveDot } from '../components/Badge';
import { Menu, type MenuEntry } from '../components/Menu';
import { Avatar } from '../components/Misc';

export interface NavItem {
  key?: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Força o estado ativo. Sem isso, compara href com currentPath. */
  active?: boolean;
  /** Ativo só quando currentPath === href (sem considerar subrotas). */
  end?: boolean;
  /** Contador à direita (ex.: pendências). */
  badge?: ReactNode;
  hidden?: boolean;
}

export type NavEntry = NavItem | 'divider' | { heading: string };

function isItem(e: NavEntry): e is NavItem {
  return typeof e === 'object' && 'label' in e;
}

function matches(href: string | undefined, path: string | undefined, end?: boolean): boolean {
  if (!href || path === undefined) return false;
  const clean = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
  // Rotas em hash (#/rota) são comparadas pelo hash; as demais, sem query string nem hash.
  const strip = (s: string) => (s.startsWith('#') ? s.split('?')[0]! : s.split(/[?#]/)[0]!);
  const h = clean(strip(href));
  const p = clean(strip(path));
  if (end) return p === h;
  return p === h || (h !== '/' && h !== '#/' && p.startsWith(`${h}/`));
}

export interface AppShellProps {
  /** Normalmente <Brand name="…" />. O nome some quando a barra recolhe. */
  brand: ReactNode;
  brandHref?: string;
  brandLabel?: string;
  nav: NavEntry[];
  /** Caminho atual, para marcar o item ativo (ex.: location.pathname). */
  currentPath?: string;
  /** Rodapé da barra lateral (ex.: <SidebarStatus />). */
  sidebarFooter?: ReactNode;
  /** Conteúdo da barra superior logo após o botão de recolher (ex.: <ContextSwitcher />). */
  topbarStart?: ReactNode;
  /** Conteúdo à direita da barra superior (links, <UserMenu />). */
  topbarEnd?: ReactNode;
  /** Remove a barra superior. */
  hideTopbar?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Chave do localStorage para lembrar a barra recolhida; null desliga. */
  storageKey?: string | null;
  /** id do <main>, alvo do link "pular para o conteúdo". */
  contentId?: string;
  children: ReactNode;
}

/** Estrutura do app: barra lateral verde escura recolhível, barra superior translúcida e área de conteúdo. */
export function AppShell({
  brand,
  brandHref = '/',
  brandLabel,
  nav,
  currentPath,
  sidebarFooter,
  topbarStart,
  topbarEnd,
  hideTopbar,
  collapsed: collapsedProp,
  defaultCollapsed,
  onCollapsedChange,
  storageKey = 'bt.sidebarCollapsed',
  contentId = 'conteudo',
  children,
}: AppShellProps) {
  const labels = useLabels();
  const { Link } = useUI();
  // Começa igual no servidor e no cliente; a preferência salva (ou a largura da tela) é aplicada antes da pintura.
  const [inner, setInner] = useState<boolean>(defaultCollapsed ?? false);
  const collapsed = collapsedProp ?? inner;

  useIsomorphicLayoutEffect(() => {
    if (collapsedProp !== undefined) return;
    const saved = storageKey ? readStorage(storageKey) : null;
    if (saved !== null) setInner(saved === '1');
    else if (defaultCollapsed === undefined && window.innerWidth < 1200) setInner(true);
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setInner(next);
    if (storageKey && collapsedProp === undefined) writeStorage(storageKey, next ? '1' : '0');
    onCollapsedChange?.(next);
  };

  // O link de pular não altera o hash (não quebra roteadores em hash): só move o foco.
  const skip = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(contentId);
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.scrollIntoView({ block: 'start' });
  };

  const entries = nav.filter((e) => !(isItem(e) && e.hidden));

  return (
    <>
      <a className="bt-skip-link" href={`#${contentId}`} onClick={skip}>
        {labels.skipToContent}
      </a>
      <div className={cx('bt-app', collapsed && 'bt-collapsed')}>
        <aside className="bt-sidebar" aria-label={labels.mainNavigation}>
          <Link href={brandHref} className="bt-sidebar-brand" aria-label={brandLabel}>
            {brand}
          </Link>
          <nav className="bt-sidebar-nav">
            {entries.map((entry, i) => {
              if (entry === 'divider') return <div key={`d-${i}`} className="bt-nav-divider" role="separator" />;
              if (!isItem(entry)) {
                return (
                  <div key={`h-${i}`} className="bt-nav-heading">
                    {entry.heading}
                  </div>
                );
              }
              const active = entry.active ?? matches(entry.href, currentPath, entry.end);
              const content = (
                <>
                  {entry.icon}
                  <span className="bt-nav-label">{entry.label}</span>
                  {entry.badge !== undefined && <span className="bt-nav-badge">{entry.badge}</span>}
                </>
              );
              const common = {
                className: cx('bt-nav-link', active && 'bt-active'),
                title: collapsed ? entry.label : undefined,
                'aria-current': active ? ('page' as const) : undefined,
              };
              const key = entry.key ?? entry.href ?? entry.label;
              return entry.href ? (
                <Link key={key} href={entry.href} onClick={entry.onClick} {...common}>
                  {content}
                </Link>
              ) : (
                <button key={key} type="button" onClick={entry.onClick} {...common}>
                  {content}
                </button>
              );
            })}
          </nav>
          {sidebarFooter && <div className="bt-sidebar-foot">{sidebarFooter}</div>}
        </aside>
        <div className="bt-main">
          {!hideTopbar && (
            <header className="bt-topbar">
              <button
                type="button"
                className="bt-btn bt-btn-ghost bt-btn-icon"
                onClick={toggle}
                aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
                title={collapsed ? labels.expandSidebar : labels.collapseSidebar}
              >
                {collapsed ? <IconPanelLeftOpen size={20} /> : <IconPanelLeftClose size={20} />}
              </button>
              {topbarStart}
              <div className="bt-topbar-spacer" />
              {topbarEnd}
            </header>
          )}
          <main id={contentId} className="bt-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

/** Rodapé da barra lateral: ponto "ao vivo" + texto + versão. */
export function SidebarStatus({ live = true, label, detail }: { live?: boolean; label: ReactNode; detail?: ReactNode }) {
  return (
    <>
      <LiveDot on={live} />
      <span className="bt-sidebar-foot-text">
        {label}
        {detail && <span className="bt-sidebar-version">{detail}</span>}
      </span>
    </>
  );
}

export interface ContextSwitcherProps {
  /** Rótulo pequeno acima do valor (ex.: "Namespace", "Empresa"). */
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  /** Etiqueta ao lado do valor (ex.: <Tag variant="green">dev</Tag>). */
  badge?: ReactNode;
  items: MenuEntry[];
  'aria-label'?: string;
  minWidth?: number;
}

/** Seletor de contexto da barra superior, em forma de box, que abre um menu. */
export function ContextSwitcher({ label, value, icon, badge, items, minWidth = 280, ...aria }: ContextSwitcherProps) {
  return (
    <Menu
      align="start"
      label={aria['aria-label'] ?? (typeof label === 'string' ? `Trocar ${label.toLowerCase()}` : undefined)}
      triggerClassName="bt-switcher"
      minWidth={minWidth}
      trigger={
        <>
          {icon && (
            <span className="bt-switcher-icon" aria-hidden>
              {icon}
            </span>
          )}
          <span className="bt-switcher-text">
            <span className="bt-switcher-label">{label}</span>
            <span className="bt-switcher-value">{value}</span>
          </span>
          {badge}
          <IconChevronDown size={16} className="bt-icon-muted" />
        </>
      }
      items={items}
    />
  );
}

export interface UserMenuProps {
  name: string;
  /** Linha abaixo do nome (papel, e-mail). */
  role?: ReactNode;
  avatarSrc?: string;
  /** Conteúdo no topo do menu (padrão: nome + papel). */
  header?: ReactNode;
  items: MenuEntry[];
  minWidth?: number;
}

/** Avatar + nome + papel, que abre o menu do usuário. */
export function UserMenu({ name, role, avatarSrc, header, items, minWidth = 260 }: UserMenuProps) {
  return (
    <Menu
      label="Menu do usuário"
      triggerClassName="bt-user-btn"
      minWidth={minWidth}
      trigger={
        <>
          <Avatar name={name} src={avatarSrc} />
          <span className="bt-user-text">
            <span className="bt-user-name">{name}</span>
            {role && <span className="bt-user-role">{role}</span>}
          </span>
          <IconChevronDown size={16} className="bt-icon-muted" />
        </>
      }
      header={
        header ?? (
          <>
            <div className="bt-strong">{name}</div>
            {role && <div className="bt-small bt-subtle">{role}</div>}
          </>
        )
      }
      items={items}
    />
  );
}
