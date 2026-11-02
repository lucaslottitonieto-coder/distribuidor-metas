import { BoxMark, Brand, Card, Grid, Page, PageHeader, Section } from 'broto-ui';
import { Demo } from '../Demo';

const groups: { title: string; note: string; colors: [string, string, string][] }[] = [
  {
    title: 'Verdes — protagonistas',
    note: 'Verde é sempre a cor de maior impacto; o branco acompanha o verde em toda composição.',
    colors: [
      ['--bt-green-900', '#0A4B1E', 'Barra lateral, títulos'],
      ['--bt-green-700', '#146E37', 'Ativos, sucesso, KPI destaque'],
      ['--bt-green-600', '#33820D', 'Botão primário, links (AA)'],
      ['--bt-green-500', '#3FA110', 'Marca, destaques, gráficos'],
      ['--bt-green-400', '#63C733', '"Ao vivo", hover no escuro'],
      ['--bt-green-200', '#A0DC8C', 'Barras, realces'],
      ['--bt-green-100', '#D7E6C8', 'Seleção, badge de sucesso'],
      ['--bt-green-50', '#F1F7EC', 'Fundos de ícone, tags'],
    ],
  },
  {
    title: 'Neutros',
    note: 'Texto, bordas e superfícies.',
    colors: [
      ['--bt-neutral-900', '#323C32', 'Texto principal'],
      ['--bt-neutral-700', '#5A645A', 'Texto secundário'],
      ['--bt-neutral-500', '#828A82', 'Texto auxiliar, ícones'],
      ['--bt-neutral-400', '#AAB0AA', 'Bordas fortes'],
      ['--bt-neutral-300', '#CDD3CD', 'Bordas e divisórias'],
      ['--bt-neutral-100', '#EFF2EF', 'Fundos discretos'],
      ['--bt-neutral-50', '#FAFAFA', 'Fundo da aplicação'],
      ['--bt-white', '#FFFFFF', 'Superfícies'],
    ],
  },
  {
    title: 'Apoio — só em estados, pequenos elementos e gráficos',
    note: 'Nunca protagonistas.',
    colors: [
      ['--bt-yellow-500', '#FFCD00', 'Pendente, atenção'],
      ['--bt-blue-500', '#28B9FF', 'Preparando, informação'],
      ['--bt-orange-600', '#E64600', 'Abandonado, alerta forte'],
      ['--bt-red-700', '#AA003C', 'Falha, erro'],
      ['--bt-red-500', '#E60050', 'Ações destrutivas'],
      ['--bt-brown-700', '#5A3C1E', 'Uso pontual em gráficos'],
    ],
  },
];

export function FoundationsPage() {
  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Fundamentos' }]}
        title="Fundamentos"
        description="Cores, tipografia e o box — o grafismo de assinatura, com um canto reto e três arredondados."
      />

      {groups.map((g) => (
        <Section key={g.title} title={g.title} description={g.note}>
          <div className="pg-swatches">
            {g.colors.map(([token, hex, use]) => (
              <div key={token} className="pg-swatch">
                <div className="pg-swatch-color" style={{ background: `var(${token})`, borderBottom: '1px solid var(--bt-border-soft)' }} />
                <div className="pg-swatch-meta">
                  <span className="bt-strong">{hex}</span>
                  <span className="bt-mono">{token}</span>
                  <span className="bt-subtle">{use}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Grid layout="2">
        <Card title="Tipografia" subtitle="Exo 2 para títulos e números, Nunito para a interface">
          <div className="pg-type-sample">
            <span className="bt-small bt-subtle">Título de página · Exo 2 itálico 600, 28px</span>
            <span className="bt-h1">Filas de trabalho</span>
          </div>
          <div className="pg-type-sample">
            <span className="bt-small bt-subtle">Número de destaque · Exo 2 itálico 600, 36px</span>
            <span className="bt-kpi-value">1.284</span>
          </div>
          <div className="pg-type-sample">
            <span className="bt-small bt-subtle">Título de card · Exo 2 600, 16–18px</span>
            <span className="bt-h2">Jobs concluídos por hora</span>
          </div>
          <div className="pg-type-sample">
            <span className="bt-small bt-subtle">Interface · Nunito 400–800, 14px</span>
            <span>Robôs e pipelines com runners, filas de trabalho e credenciais num só lugar.</span>
          </div>
          <div className="pg-type-sample">
            <span className="bt-small bt-subtle">Monoespaçada do sistema · ids, logs, JSON</span>
            <span className="bt-mono">484f2d76-c286-4361-842b · orq.global</span>
          </div>
        </Card>

        <Card title="O box" subtitle="Canto superior esquerdo reto, três arredondados">
          <div className="bt-stack">
            <div className="pg-shapes">
              <div className="pg-shape bt-box">.bt-box · 20px</div>
              <div className="pg-shape bt-box-sm">.bt-box-sm · 12px</div>
              <div className="pg-shape bt-box-xs">.bt-box-xs · 8px</div>
            </div>
            <p className="bt-muted">
              Use em cards de indicadores, cabeçalho de página, diálogos e destaques. Em tabelas e formulários a versão simplificada tem
              cantos retos ou levemente arredondados. Não use boxes inclinados nem exagere na quantidade.
            </p>
            <div className="pg-demo-row">
              <div className="bt-card bt-box bt-corner" style={{ padding: 20, width: 220 }}>
                <span className="bt-strong">.bt-corner</span>
                <div className="bt-small bt-subtle">cantoneira verde no canto reto</div>
              </div>
              <div className="bt-card bt-box bt-frame" style={{ padding: 20, width: 220 }}>
                <span className="bt-strong">.bt-frame</span>
                <div className="bt-small bt-subtle">moldura de destaque</div>
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      <Demo
        title="Marca"
        description="BoxMark desenha o box; o conteúdo pode ser as raias, iniciais ou um SVG seu"
        code={`
<Brand name="Meu Produto" />                       // sobre fundo verde (barra lateral)
<Brand name="Meu Produto" tone="dark" />           // sobre fundo claro
<BoxMark size={44} glyph="MP" />                   // iniciais
<BoxMark size={44} glyph={<path d="…" />} />       // SVG próprio (viewBox 32×32)`}
      >
        <div className="pg-demo-row">
          <div style={{ background: 'var(--bt-green-900)', padding: '14px 20px', borderRadius: 'var(--bt-radius-box-sm)' }}>
            <Brand name="Meu Produto" />
          </div>
          <Brand name="Meu Produto" tone="dark" />
          <BoxMark size={44} />
          <BoxMark size={44} glyph="MP" />
          <BoxMark size={44} glyph="B" color="var(--bt-green-700)" />
        </div>
      </Demo>
    </Page>
  );
}
