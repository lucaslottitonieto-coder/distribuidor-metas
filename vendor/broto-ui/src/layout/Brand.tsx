import type { ReactNode } from 'react';
import { cx } from '../internal/cx';

/** Contorno do box: canto superior esquerdo reto, três arredondados (viewBox 32×32). */
export const BOX_PATH = 'M2 2h20a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H10a8 8 0 0 1-8-8z';

/** Desenho de três raias desencontradas com um ponto — fluxo, filas, movimento. */
export function LanesGlyph() {
  return (
    <>
      <path d="M8 11.5h11M12 16h12M8 20.5h7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="21.5" cy="20.5" r="1.9" fill="#fff" />
    </>
  );
}

export interface BoxMarkProps {
  size?: number;
  /** Conteúdo do box: 'lanes' (raias), um texto curto (iniciais) ou SVG próprio em viewBox 32×32. */
  glyph?: 'lanes' | string | ReactNode;
  color?: string;
  title?: string;
  className?: string;
}

/** Marca em forma de box. Use como logo do seu produto. */
export function BoxMark({ size = 32, glyph = 'lanes', color = 'var(--bt-green-500, #3FA110)', title, className }: BoxMarkProps) {
  let inner: ReactNode;
  if (glyph === 'lanes') inner = <LanesGlyph />;
  else if (typeof glyph === 'string') {
    inner = (
      <text
        x="16.5"
        y="21.6"
        textAnchor="middle"
        fill="#fff"
        style={{ fontFamily: 'var(--bt-font-display)', fontStyle: 'italic', fontWeight: 700, fontSize: glyph.length > 1 ? 13 : 16 }}
      >
        {glyph}
      </text>
    );
  } else inner = glyph;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={BOX_PATH} fill={color} />
      {inner}
    </svg>
  );
}

export interface BrandProps {
  name: ReactNode;
  /** Marca à esquerda (padrão: <BoxMark />). */
  mark?: ReactNode;
  markSize?: number;
  /** light: nome branco (sobre verde, padrão); dark: nome verde-escuro (sobre claro). */
  tone?: 'light' | 'dark';
  /** Só a marca, sem o nome. */
  compact?: boolean;
  nameSize?: number;
  className?: string;
}

/** Marca + nome do produto em Exo 2 itálico. */
export function Brand({ name, mark, markSize = 30, tone = 'light', compact, nameSize, className }: BrandProps) {
  return (
    <span className={cx('bt-brand', tone === 'dark' && 'bt-brand-dark', className)}>
      {mark ?? <BoxMark size={markSize} />}
      {!compact && (
        <span className="bt-brand-name" style={nameSize ? { fontSize: nameSize } : undefined}>
          {name}
        </span>
      )}
    </span>
  );
}
