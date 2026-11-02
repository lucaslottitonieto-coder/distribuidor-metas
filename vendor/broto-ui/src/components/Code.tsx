import { useMemo, useState, type ReactNode } from 'react';
import { cx } from '../internal/cx';
import { IconCheck, IconCopy } from '../internal/icons';
import { useLabels } from '../provider';
import { copyToClipboard } from '../utils/clipboard';
import { prettyJson } from '../utils/json';
import { IconButton, type ButtonSize, type ButtonVariant } from './Button';
import { toast } from './Toast';

// ---------------------------------------------------------------- Copiar

export interface CopyButtonProps {
  value: string;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
}

/** Botão de ícone que copia um valor e mostra ✓ por um instante. */
export function CopyButton({ value, label, size = 'sm', variant = 'ghost', className }: CopyButtonProps) {
  const labels = useLabels();
  const [done, setDone] = useState(false);
  return (
    <IconButton
      size={size}
      variant={variant}
      className={className}
      label={done ? labels.copied : (label ?? labels.copy)}
      icon={done ? <IconCheck size={15} /> : <IconCopy size={15} />}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else {
          toast.error(labels.copyFailed, labels.copyFailedHint);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- Bloco de código

export interface CodeBlockProps {
  children: ReactNode;
  /** Texto copiado pelo botão (padrão: children, se for string). */
  copyValue?: string;
  copy?: boolean;
  copyLabel?: string;
  /** Altura máxima maior (620 px em vez de 420 px). */
  tall?: boolean;
  className?: string;
}

export function CodeBlock({ children, copyValue, copy = true, copyLabel, tall, className }: CodeBlockProps) {
  const text = copyValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <div className="bt-code-wrap">
      <pre className={cx('bt-code-block', tall && 'bt-code-block-tall', className)} tabIndex={0}>
        {children}
      </pre>
      {copy && text !== undefined && (
        <div className="bt-code-copy">
          <CopyButton value={text} label={copyLabel} />
        </div>
      )}
    </div>
  );
}

const TOKEN_RE = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Realce de sintaxe leve para JSON já formatado (sem HTML cru). */
export function highlightJson(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of json.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(json.slice(last, idx));
    const tok = m[0];
    let cls = 'bt-j-num';
    if (tok.startsWith('"')) cls = m[2] ? 'bt-j-key' : 'bt-j-str';
    else if (tok === 'true' || tok === 'false') cls = 'bt-j-bool';
    else if (tok === 'null') cls = 'bt-j-null';
    if (cls === 'bt-j-key') {
      const colonAt = tok.lastIndexOf(':');
      out.push(
        <span key={i++} className="bt-j-key">
          {tok.slice(0, colonAt)}
        </span>,
        tok.slice(colonAt),
      );
    } else {
      out.push(
        <span key={i++} className={cls}>
          {tok}
        </span>,
      );
    }
    last = idx + tok.length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export interface JsonViewProps {
  value: unknown;
  /** Exibido quando o valor é nulo, indefinido ou objeto vazio. */
  empty?: ReactNode;
  tall?: boolean;
  copy?: boolean;
}

/** JSON formatado com realce de sintaxe e botão de copiar. */
export function JsonView({ value, empty, tall, copy = true }: JsonViewProps) {
  const labels = useLabels();
  const text = useMemo(() => prettyJson(value), [value]);
  const nodes = useMemo(() => highlightJson(text), [text]);
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
  if (isEmpty) return <div className="bt-code-block bt-code-block-empty">{empty ?? labels.noData}</div>;
  return (
    <CodeBlock tall={tall} copy={copy} copyValue={text} copyLabel="Copiar JSON">
      {nodes}
    </CodeBlock>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="bt-inline-code">{children}</code>;
}

// ---------------------------------------------------------------- Chave → valor

export type KeyValueItem = [ReactNode, ReactNode] | { label: ReactNode; value: ReactNode; hidden?: boolean };

/** Lista de detalhes em duas colunas (<dl>). */
export function KeyValue({ items, className }: { items: KeyValueItem[]; className?: string }) {
  const rows = items
    .map((it) => (Array.isArray(it) ? { label: it[0], value: it[1], hidden: false } : it))
    .filter((r) => !r.hidden);
  return (
    <dl className={cx('bt-kv', className)}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- Segredo

/** Valor sensível exibido uma única vez (token, chave), com botão de copiar. */
export function SecretBox({ value, copyLabel }: { value: string; copyLabel?: string }) {
  return (
    <div className="bt-secret-box">
      <code>{value}</code>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}
