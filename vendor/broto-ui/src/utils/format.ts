// Formatação pt-BR. Por padrão as datas são exibidas no fuso America/Sao_Paulo;
// todas as funções aceitam { locale, timeZone } para outros cenários.

export interface FormatOptions {
  locale?: string;
  timeZone?: string;
}

export const DEFAULT_LOCALE = 'pt-BR';
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

type DateInput = string | number | Date;

const cache = new Map<string, Intl.DateTimeFormat>();

function dtf(opts: FormatOptions | undefined, spec: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const timeZone = opts?.timeZone ?? DEFAULT_TIME_ZONE;
  const key = `${locale}|${timeZone}|${JSON.stringify(spec)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone, ...spec });
    cache.set(key, f);
  }
  return f;
}

const numCache = new Map<string, Intl.NumberFormat>();

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Data válida ou null (string vazia, null, undefined e datas inválidas viram null). */
function valid(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const clean = (s: string) => s.replace(',', '');
const pad = (n: number) => String(n).padStart(2, '0');

/** 1234567 → "1.234.567". */
export function formatNumber(n: number | null | undefined, opts?: FormatOptions & Intl.NumberFormatOptions): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const { locale = DEFAULT_LOCALE, timeZone: _tz, ...spec } = opts ?? {};
  const key = `${locale}|${JSON.stringify(spec)}`;
  let f = numCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, spec);
    numCache.set(key, f);
  }
  return f.format(n);
}

/** "02/10/2026 14:32". */
export function formatDateTime(value: DateInput | null | undefined, opts?: FormatOptions & { seconds?: boolean }): string {
  const d = valid(value);
  if (!d) return '—';
  return clean(
    dtf(opts, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(opts?.seconds ? { second: '2-digit' } : {}),
    }).format(d),
  );
}

/** "02/10/2026". */
export function formatDate(value: DateInput | null | undefined, opts?: FormatOptions): string {
  const d = valid(value);
  if (!d) return '—';
  return dtf(opts, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** "14:32:05" (ou "14:32" com seconds: false). */
export function formatTime(value: DateInput | null | undefined, opts?: FormatOptions & { seconds?: boolean }): string {
  const d = valid(value);
  if (!d) return '—';
  const seconds = opts?.seconds ?? true;
  return dtf(opts, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(d);
}

/** "14:32:05,123" — para logs. */
export function formatTimeMs(value: DateInput | null | undefined, opts?: FormatOptions): string {
  const d = valid(value);
  if (!d) return '';
  return dtf(opts, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(d);
}

/** "14h". */
export function formatHour(value: DateInput, opts?: FormatOptions): string {
  const d = valid(value);
  if (!d) return '—';
  return `${dtf(opts, { hour: '2-digit', hourCycle: 'h23' }).format(d)}h`;
}

/** "agora", "há 45 s", "há 3 min", "há 2 h", "há 3 dias", "em 12 min". */
export function formatRelative(value: DateInput | null | undefined, now: number = Date.now()): string {
  const d = valid(value);
  if (!d) return '—';
  const diffS = Math.round((now - d.getTime()) / 1000);
  const future = diffS < 0;
  const s = Math.abs(diffS);
  let text: string;
  if (s < 10) return future ? 'em instantes' : 'agora';
  if (s < 60) text = `${s} s`;
  else if (s < 3600) text = `${Math.floor(s / 60)} min`;
  else if (s < 86_400) text = `${Math.floor(s / 3600)} h`;
  else if (s < 86_400 * 30) {
    const d = Math.floor(s / 86_400);
    text = d === 1 ? '1 dia' : `${d} dias`;
  } else if (s < 86_400 * 365) {
    const m = Math.floor(s / (86_400 * 30));
    text = m === 1 ? '1 mês' : `${m} meses`;
  } else {
    const y = Math.floor(s / (86_400 * 365));
    text = y === 1 ? '1 ano' : `${y} anos`;
  }
  return future ? `em ${text}` : `há ${text}`;
}

/** "42s", "3m 05s", "1h 02m", "2d 03h". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad(m % 60)}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${pad(h % 24)}h`;
}

/** Segundos entre duas datas (fim ausente = agora). */
export function secondsBetween(start: DateInput | null | undefined, end?: DateInput | null): number | null {
  const s = valid(start);
  if (!s) return null;
  const e = end === null || end === undefined ? new Date() : valid(end);
  if (!e) return null;
  return (e.getTime() - s.getTime()) / 1000;
}

/** "3 itens" / "1 item". */
export function pluralize(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** "Ana Souza" → "AS"; "ana.souza" → "AS"; "admin" → "AD". */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase();
}

/** Encurta ids/UUIDs: "484f2d76-c286-…" → "484f2d76". */
export function shortId(id: string | null | undefined, size = 8): string {
  if (!id) return '—';
  return id.replace(/-/g, '').slice(0, size);
}
