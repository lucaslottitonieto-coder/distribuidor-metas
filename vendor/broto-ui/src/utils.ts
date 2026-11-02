// broto-ui/utils — funções puras, sem React e sem "use client".
// Use este caminho em Server Components (Next.js App Router) e em código fora da interface.

export { cx } from './internal/cx';
export { buttonClass } from './utils/classes';
export type { ButtonVariant, ButtonSize } from './utils/classes';
export { TONES, toneColor } from './utils/tones';
export type { Tone } from './utils/tones';
export {
  formatNumber,
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeMs,
  formatHour,
  formatRelative,
  formatDuration,
  secondsBetween,
  pluralize,
  initials,
  shortId,
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
} from './utils/format';
export type { FormatOptions } from './utils/format';
export { parseJson, prettyJson } from './utils/json';
export type { ParseResult } from './utils/json';
