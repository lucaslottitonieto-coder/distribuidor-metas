/** Tons de status. Cada um tem fundo, texto e ponto próprios (tokens --bt-tone-*). */
export type Tone = 'pending' | 'info' | 'live' | 'success' | 'danger' | 'neutral' | 'dark' | 'orange' | 'brand';

export const TONES: Tone[] = ['pending', 'info', 'live', 'success', 'danger', 'neutral', 'dark', 'orange', 'brand'];

/** Cor sólida de cada tom (barras empilhadas, legendas, gráficos). */
export const toneColor: Record<Tone, string> = {
  pending: 'var(--bt-yellow-500)',
  info: 'var(--bt-blue-500)',
  live: 'var(--bt-green-500)',
  success: 'var(--bt-green-700)',
  danger: 'var(--bt-red-700)',
  neutral: 'var(--bt-neutral-400)',
  dark: 'var(--bt-neutral-700)',
  orange: 'var(--bt-orange-600)',
  brand: 'var(--bt-green-500)',
};
