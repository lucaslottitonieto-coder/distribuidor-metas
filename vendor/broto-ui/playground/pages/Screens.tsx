import { ArrowLeft, LogIn, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AuthCard, AuthLayout, BoxMark, Brand, Button, Callout, Card, Field, FullScreen, Input, LinkButton, NotFound, Page, PageHeader, Segmented, StatusCard } from 'broto-ui';

type Screen = 'login' | 'notfound' | 'error';

export function ScreensPage() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState('');
  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Telas prontas' }]}
        title="Telas prontas"
        description="Login dividido, 404 e falha ao iniciar. Ocupam a tela inteira — aqui aparecem dentro de uma moldura."
        actions={
          <Segmented
            aria-label="Tela"
            value={screen}
            onChange={setScreen}
            options={[
              { value: 'login', label: 'Login' },
              { value: 'notfound', label: '404' },
              { value: 'error', label: 'Erro ao iniciar' },
            ]}
          />
        }
      />

      <div className="pg-frame">
        {screen === 'login' && (
          <AuthLayout
            brand={<Brand name="Meu Produto" markSize={44} nameSize={28} />}
            tagline="Robôs e pipelines com runners, filas de trabalho e credenciais num só lugar."
            version="v0.1.0"
            mobileBrand={<BoxMark size={36} />}
          >
            <AuthCard title="Entrar no console" description="Escolha um nome de usuário para acessar os ambientes liberados para você." onSubmit={() => undefined}>
              <Callout tone="info" title="Modo de desenvolvimento">
                A API identifica você pelo cabeçalho <code>X-User</code>. Em produção, o login usa SSO.
              </Callout>
              <Field label="Usuário" required>
                <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="ex.: ana" autoComplete="username" />
              </Field>
              <Button type="submit" variant="primary" size="lg" block icon={<LogIn size={18} />}>
                Entrar
              </Button>
            </AuthCard>
          </AuthLayout>
        )}
        {screen === 'notfound' && (
          <FullScreen>
            <div className="bt-stack" style={{ alignItems: 'center' }}>
              <BoxMark size={40} />
              <NotFound
                action={
                  <LinkButton href="#/" variant="primary" icon={<ArrowLeft size={16} />}>
                    Voltar ao início
                  </LinkButton>
                }
              />
            </div>
          </FullScreen>
        )}
        {screen === 'error' && (
          <FullScreen>
            <StatusCard
              brand={<Brand name="Meu Produto" tone="dark" />}
              title="Não foi possível iniciar o console"
              description="A API não respondeu. Confira se ela está no ar e acessível em /api/v1."
              action={
                <Button variant="primary" icon={<RefreshCw size={16} />}>
                  Tentar de novo
                </Button>
              }
            />
          </FullScreen>
        )}
      </div>

      <Card title="Uso" subtitle="Cada tela é composta por peças que você pode usar separadas">
        <ul className="bt-muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>
            <code>AuthLayout</code> + <code>AuthCard</code> — painel verde com raias e cartão do formulário (o painel some abaixo de 900 px).
          </li>
          <li>
            <code>FullScreen</code>, <code>FullScreenLoader</code>, <code>StatusCard</code>, <code>NotFound</code>, <code>PageLoading</code>.
          </li>
        </ul>
      </Card>
    </Page>
  );
}
