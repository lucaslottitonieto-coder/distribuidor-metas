import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ElementType,
  type ReactNode,
  type Ref,
} from 'react';

/**
 * Componente de link usado pela lib (navegação, trilha, KPIs, menus).
 * Recebe `href` e as props de <a>. Com react-router, adapte `href` → `to`;
 * com Next.js, `next/link` já serve como está.
 */
export type LinkComponentProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type LinkComponent = ElementType<LinkComponentProps>;

/** Forma usada internamente (aceita ref). */
type InternalLink = ComponentType<LinkComponentProps & { ref?: Ref<HTMLAnchorElement> }>;

/** Textos padrão da interface (pt-BR). Sobrescreva parcialmente via <UIProvider labels>. */
export interface UILabels {
  close: string;
  loading: string;
  copy: string;
  copied: string;
  copyFailed: string;
  copyFailedHint: string;
  moreActions: string;
  previousPage: string;
  nextPage: string;
  pageOf: (page: number, pages: number) => string;
  rangeOf: (from: string, to: string, total: string, noun: string) => string;
  records: string;
  required: string;
  expandSidebar: string;
  collapseSidebar: string;
  skipToContent: string;
  breadcrumb: string;
  mainNavigation: string;
  confirm: string;
  back: string;
  reasonRequired: string;
  jsonValid: string;
  jsonFormat: string;
  jsonExpectObject: string;
  jsonExpectArray: string;
  dismiss: string;
  removeTag: (tag: string) => string;
  retry: string;
  noData: string;
  selectAll: string;
  selectRow: string;
  selected: (n: number) => string;
  live: string;
  logsFilter: string;
  logsWrap: string;
  logsFollow: string;
  logsScrollEnd: string;
  logsLines: (shown: number, total: number) => string;
  logsEmpty: string;
  logsNoMatch: string;
  logsWaiting: string;
  dropzoneTitle: string;
  dropzoneHint: string;
}

export const defaultLabels: UILabels = {
  close: 'Fechar',
  loading: 'Carregando',
  copy: 'Copiar',
  copied: 'Copiado',
  copyFailed: 'Não foi possível copiar',
  copyFailedHint: 'Selecione o texto e copie manualmente.',
  moreActions: 'Mais ações',
  previousPage: 'Página anterior',
  nextPage: 'Próxima página',
  pageOf: (page, pages) => `Página ${page} de ${pages}`,
  rangeOf: (from, to, total, noun) => `${from}–${to} de ${total} ${noun}`,
  records: 'registros',
  required: 'obrigatório',
  expandSidebar: 'Expandir menu lateral',
  collapseSidebar: 'Recolher menu lateral',
  skipToContent: 'Pular para o conteúdo',
  breadcrumb: 'Trilha',
  mainNavigation: 'Navegação principal',
  confirm: 'Confirmar',
  back: 'Voltar',
  reasonRequired: 'Informe o motivo.',
  jsonValid: 'JSON válido',
  jsonFormat: 'Formatar',
  jsonExpectObject: 'Esperado um objeto JSON: {"chave": "valor"}.',
  jsonExpectArray: 'Esperada uma lista JSON: [1, 2].',
  dismiss: 'Fechar aviso',
  removeTag: (tag) => `Remover ${tag}`,
  retry: 'Tentar de novo',
  noData: 'Sem dados.',
  selectAll: 'Selecionar todos',
  selectRow: 'Selecionar linha',
  selected: (n) => (n === 1 ? '1 selecionado' : `${n} selecionados`),
  live: 'ao vivo',
  logsFilter: 'Filtrar linhas',
  logsWrap: 'Quebrar linhas',
  logsFollow: 'Rolar junto',
  logsScrollEnd: 'Ir para o fim',
  logsLines: (shown, total) => (shown === total ? `${shown} linhas` : `${shown} de ${total} linhas`),
  logsEmpty: 'Nenhuma linha registrada.',
  logsNoMatch: 'Nenhuma linha corresponde ao filtro.',
  logsWaiting: 'Aguardando as primeiras linhas…',
  dropzoneTitle: 'Arraste um arquivo ou clique para escolher',
  dropzoneHint: '',
};

/** Link padrão: um <a> comum. */
const AnchorLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function AnchorLink(props, ref) {
  return <a ref={ref} {...props} />;
}) as unknown as InternalLink;

interface UIContextValue {
  Link: InternalLink;
  labels: UILabels;
}

const UIContext = createContext<UIContextValue>({ Link: AnchorLink, labels: defaultLabels });

export interface UIProviderProps {
  /** Componente de link do seu router (ver README). Padrão: <a>. */
  linkComponent?: LinkComponent;
  /** Textos da interface; o que não for informado usa o padrão pt-BR. */
  labels?: Partial<UILabels>;
  children: ReactNode;
}

/** Configuração opcional da lib. Sem ele, os componentes usam <a> e textos em pt-BR. */
export function UIProvider({ linkComponent, labels, children }: UIProviderProps) {
  const value = useMemo<UIContextValue>(
    () => ({ Link: (linkComponent as InternalLink | undefined) ?? AnchorLink, labels: { ...defaultLabels, ...labels } }),
    [linkComponent, labels],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  return useContext(UIContext);
}

export function useLabels(): UILabels {
  return useContext(UIContext).labels;
}
