# broto-ui — visão geral e pendências para uso

> Versão **0.1.0** · situação em 04/10/2026 · pasta `0005-work-home/broto-ui`

## 1. O que é

A **broto-ui** é uma biblioteca de componentes React que reproduz o padrão visual do console do Orquestrador, em forma reutilizável por qualquer outro projeto React.

- **Sem dependências** além de `react` e `react-dom` (18.2+ ou 19).
- **Sem router obrigatório**: os links passam por um adaptador configurado uma vez (`UIProvider`).
- **CSS isolado**: classes `.bt-*` e variáveis `--bt-*`, para conviver com Tailwind, Bootstrap ou o CSS do projeto.
- **Textos em pt-BR** e datas no fuso `America/Sao_Paulo` por padrão.

A identidade visual (paleta verde, Exo 2 + Nunito, o *box* com um canto reto, as raias decorativas) está descrita em [identidade-visual.md](identidade-visual.md).

---

## 2. O que está pronto

### Entradas do pacote

| Importação | Conteúdo | Tamanho (gzip) |
| --- | --- | --- |
| `broto-ui` | Componentes, hooks e utilitários (ESM + CJS + tipos, marcado `"use client"`) | 26 KB |
| `broto-ui/utils` | Funções puras para Server Components: formatação, `cx`, `buttonClass`, `toneColor` | 2 KB |
| `broto-ui/styles.css` | Tokens + reset global + componentes | 13 KB |
| `broto-ui/tokens.css` · `base.css` · `components.css` | As mesmas partes, separadas | — |
| `broto-ui/fonts.css` | `@import` do Google Fonts (opcional) | — |

### Componentes

103 componentes exportados (contando subcomponentes como `CardHeader` e `DialogBody`):

| Grupo | Principais |
| --- | --- |
| Estrutura | `AppShell` (barra lateral recolhível + barra superior), `PageHeader`, `Section`, `Grid`, `Hero`, `ContextSwitcher`, `UserMenu`, `Brand`/`BoxMark` |
| Telas prontas | `AuthLayout`/`AuthCard` (login), `NotFound`, `StatusCard`, `FullScreenLoader` |
| Ações | `Button`, `IconButton`, `LinkButton`, `Menu` |
| Formulários | `Field` (liga rótulo, dica e erro), `Input`, `SearchInput`, `Select`, `Textarea`, `Switch`, `Checkbox`, `Radio`, `Segmented`, `TagInput`, `JsonTextarea`, `Dropzone` |
| Status | `Badge`, `createStatusBadge` (mapeia estados do domínio para tons), `Tag`, `Chip`, `Priority`, `LiveDot` |
| Indicadores | `Kpi`, `CountTile`, `MetricList`, `ProgressBar`, `SegmentBar`, `StackBar`, `Legend` |
| Dados | `DataTable` (seleção, linha ativa, linha expandida, vazio, carregando), `Pagination`, `FilterBar`, `BulkBar`, `Tabs`, `KeyValue`, `JsonView`, `CodeBlock`, `SecretBox` |
| Execução | `Stepper`, `EventList`, `LogViewer`, `StackedBarChart`, `RelativeTime`, `Duration` |
| Sobreposições | `Dialog`, `Drawer`, `ConfirmProvider` + `useConfirm()`, `Toaster` + `toast` |
| Feedback | `EmptyState`, `ErrorState`, `Callout`, `Skeleton`, `Spinner` |

### Repositório

```
src/          código da lib (components/, layout/, styles/, utils/, provider.tsx)
playground/   catálogo com exemplo vivo e código de cada componente (npm run dev)
docs/         identidade visual, screenshots e este documento
scripts/      geração dos CSS publicados
broto-ui-0.1.0.tgz   pacote pronto para instalar (gerado a partir do código atual)
```

---

## 3. Como usar em outro projeto (resumo)

1. **Instalar**: `npm install ../broto-ui/broto-ui-0.1.0.tgz`, ou pelo GitHub depois de publicado (seção 5.1).
2. **Importar o CSS** uma vez: `import 'broto-ui/styles.css'`.
3. **Envolver o app** com `<UIProvider linkComponent={RouterLink}>`, `<ConfirmProvider>` e `<Toaster />`.
4. **Escrever o adaptador de link** do router (6 linhas; modelos para react-router e Next.js no README).

Detalhes completos, exemplos e tema: [README](../README.md).

---

## 4. O que foi verificado

| Verificação | Resultado |
| --- | --- |
| Tipos da lib e do catálogo (`tsc --noEmit`) | ✅ sem erros |
| Build ESM + CJS + `.d.ts` + CSS | ✅ |
| Instalação do `.tgz` num app novo — **React 19** + react-router 7 + Vite 7 | ✅ tipos (com `skipLibCheck: false`), build, SSR e hidratação sem avisos |
| O mesmo app com **React 18** | ✅ |
| Interações no navegador: foco preso e devolvido em diálogos, Esc, menu → confirmação, seleção em lote, clique dentro de diálogo não vaza para a linha da tabela | ✅ |
| Layout em celular (390 px), todas as páginas do catálogo | ✅ sem rolagem horizontal |
| Comparação visual com os prints do console original | ✅ dashboard, fila e detalhe de job equivalentes |
| Revisão de código independente | 14 problemas encontrados (SSR, foco, rolagem travada, acessibilidade) — todos corrigidos e retestados |

**Não verificado ainda:** app Next.js real (só tipos e SSR via Vite), navegadores Firefox e Safari (testes só em Chromium), leitores de tela, tabelas com milhares de linhas.

> Os testes acima foram feitos com scripts temporários, **fora do repositório**. Eles não ficam na pasta e não rodam sozinhos — ver 5.2.

---

## 5. Pendências

### 5.1 Antes do primeiro uso

- [ ] **Instalar e gerar o build na sua máquina.** A pasta foi copiada sem `node_modules` e sem `dist/`.
  ```bash
  cd broto-ui
  npm install        # também roda o build (script "prepare")
  npm run dev        # catálogo em http://localhost:5180
  ```
- [ ] **Criar o repositório e publicar no GitHub.**
  ```bash
  git init && git add . && git commit -m "broto-ui 0.1.0"
  git branch -M main
  git remote add origin git@github.com:SEU_USUARIO/broto-ui.git
  git push -u origin main
  git tag v0.1.0 && git push --tags
  ```
  `.gitignore` já exclui `node_modules/`, `dist/` e `*.tgz`.
- [ ] **Trocar `SEU_USUARIO`** no README pelo usuário real do GitHub.
- [ ] **Preencher os metadados** no `package.json` (`author`, `repository`, `homepage`, `bugs`) e o titular da licença em `LICENSE` (hoje: "os autores do broto-ui").
- [ ] **Escolher a forma de distribuição:**

  | Forma | Comando no app | Prós | Contras |
  | --- | --- | --- | --- |
  | Arquivo `.tgz` | `npm install ../broto-ui/broto-ui-0.1.0.tgz` | Funciona hoje, sem publicar nada | Precisa rodar `npm pack` e reinstalar a cada mudança |
  | GitHub com tag | `npm install github:SEU_USUARIO/broto-ui#v0.1.0` | Versão fixa, sem conta no npm | A instalação compila a lib (mais lenta e baixa as devDependencies) |
  | npm público | `npm install broto-ui` | Mais simples para quem consome | Exige conta e `npm publish`; o nome estava livre em 04/10/2026 |

  Sugestão: GitHub com tag enquanto a lib muda com frequência; npm quando a API estabilizar.
- [ ] **Confirmar que a identidade visual pode ser usada publicamente.** A paleta, as fontes e o grafismo do box vieram do console do Orquestrador. Se houver alguma restrição de uso fora do trabalho, troque as cores em `src/styles/tokens.css` (escala `--bt-green-*`) e o raio do box (`--bt-radius-box*`). Tudo está centralizado ali.
- [ ] **Fontes em rede restrita.** Se o Google Fonts for bloqueado, hospede as fontes com `@fontsource-variable/exo-2` e `@fontsource-variable/nunito` (passo a passo no README). Exo 2 e Nunito têm licença OFL, livre para uso.
- [ ] **Escrever o `RouterLink`** em cada app (modelos no README). Sem ele, os links da lib recarregam a página em vez de navegar pelo router.

### 5.2 Qualidade e manutenção (antes de outros projetos dependerem da lib)

- [ ] **Testes automatizados no repositório**: Vitest + Testing Library para comportamento (Dialog, Menu, DataTable, Field, toast); Playwright para regressão visual do catálogo.
- [ ] **CI no GitHub Actions**: `typecheck`, `build`, testes e `npm pack` a cada push.
- [ ] **Lint e formatação**: ESLint (com `react-hooks` e `jsx-a11y`) e Prettier. Hoje só há o `tsc`.
- [ ] **Versionamento**: semver + `CHANGELOG.md` (manual ou com Changesets), uma tag por versão.
- [ ] **Acessibilidade**: rodar axe no catálogo e testar com leitor de tela (Orca no Linux, NVDA no Windows).
- [ ] **Navegadores**: testar em Firefox e Safari.
- [ ] **Next.js real**: montar um app de exemplo com App Router para validar `"use client"` e `broto-ui/utils` na prática.
- [ ] **Publicar o catálogo** (GitHub Pages) com `SINGLE=1 npm run build:playground`.
- [ ] **Regenerar o `.tgz`** (`npm pack`) sempre que mudar o código. O arquivo na pasta reflete a versão de 04/10/2026.

### 5.3 Limitações conhecidas (backlog)

| Tema | Situação hoje | Sugestão |
| --- | --- | --- |
| Tema com outra cor de marca | O CSS dos componentes referencia a escala `--bt-green-*` diretamente em 115 pontos, contra 26 usos de tokens semânticos (`--bt-primary`, `--bt-title`…) | Criar mais tokens semânticos (`--bt-accent-*`, `--bt-selected-bg`…) para que trocar a marca seja redefinir poucas variáveis |
| Modo escuro | Não existe (o console original também não tem) | Bloco `[data-theme="dark"]` em `tokens.css`, depois da tarefa acima |
| Textos fixos em pt-BR | Fora do `UIProvider` ficam: rótulos de prioridade (Alta/Normal/Baixa), estados lidos pelo leitor de tela no `Stepper`, "Menu do usuário", "Trocar …" do `ContextSwitcher`, "Copiar JSON", "Progresso"/"Ocupação", padrões de `ErrorState`/`NotFound`/`FullScreenLoader`, e as frases de `formatRelative` ("há 3 min") | Mover tudo para `labels` do `UIProvider` (a maioria já aceita prop) |
| `DataTable` | Sem ordenação por coluna, sem redimensionar e sem virtualização | Ordenação controlada (`sort`, `onSortChange`); para listas grandes, paginar no servidor |
| Componentes ausentes | Tooltip (usa `title` nativo), Popover genérico, Combobox/autocomplete, Select com busca/multiseleção, DatePicker (usa `<input type="datetime-local">`), Accordion | Adicionar conforme a demanda dos projetos |
| Gráficos | Só barras empilhadas (`StackedBarChart`) | Para linha/pizza, usar uma lib de gráficos com as cores dos tokens (`toneColor`) |
| CSS | Um arquivo único (~13 KB gzip) | Suficiente por ora; dividir por componente só se o tamanho pesar |
| Adaptadores de router | Cada app escreve o seu `RouterLink` | Exportar adaptadores prontos (`broto-ui/react-router`) |
| `Menu` | Fecha ao rolar a página; sem busca por digitação | Reposicionar em vez de fechar; typeahead |
| Avisos (`toast`) | Uma instância por página (store global) | Suficiente para apps comuns |

### 5.4 Decisões em aberto

- **Nome final.** `broto-ui` e o prefixo `bt-` estão em todo o CSS e no código. Trocar depois exige localizar e substituir em todo o projeto, então vale decidir antes de outros apps adotarem.
- **Migrar o console do Orquestrador para a lib.** Hoje o `orq-console` continua com o próprio CSS e os próprios componentes. Sem migração, os dois vão divergir com o tempo. Migrar deixa uma fonte única do visual, ao custo de refatorar as telas do console.
- **Onde publicar** (seção 5.1): GitHub ou npm.

---

## 6. Referências

- [README](../README.md): instalação, configuração, exemplos, tema e textos
- [identidade-visual.md](identidade-visual.md): paleta, tons de status, tipografia e regras do box
- [CHANGELOG.md](../CHANGELOG.md)
- Catálogo: `npm run dev` → http://localhost:5180
