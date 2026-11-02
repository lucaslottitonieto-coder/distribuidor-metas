# Distribuidor de Metas

Sistema local implementado em **React + TypeScript**, com **API Python/FastAPI**, persistência **SQLite** e componentes reais da **Broto UI**. Os dados iniciais vêm da planilha fornecida. O arquivo Excel original não é alterado.

## Abrir

As dependências já foram instaladas neste computador. Abra **`iniciar.cmd`**, ou execute:

```powershell
npm start
```

- Sistema: http://127.0.0.1:5173
- API documentada: http://127.0.0.1:8765/docs
- Saúde da API: http://127.0.0.1:8765/api/health

O inicializador inicia front-end e API, verifica portas em uso e encerra os processos que iniciou ao receber Ctrl+C. Ele nunca encerra outro serviço para liberar uma porta. As portas 5173 e 8765 ficam restritas a este computador.

## O que está implementado

| Módulo | Recursos |
| --- | --- |
| Visão geral | Indicadores reais da API, gráfico mensal por produto, filtros de agência e ano, validações e acesso às metas. |
| Agências | Cadastro, edição, regional, responsável e inativação. A regional é obrigatória e aparece acima do nome da agência; há filtro por regional na lista. Uma nova agência recebe os subprodutos ativos, 12 meses e carteiras padrão automaticamente. |
| Meta por Agência | Matriz com todas as agências, produtos e subprodutos, filtros, origem, 12 meses e total anual. Cada regional aparece primeiro, em verde, com a soma de suas agências por subproduto (percentuais não são somados); clique na regional, ou na seta do cabeçalho, para expandir as agências. As regionais começam recolhidas, e abertas quando há filtro de regional ou agência. A coluna Produto vem antes do Subproduto e pode ser escondida no botão Ocultar produto (a escolha fica salva no navegador). Um clique no valor abre a edição do mês; o menu do subproduto permite editar todos os meses ou a sazonalidade. |
| Meta por Carteira | Matriz anual com o total da agência em verde e as carteiras abaixo, com segmento, gestor, objetivo e percentual por mês. Os percentuais podem ser ocultados. Clique em um objetivo ou percentual para distribuir o mês. |
| Sazonalidade | Percentuais mensais por subproduto e ano, divisão igual, total de 100% e prévia por agência. Salvar abre um card para guardar apenas o padrão (digite SALVAR) ou salvar e aplicar às agências escolhidas (digite APLICAR). Todas as agências disponíveis começam marcadas; é possível desmarcar quaisquer agências ou escolher somente uma. |
| Carteiras | Cadastro, edição, responsável, segmento, participação sugerida, filtros e inativação com proteção dos valores já atribuídos. |
| Parametrizações | Regionais, produtos e subprodutos, unidades, segmentos, cores, carteiras padrão, conexão com a API e fechamentos mensais. |
| Relatórios | Consolidação por agência/subproduto e exportação CSV (colunas Produto e Subproduto) com percentuais, metas mensais, carteiras e responsáveis. |
| Histórico | Eventos persistidos, filtros por agência e paginação. A API disponibiliza os valores anteriores e posteriores. |
| Metas do ano | Criação das metas de um novo ano para uma agência, com cópia opcional dos valores do ano anterior. Não há plano, rascunho, validação mensal nem publicação: o que foi carregado já é a meta e pode ser editado nos meses abertos. |

## Fechamentos mensais

Em **Parametrizações › Fechamentos**, selecione o ano no topo e feche cada mês individualmente. O fechamento vale para todas as agências daquele ano: janeiro fechado não impede ajustes em fevereiro ou em outro mês aberto.

- Metas mensais, valores e percentuais por carteira e percentuais de sazonalidade dos meses fechados ficam bloqueados na interface e na API. O banco também impede inserir, atualizar ou excluir meses e distribuições fechados.
- Redistribuir o anual ou aplicar sazonalidade reserva os valores fechados e distribui somente o saldo nos meses abertos, conservando centavos e unidades. Aplicar percentuais de carteiras a todos os meses afeta apenas os abertos. As prévias seguem a mesma regra.
- Salvar apenas o total anual e importar Excel exigem todos os meses abertos, pois essas operações zeram a distribuição existente. Cadastros compartilhados que alterariam o histórico fechado (agências, regionais, produtos, carteiras e segmentos vinculados) também são protegidos. Novas metas não podem ser criadas em um ano com meses fechados.
- Fechar ou reabrir exige responsável, justificativa e a palavra **FECHAR** ou **REABRIR**. A aba exibe a data e o responsável pelo último fechamento, além do histórico paginado de todas as operações. Reabrir preserva o registro do fechamento anterior.
- O responsável é **informado pelo operador**, pois este ambiente local ainda não possui login. O nome não constitui uma identidade autenticada. Cada evento registra data/hora, responsável, justificativa e estado anterior/posterior na mesma transação.
- API: `GET /api/closures?year=2026&limit=20&offset=0`; `PUT /api/closures/{year}/{month}` com `revision`, `closed`, `actor`, `reason` e `confirmation`. Revisões antigas e tentativas de alterar períodos fechados recebem HTTP 409.

A atualização cria a tabela de fechamentos e adiciona o responsável à auditoria, com cópia de segurança antes de migrar bancos existentes. Nenhum mês é fechado automaticamente.

## Regional e agência

Cada agência pertence a uma **regional**. A hierarquia é Regional › Agência › Carteira: a regional aparece em letras pequenas acima do nome da agência e é um filtro, antes do filtro de agência, em Visão geral, Meta por Agência, Meta por Carteira, Sazonalidade, Carteiras, Relatórios e Histórico. Ao escolher uma regional, a lista de agências mostra só as dela.

- Cadastre as regionais em **Parametrizações › Regionais** e escolha a regional de cada agência em **Agências** (campo obrigatório). Nomes de regional não se repetem (sem diferenciar maiúsculas) e uma regional só pode ser inativada depois que suas agências ativas forem movidas para outra.
- A API mantém `/api/regionals` (POST, PUT). Cada agência traz `regional_id` e `regional_name`; `/api/dashboard`, `/api/goals`, `/api/portfolios`, `/api/audit` e `/api/export` aceitam `regional_id`.
- O CSV de exportação ganhou a coluna **Regional**, antes de Agência, e as linhas saem ordenadas por regional e código da agência. O modelo Excel de metas anuais também traz **Regional** como primeira coluna, só como referência: a importação continua identificando a linha pelo código da agência.
- Bancos criados antes das regionais são migrados ao iniciar a API: uma cópia é gravada em `backend/data/backups/` (`metas-before-regional-*.db`) e todas as agências ficam na regional **Sem regional**, que pode ser renomeada. Metas, carteiras e histórico não mudam; reclassifique as agências em Agências.

## Produto e subproduto

Cada linha de Parametrizações é um **subproduto** de um **produto** (por exemplo, produto *Crédito* e subproduto *Crédito rural*). O subproduto é o nível principal do sistema: é nele que cada agência recebe a meta anual, que a sazonalidade é configurada e que a meta é distribuída entre as carteiras. O produto apenas agrupa os subprodutos nas telas e nos seletores.

- A combinação produto + subproduto é única (sem diferenciar maiúsculas); o mesmo produto pode ter vários subprodutos, cada um com sua unidade (R$, quantidade ou %).
- A API mantém o recurso `/api/products`: cada registro traz `name` (produto) e `sub_product` (subproduto). O campo antigo `category` foi substituído por `sub_product`.
- Excel de metas anuais: colunas **Agência, Produto, Subproduto, Ano e Total anual**. A linha é identificada pelo subproduto; a coluna Produto é opcional e só é exigida quando o mesmo nome de subproduto existe em mais de um produto.
- Bancos criados antes dessa mudança são migrados ao iniciar a API: o valor da antiga coluna *Categoria* passa a ser o subproduto, os ids são preservados (metas e distribuições continuam ligadas ao mesmo registro) e uma cópia é gravada em `backend/data/backups/` (`metas-before-subproduct-*.db`). Revise os nomes em Parametrizações.

## Regras de distribuição

Os editores de sazonalidade (página Sazonalidade, edição da agência e distribuição do total anual) oferecem três modelos prontos: **Igual entre os meses**, **Maior no meio do ano** (começa e termina baixo, com pico em junho/julho) e **Crescente mês a mês** (aumenta de janeiro até dezembro). Escolher um modelo atualiza os percentuais e a prévia; os ajustes continuam disponíveis e só são gravados ao salvar/aplicar. Os percentuais fecham em 100%, com até duas casas decimais, e meses fechados são preservados. Na distribuição anual, os modelos aparecem somente na opção Sazonalidade do subproduto; ficam ocultos em Percentuais personalizados e Divisão igual. A escolha de um modelo mantém a opção Sazonalidade selecionada. O modelo igual usa a divisão direta do saldo entre os meses abertos.

1. A soma das participações deve ser **exatamente 100,00%**. Informar 10% e 50%, deixando 40% sem atribuição, bloqueia o botão e resulta em erro 422 na API.
2. Na edição por valor, a soma das carteiras deve coincidir com a meta do mês até o último centavo/unidade.
3. Percentuais aceitam duas casas decimais. Valores negativos, não finitos, carteiras repetidas ou pertencentes a outra agência são rejeitados.
4. Todas as carteiras ativas devem estar presentes, inclusive aquelas com 0%.
5. Reais são armazenados em centavos. Produtos em unidades recebem números inteiros. O método de maiores restos conserva o total nas divisões. O front-end utiliza BigInt na multiplicação dos pesos.
6. A sazonalidade precisa conter 12 pesos que somem 100%. Redistribuir a meta anual recalcula os valores dos meses abertos e de suas carteiras. Editar somente um mês recalcula apenas esse mês.
7. Não existe rascunho, validação mensal nem publicação: toda meta salva já vale. Edições são permitidas apenas nos meses abertos em Fechamentos.
8. Cada alteração exige a revisão atual da meta. Edições concorrentes desatualizadas recebem erro 409.
9. Uma carteira nova entra com 0% em todas as metas da agência. Uma carteira com percentuais ou valores atribuídos precisa ser redistribuída para zero antes da inativação.
10. Dados e auditoria são gravados na mesma transação. Uma operação inválida não grava alterações parciais.
11. Na página Sazonalidade, o botão Salvar abre a escolha entre guardar somente o padrão e salvar/aplicar às agências selecionadas. Digite SALVAR ou APLICAR, conforme a opção. A seleção começa com todas as agências disponíveis marcadas e permite qualquer subconjunto ou uma única agência. O filtro da prévia não limita essa lista. Salvar e aplicar ocorrem na mesma transação: conflitos desfazem também o salvamento do padrão. A aplicação substitui ajustes dos meses abertos, preserva os fechados e mantém o total anual e os percentuais das carteiras, recalcula seus valores. Produtos e anos têm padrões independentes, armazenados no banco e registrados no histórico.

Valores em reais e em unidades permanecem separados nos indicadores. O sistema apresenta **metas**, sem inventar resultados realizados.

## Dados iniciais e diferenças da origem

Leia [docs/ORIGEM.md](docs/ORIGEM.md) para o mapeamento da planilha e os critérios de importação. A tela de conferência também apresenta os avisos. Abril está ausente nas duas abas da referência; ele é sinalizado para revisão e não é inferido de outros meses.

## Broto UI

A biblioteca completa está em `vendor/broto-ui`, obtida de [edumartinsrib/broto-ui](https://github.com/edumartinsrib/broto-ui), no commit `ae0421d6f21892b154f3413cdfabfc324d958513`. O Vite resolve o import `broto-ui` diretamente para esse código, com deduplicação de React. Não é uma imitação visual da biblioteca.

São usados os tokens, o CSS, Exo 2, Nunito e componentes como Button, Card, Badge, Field, Input, Select, Tabs, Segmented, Checkbox, Switch, Dialog, ConfirmProvider, ProgressBar, SearchInput, Toaster e BoxMark. As fontes ficam hospedadas no próprio build. A cópia integral permite usar os demais componentes na evolução do sistema. Mais detalhes em [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

## Instalação em outro computador Windows

Requisitos: **Node.js 22.18+** e **Python 3.11+**. Na pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File configurar.ps1
npm start
```

Instalação manual:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm ci
npm start
```

Em Linux/macOS, crie `.venv` com `python3 -m venv .venv`, instale as dependências e execute `npm start`. O inicializador reconhece `.venv/bin/python`; os comandos de teste Python do package.json são para Windows.

## Build e execução sem o Vite

```powershell
npm run build
npm run start:production
```

O FastAPI serve o React compilado e a API juntos em **http://127.0.0.1:8765**. Se a API já estava aberta antes do build, reinicie-a para que registre os arquivos estáticos. `iniciar.cmd` abre o modo de desenvolvimento.

## Conexão por API e banco

O front-end nunca acessa o banco diretamente. Todas as consultas e mudanças passam pelos endpoints `/api`. A implementação inicial usa SQLite, com acesso concentrado em `backend/database.py` e regras de negócio em `backend/domain.py`.

- `VITE_API_URL`: endereço completo da API para um front-end hospedado separadamente. Copie `.env.example` para `.env` e gere um novo build.
- `METAS_DB_PATH`: caminho do arquivo SQLite, configurado no ambiente do servidor Python.
- `METAS_ALLOWED_ORIGINS`: origens permitidas no CORS, separadas por vírgula, configuradas no servidor Python.

Exemplo de servidor:

```powershell
$env:METAS_DB_PATH = 'C:\dados\metas.db'
$env:METAS_ALLOWED_ORIGINS = 'https://metas.suaempresa.com'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Esta entrega roda localmente, com sessão administrativa local. Para disponibilização corporativa, a implantação deve conectar o provedor de identidade da organização e controlar os perfis de acesso. A integração com uma API de banco externa depende do contrato e das credenciais desse serviço, que não foram fornecidos. O SQLite mantém o sistema utilizável agora, com o front-end já desacoplado pela API.

## Testes

```powershell
npm run test:api
npm run test:math
npm run build
```

Os testes Python utilizam um banco temporário isolado; não alteram os dados da aplicação. A cobertura inclui somas incorretas, centavos, unidades, sazonalidade, duplicações, carteiras de outras agências, criação automática, concorrência e exportação.

## Persistência e cópia de segurança

O banco é criado em `backend/data/metas.db` na primeira execução. Os dados iniciais são aplicados somente se o cadastro de produtos estiver vazio. Encerre a API e copie o arquivo para fazer backup. Não apague o banco para atualizar o código.

A atualização para as matrizes inclui colunas de origem e identificação de ajustes manuais. Em bancos existentes, uma cópia é criada automaticamente em `backend/data/backups/` antes da migração. Os valores, percentuais, responsáveis, agências e carteiras são preservados.

A retirada do fluxo de plano (rascunho, validação mensal e publicação) remove as colunas `goals.status` e `months.confirmed` na primeira execução da nova versão, também com cópia em `backend/data/backups/` (`metas-before-no-plans-*.db`). Nenhum valor, percentual, carteira ou registro de histórico é alterado; metas que estavam publicadas passam a ser editáveis como as demais. A API deixou de oferecer `/api/goals/{id}/publish` e `/reopen`, e as consultas `/api/planning` e `/api/agencies/{id}/plan` passaram a ser `/api/goals` e `/api/agencies/{id}/goals`.

## Organização

```text
frontend/src/        Interface e módulos React
frontend/tests/      Testes do cálculo de distribuição
backend/main.py      Endpoints e validação das operações
backend/domain.py    Regras numéricas e maiores restos
backend/database.py  Esquema e transações
backend/seed.py      Cadastro automático e dados iniciais
backend/source_data.json  Dados extraídos da planilha, com referência
backend/tests/       Testes de integração da API
scripts/             Inicialização e extração de referência
vendor/broto-ui/      Código completo da biblioteca solicitada
docs/                Documentação e origem dos dados
```
