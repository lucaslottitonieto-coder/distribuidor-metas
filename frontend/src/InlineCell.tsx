import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from 'react';
import { toast } from 'broto-ui';

import { maskCellText, maskNumericEdit, parseCellInput } from './numericInput';
type Props = {
  raw: number; decimals: number; max?: number; unsigned?: boolean; className?: string; label: string; title: string; locked?: boolean;
  canStart?: () => boolean; onCommit: (value: number) => void | Promise<void>; onOpen: () => void; onLockedClick?: () => void; children: ReactNode;
};

/** Valor da matriz editável na própria célula: 1 clique edita, Enter/Tab confirma, Esc cancela, 2 cliques abrem o card. */
export function InlineCell({ raw, decimals, max, unsigned, className = '', label, title, locked, canStart, onCommit, onOpen, onLockedClick, children }: Props) {
  const [text, setText] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  const typed = useRef(false);
  const refocus = useRef(false);
  const caret = useRef<number | null>(null);
  const editing = text !== null;

  useEffect(() => {
    if (editing) { input.current?.focus(); if (!typed.current) input.current?.select(); }
    else if (refocus.current) { refocus.current = false; button.current?.focus(); }
  }, [editing]);

  // Reposiciona o cursor depois que a máscara muda o tamanho do texto.
  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  const start = (initial?: string) => {
    if (locked) { onLockedClick?.(); return; }
    if (canStart && !canStart()) return;
    closed.current = false; typed.current = initial !== undefined;
    setText(maskCellText(initial ?? String(raw).replace('.', ','), !unsigned));
  };
  const mask = (value: string, position: number) => {
    if ((unsigned ? /[^\d.,\s]/ : /[^\d.,\s-]/).test(value)) return;
    const edit = maskNumericEdit(value, position, !unsigned);
    caret.current = edit.caret;
    setText(edit.text);
  };
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart } = e.target;
    const position = selectionStart ?? value.length;
    const typed = (e.nativeEvent as InputEvent).data ?? '';
    // "." digitado vale como vírgula decimal, já que o ponto é só o separador de milhar.
    if (typed.includes('.')) mask(value.slice(0, position - typed.length) + typed.replace(/\./g, ',') + value.slice(position), position);
    else mask(value, position);
  };
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim();
    // "1.000" colado é mil; só "1.04" (ponto sem grupo de 3 dígitos) vale como decimal.
    const pasted = parseCellInput(/^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text);
    if (pasted === null || (unsigned && pasted < 0)) return;
    const { value, selectionStart, selectionEnd } = e.currentTarget;
    const from = selectionStart ?? value.length, to = selectionEnd ?? from;
    const inserted = String(pasted).replace('.', ',');
    mask(value.slice(0, from) + inserted + value.slice(to), from + inserted.length);
  };
  const finish = (save: boolean, back = false) => {
    if (closed.current) return;
    closed.current = true; refocus.current = back;
    const current = text; setText(null);
    if (!save || current === null) return;
    const value = parseCellInput(current.replace(/\./g, ''));
    const scaled = value === null ? 0 : value * 10 ** decimals;
    if (value === null || (unsigned && value < 0)) { toast.error('Informe um número válido.'); return; }
    if (max !== undefined && value > max) { toast.error(`O valor máximo é ${max}.`); return; }
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) { toast.error(decimals ? `Use no máximo ${decimals} casas decimais.` : 'Informe um número inteiro.'); return; }
    if (Math.abs(value - raw) < 1e-9) return;
    void onCommit(value);
  };
  const open = () => { closed.current = true; setText(null); onOpen(); };

  return <span className="matrix-cell" onDoubleClick={open}>
    {editing
      ? <input ref={input} className="matrix-cell-input" inputMode="decimal" aria-label={label} value={text} onChange={change} onPaste={paste} onBlur={() => finish(true)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); finish(true, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, true); } }} />
      : <button ref={button} type="button" className={`matrix-value ${className}`} aria-disabled={locked || undefined} aria-label={label} title={title} onClick={() => start()}
          onKeyDown={e => { if ((unsigned ? /^[0-9]$/ : /^[0-9-]$/).test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); start(e.key); } }}>{children}</button>}
  </span>;
}
