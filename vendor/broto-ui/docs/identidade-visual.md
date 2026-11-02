# Identidade visual

Verde como cor protagonista, branco como respiro, tipografia de cantos arredondados e ícones de linha fina. O elemento de assinatura é o **box**.

## Cores

Verde é sempre a cor de maior impacto; o branco acompanha o verde em toda composição.

| Token | Hex | Uso |
| --- | --- | --- |
| `--bt-green-900` | `#0A4B1E` | Fundo da barra lateral, títulos sobre fundo claro |
| `--bt-green-700` | `#146E37` | Verde escuro: cabeçalhos, estados ativos, sucesso, KPI em destaque |
| `--bt-green-600` | `#33820D` | Botões primários e links (contraste AA com branco) |
| `--bt-green-500` | `#3FA110` | Verde principal: destaques, marca, gráficos |
| `--bt-green-400` | `#63C733` | Indicadores "ao vivo", hover sobre fundo escuro |
| `--bt-green-200` | `#A0DC8C` | Barras de progresso, realces |
| `--bt-green-100` | `#D7E6C8` | Fundos de seleção, badges de sucesso |
| `--bt-green-50` | `#F1F7EC` | Fundos de ícone e etiquetas |
| `--bt-neutral-900` | `#323C32` | Texto principal |
| `--bt-neutral-700` | `#5A645A` | Texto secundário |
| `--bt-neutral-500` | `#828A82` | Texto auxiliar, ícones inativos |
| `--bt-neutral-400` | `#AAB0AA` | Bordas fortes |
| `--bt-neutral-300` | `#CDD3CD` | Bordas e divisórias |
| `--bt-neutral-50` | `#FAFAFA` | Fundo da aplicação |
| `--bt-white` | `#FFFFFF` | Superfícies (cards, tabelas) |
| `--bt-yellow-500` | `#FFCD00` | Pendente, atenção |
| `--bt-yellow-600` | `#E6A500` | Texto/ícone de atenção |
| `--bt-blue-500` | `#28B9FF` | Preparando, informação |
| `--bt-orange-600` | `#E64600` | Abandonado, alerta forte |
| `--bt-red-700` | `#AA003C` | Falha, erro |
| `--bt-red-500` | `#E60050` | Magenta: ações destrutivas |
| `--bt-brown-700` | `#5A3C1E` | Uso pontual em gráficos |

Cores de apoio (amarelo, azul, laranja, magenta, marrom) **nunca são protagonistas**: só em estados, pequenos elementos e gráficos.

### Tons de status

Cada tom tem fundo, texto e ponto (`--bt-tone-<tom>-bg|fg|dot`). Mapeie os estados do seu domínio para eles:

| Tom | Cor | Exemplos de estado |
| --- | --- | --- |
| `pending` | amarelo | pendente, retentado, rascunho, drenando |
| `info` | azul | preparando, novo |
| `live` | verde 500, com pulso opcional | executando, em andamento, online |
| `success` | verde 700 sobre verde 100 | sucesso, publicado |
| `danger` | magenta escuro | falha, offline |
| `neutral` | cinza | cancelado, excluído, desabilitado, obsoleto |
| `dark` | cinza escuro | parado |
| `orange` | laranja | abandonado |
| `brand` | verde claro | destaque neutro da marca |

## Tipografia

- **Exo 2** — títulos, números de destaque, marca. Títulos de página, de diálogo e de estados vazios em itálico semibold/bold, que dão o movimento característico.
- **Nunito** — textos corridos e toda a interface (tabelas, formulários, botões).
- Monoespaçada do sistema para logs, ids, versões e JSON.
- Sem caixa-alta em textos longos; caixa-alta só em siglas curtas (`RPA`, `ETL`).

## Ícones

Linha fina, cantos e terminações arredondados, construção simples (no máximo três elementos). Recomendação: `lucide-react`, nos tamanhos 16 (botões), 18 (KPIs, toasts) e 20 (navegação).

## Grafismo: o box

O box é o elemento de assinatura: um retângulo com **um canto reto e três arredondados** (canto superior esquerdo reto). Usado em cards de indicadores, cabeçalho das páginas, diálogos, hero e destaques. Em tabelas e formulários a versão simplificada tem os cantos levemente arredondados.

```css
.bt-box    { border-radius: 0 20px 20px 20px; }
.bt-box-sm { border-radius: 0 12px 12px 12px; }
.bt-box-xs { border-radius: 0 8px 8px 8px; }
```

- A **cantoneira** (`.bt-corner`, presente no `PageHeader`) marca o canto reto com uma linha verde em L.
- A **moldura** (`.bt-frame`) contorna o box em verde para destacar um bloco (ex.: o item selecionado).
- As **raias** (`<Lanes />`) — traços verdes desencontrados com um ponto — representam movimento e aparecem no hero e no login.

Não use boxes inclinados nem com ângulos diferentes na mesma tela, e não exagere na quantidade.

## Composição

- Um único **KPI em destaque** (`variant="featured"`, fundo verde) por tela; os demais em branco.
- Um único **botão primário** por área; ações secundárias em `secondary` ou `ghost`.
- Bordas amarelas (`alert`) e magenta (`danger`) em KPIs só quando o número pede atenção.
- Estados vazios sempre com ícone, título em Exo 2 itálico e uma frase que explica o que vai aparecer ali.
