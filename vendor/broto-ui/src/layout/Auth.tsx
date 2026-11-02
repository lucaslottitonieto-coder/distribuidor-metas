import type { FormEvent, ReactNode } from 'react';
import { Lanes } from './Hero';

export interface AuthLayoutProps {
  /** Marca grande no painel verde (ex.: <Brand name="…" markSize={44} />). */
  brand: ReactNode;
  tagline?: ReactNode;
  version?: ReactNode;
  /** Marca menor mostrada acima do cartão no celular (o painel verde some). */
  mobileBrand?: ReactNode;
  /** Grafismo do painel; padrão: raias. */
  art?: ReactNode;
  children: ReactNode;
}

/** Tela dividida: painel verde com raias e frase de efeito à esquerda, formulário à direita. */
export function AuthLayout({ brand, tagline, version, mobileBrand, art, children }: AuthLayoutProps) {
  return (
    <div className="bt-auth">
      <section className="bt-auth-art" aria-hidden>
        {art ?? <Lanes variant="full" count={9} className="bt-auth-lanes" />}
        <div className="bt-auth-art-content">
          {brand}
          {tagline && <p className="bt-auth-tagline">{tagline}</p>}
        </div>
        {version && <span className="bt-auth-version">{version}</span>}
      </section>
      <section className="bt-auth-panel">
        <div style={{ display: 'contents' }}>
          {mobileBrand && <div className="bt-auth-mobile-brand">{mobileBrand}</div>}
          {children}
        </div>
      </section>
    </div>
  );
}

export interface AuthCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Quando informado, o cartão é um <form>. */
  onSubmit?: () => void;
  children: ReactNode;
  header?: ReactNode;
}

/** Cartão em box do formulário de login. */
export function AuthCard({ title, description, onSubmit, children, header }: AuthCardProps) {
  const body = (
    <>
      {header}
      <h1 className="bt-auth-title">{title}</h1>
      {description && <p className="bt-muted" style={{ margin: 0 }}>{description}</p>}
      {children}
    </>
  );
  if (onSubmit) {
    return (
      <form
        className="bt-auth-card"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {body}
      </form>
    );
  }
  return <div className="bt-auth-card">{body}</div>;
}
