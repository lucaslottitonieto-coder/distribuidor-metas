import type { ReactNode } from 'react';
import { cx } from '../internal/cx';
import { LiveDot } from '../components/Badge';

/** Raias decorativas (traços verdes com ponto), o grafismo de movimento da identidade. */
export function Lanes({
  count = 5,
  className,
  variant = 'hero',
}: {
  count?: number;
  className?: string;
  /** hero: raias à direita do cabeçalho; full: preenche um painel inteiro (login). */
  variant?: 'hero' | 'full';
}) {
  if (variant === 'full') {
    return (
      <svg className={className} viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {Array.from({ length: count }, (_, i) => {
          const y = 60 + i * 52;
          const start = 40 + ((i * 97) % 220);
          const len = 120 + ((i * 53) % 260);
          return (
            <g key={i} opacity={0.12 + ((i * 7) % 10) / 40}>
              <line x1={start} y1={y} x2={start + len} y2={y} stroke="#63C733" strokeWidth="6" strokeLinecap="round" />
              <circle cx={start + len + 26} cy={y} r="5" fill="#A0DC8C" />
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 520 180" aria-hidden preserveAspectRatio="xMaxYMid slice">
      {Array.from({ length: count }, (_, i) => {
        const yy = 26 + i * 32;
        const x1 = 120 + ((i * 83) % 150);
        const x2 = x1 + 140 + ((i * 47) % 120);
        return (
          <g key={i}>
            <line x1={x1} y1={yy} x2={x2} y2={yy} stroke="var(--bt-green-500)" strokeWidth="7" strokeLinecap="round" opacity={0.28 + i * 0.08} />
            <circle cx={x2 + 22} cy={yy} r="5" fill="var(--bt-green-400)" opacity={0.55} />
          </g>
        );
      })}
    </svg>
  );
}

export interface HeroProps {
  /** Linha pequena acima do título (contexto, ex.: nome do ambiente). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Botões e pílulas (use variant="hero" nos botões). */
  actions?: ReactNode;
  /** Grafismo à direita; false remove. */
  decoration?: ReactNode | false;
  className?: string;
}

/** Faixa verde escura em box para abrir telas principais (dashboard, home). */
export function Hero({ eyebrow, title, description, actions, decoration, className }: HeroProps) {
  return (
    <header className={cx('bt-hero', className)}>
      {decoration !== false && (decoration ?? <Lanes className="bt-hero-lanes" />)}
      <div className="bt-hero-main">
        {eyebrow && <span className="bt-hero-eyebrow">{eyebrow}</span>}
        <h1 className="bt-hero-title">{title}</h1>
        {description && <p className="bt-hero-desc">{description}</p>}
        {actions && <div className="bt-hero-actions">{actions}</div>}
      </div>
    </header>
  );
}

/** Pílula "Ao vivo" (sobre fundo escuro; tone="light" para fundo claro). */
export function LivePill({ live = true, children, tone = 'dark' }: { live?: boolean; children: ReactNode; tone?: 'dark' | 'light' }) {
  return (
    <span className={cx('bt-live-pill', tone === 'light' && 'bt-live-pill-light')}>
      <LiveDot on={live} />
      {children}
    </span>
  );
}
