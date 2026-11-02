# Origem e critérios dos dados iniciais

Referência: `distruibuidor_de_metas.xlsx`, fornecida pelo usuário, localizada em `8 - Distribuidor de Metas Sicredi`.

O arquivo foi lido sem alterações. Seu conteúdo foi tratado como dado de referência, não como instruções para execução.

## Mapeamento

| Referência | Uso no sistema |
| --- | --- |
| `meta-agencia!B2:E9` | Ano 2026, duas agências e quatro produtos. |
| `meta-agencia!F1:P9` | Metas dos 11 meses disponíveis. |
| `meta-agencia!Q2:Q9` | Total declarado na origem, preservado para comparação. |
| `meta-carteira!E4:G8` | Códigos das cinco carteiras, segmentos e participações sugeridas. |
| `meta-carteira!I4:AC8` | Participações mensais de Crédito da agência Pato Branco Centro. |

## Abril ausente

As duas abas vão de Março para Maio. O sistema cria os 12 meses e conserva abril em zero, marcado como pendente de revisão. Não completa esse mês usando médias ou diferenças presumidas.

O gestor pode informar o valor correto ou confirmar zero. Salvar os 12 meses no editor mensal ou aplicar uma sazonalidade válida registra essa revisão e retira o aviso de mês pendente.

## Totais e arredondamento

Alguns totais anuais declarados correspondem a 12 meses, embora existam apenas 11 meses informados. O valor anual operacional é a soma dos meses disponíveis. O total original continua visível como referência.

Os totais da aba `meta-carteira` não são usados como fonte numérica autoritativa: as participações válidas são aplicadas às metas da agência, com conservação dos centavos por maiores restos.

O produto Associados Ativos utiliza unidades inteiras no sistema. A origem contém valores fracionários em Mangueirinha. A soma dos valores mensais disponíveis é arredondada para unidades e distribuída proporcionalmente pelos mesmos meses, sem acrescentar o mês ausente. Os valores originais extraídos continuam registrados em `backend/source_data.json`.

## Padrões escolhidos para completar a estrutura

- As cinco carteiras são: Agro, Pessoa física I, Pessoa jurídica I, Pessoa física II e Pessoa jurídica II.
- As sugestões seguem 15%, 18%, 22%, 20% e 25%, extraídas da coluna G.
- O Crédito de Pato Branco Centro começa com 10%, 20%, 25%, 25% e 20%, conforme os percentuais atribuídos na referência.
- A estrutura de cinco carteiras foi aplicada também a Mangueirinha e aos demais produtos como padrão inicial. Essa estrutura não é apresentada como cadastro adicional existente na planilha.
- Os nomes descritivos das carteiras e dos segmentos foram definidos para tornar o sistema utilizável. Podem ser alterados nos cadastros.
- Responsáveis não foram inventados; os campos começam vazios.
- Não existe plano, rascunho nem publicação: os totais importados já são as metas, e abril segue sinalizado até a revisão do gestor.

Para refazer a extração de uma referência corrigida, use `scripts/extract_workbook.py`. O script altera somente o JSON de referência e não sobrescreve o banco existente. Uma nova importação recorrente com conciliação deve ser adicionada como fluxo separado se vier a ser necessária.
