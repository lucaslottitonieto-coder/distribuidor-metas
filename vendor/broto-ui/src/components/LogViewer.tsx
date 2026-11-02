import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconArrowDownToLine } from '../internal/icons';
import { useLabels } from '../provider';
import { formatTimeMs } from '../utils/format';
import { LiveDot } from './Badge';
import { SearchInput, Switch } from './Field';

export interface LogLine {
  ts?: string | number | Date;
  stream?: string;
  text: string;
  /** info | warn | warning | error | critical… (warn = amarelo, error = fundo magenta). */
  level?: string;
}

export interface LogStream {
  id: string;
  label?: string;
  /** Cor do nome do stream e do botão quando ativo. */
  color?: string;
  /** Cor do texto das linhas desse stream. */
  textColor?: string;
}

const KNOWN: Record<string, Pick<LogStream, 'color' | 'textColor'>> = {
  stderr: { color: 'var(--bt-log-stderr)', textColor: 'var(--bt-log-stderr)' },
  sdk: { color: 'var(--bt-log-sdk)', textColor: 'var(--bt-log-sdk)' },
};

export interface LogViewerProps {
  lines: LogLine[];
  title?: ReactNode;
  /** Mostra "ao vivo" e anuncia novas linhas a leitores de tela. */
  live?: boolean;
  loading?: boolean;
  /** Streams com botões liga/desliga (ex.: stdout, stderr, sdk). */
  streams?: LogStream[];
  filterable?: boolean;
  defaultWrap?: boolean;
  /** Rolar junto com novas linhas (padrão: sim). */
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  showTimestamp?: boolean;
  formatTimestamp?: (ts: string | number | Date) => string;
  /** Texto quando não há linhas. */
  emptyText?: ReactNode;
  /** Controles extras na barra (ex.: botão de download). */
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function levelClass(level?: string) {
  const l = level?.toUpperCase();
  if (l === 'ERROR' || l === 'CRITICAL' || l === 'FATAL') return 'bt-lv-error';
  if (l === 'WARNING' || l === 'WARN') return 'bt-lv-warn';
  return undefined;
}

/** Painel de logs escuro com filtro, streams, quebra de linha e rolagem automática. */
export function LogViewer({
  lines,
  title = 'Logs',
  live,
  loading,
  streams,
  filterable = true,
  defaultWrap = true,
  follow: followProp,
  onFollowChange,
  showTimestamp = true,
  formatTimestamp = formatTimeMs,
  emptyText,
  actions,
  className,
  style,
}: LogViewerProps) {
  const labels = useLabels();
  const [filter, setFilter] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [wrap, setWrap] = useState(defaultWrap);
  const [followInner, setFollowInner] = useState(true);
  const follow = followProp ?? followInner;
  const boxRef = useRef<HTMLDivElement>(null);

  const defs = useMemo(() => {
    const m = new Map<string, LogStream>();
    for (const s of streams ?? []) m.set(s.id, { ...KNOWN[s.id], ...s });
    return m;
  }, [streams]);
  const hasStream = lines.some((l) => l.stream);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return lines.filter(
      (l) =>
        (!l.stream || enabled[l.stream] !== false) &&
        (!needle || l.text.toLowerCase().includes(needle) || l.level?.toLowerCase() === needle),
    );
  }, [lines, filter, enabled]);

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [shown, follow]);

  const setFollow = (v: boolean) => {
    setFollowInner(v);
    onFollowChange?.(v);
  };

  return (
    <section
      className={cx('bt-logs', !hasStream && 'bt-logs-no-stream', !showTimestamp && 'bt-logs-no-ts', className)}
      style={style}
      aria-label={typeof title === 'string' ? title : 'Logs'}
    >
      <div className="bt-logs-toolbar">
        <div className="bt-row">
          <h2 className="bt-logs-title">{title}</h2>
          {live && (
            <span className="bt-logs-live">
              <LiveDot /> {labels.live}
            </span>
          )}
          <span className="bt-logs-count">{labels.logsLines(shown.length, lines.length)}</span>
        </div>
        <div className="bt-logs-controls">
          {filterable && (
            <div className="bt-logs-filter">
              <SearchInput controlSize="sm" placeholder={labels.logsFilter} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={labels.logsFilter} />
            </div>
          )}
          {[...defs.values()].map((s) => (
            <button
              key={s.id}
              type="button"
              className="bt-logs-stream-toggle"
              aria-pressed={enabled[s.id] !== false}
              style={s.color ? ({ '--bt-stream-color': s.color } as CSSProperties) : undefined}
              onClick={() => setEnabled((v) => ({ ...v, [s.id]: v[s.id] === false }))}
            >
              {s.label ?? s.id}
            </button>
          ))}
          <Switch checked={wrap} onCheckedChange={setWrap} label={labels.logsWrap} />
          <Switch checked={follow} onCheckedChange={setFollow} label={labels.logsFollow} />
          <button
            type="button"
            className="bt-logs-icon-btn"
            aria-label={labels.logsScrollEnd}
            title={labels.logsScrollEnd}
            onClick={() => {
              if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
            }}
          >
            <IconArrowDownToLine size={16} />
          </button>
          {actions}
        </div>
      </div>
      <div ref={boxRef} className={cx('bt-logs-body', wrap && 'bt-wrap')} tabIndex={0} role="log" aria-live={live ? 'polite' : 'off'}>
        {loading ? (
          <div className="bt-logs-empty">{labels.loading}…</div>
        ) : shown.length === 0 ? (
          <div className="bt-logs-empty">{lines.length ? labels.logsNoMatch : (emptyText ?? (live ? labels.logsWaiting : labels.logsEmpty))}</div>
        ) : (
          shown.map((l, i) => {
            const def = l.stream ? defs.get(l.stream) ?? { id: l.stream, ...KNOWN[l.stream] } : undefined;
            const vars: CSSProperties | undefined = def
              ? ({ '--bt-stream-color': def.color, '--bt-stream-text': def.textColor } as CSSProperties)
              : undefined;
            return (
              <div key={i} className={cx('bt-log-line', levelClass(l.level))} style={vars}>
                {showTimestamp && <span className="bt-log-ts">{l.ts !== undefined ? formatTimestamp(l.ts) : ''}</span>}
                {hasStream && <span className="bt-log-stream">{l.stream ?? ''}</span>}
                <span className="bt-log-text">{l.text}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
