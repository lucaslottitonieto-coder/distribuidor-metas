import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from 'broto-ui';
import { maskCellText, maskNumericEdit, numericInputError, parseCellInput } from './numericInput';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'ref'> & {
  value: string | number;
  onValueChange: (value: string) => void;
  adjustOnWheel?: boolean;
  /** Aceita ajustes: "+49200", "-49200" ou uma conta depois do valor ("1.000.800-49.200"), resolvidos por quem usa o campo. */
  relative?: boolean;
};

/** Mantém a máscara e o cursor enquanto o estado dos formulários recebe números sem separadores. */
export function NumberInput({ value, onValueChange, min = 0, max, step = '0.01', adjustOnWheel = false, relative = false, onBlur, ...props }: Props) {
  // Mínimo negativo habilita o sinal de menos (metas); percentuais continuam sem sinal.
  const signed = Number(min) < 0;
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  // Preserva vírgula e zeros decimais durante a edição mesmo em formulários com estado numérico.
  const [draft, setDraft] = useState<{ text: string; value: string } | null>(null);
  const canonical = String(value);
  const text = draft && (draft.value === canonical || (canonical !== '' && Number(draft.value) === Number(canonical)))
    ? draft.text : maskCellText(canonical.replace('.', ','), signed);
  const raw = text.replace(/\./g, '').replace(',', '.');
  useLayoutEffect(() => {
    // Numa conta em andamento ("1.000.800-49.200") vale o número antes do operador.
    input.current?.setCustomValidity(numericInputError(relative ? raw.replace(/(?<=\d)[+-].*$/, '') : raw, min, max, step));
    if (caret.current !== null) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  useLayoutEffect(() => {
    const element = input.current;
    const increment = Number(step);
    if (!adjustOnWheel || !element || !Number.isFinite(increment) || increment <= 0) return;
    const wheel = (event: WheelEvent) => {
      if (element.matches(':disabled') || element.readOnly || event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // O listener nativo permite impedir a rolagem da página sobre o percentual.
      event.preventDefault();
      const current = parseCellInput(element.value) ?? Number(min);
      const next = Math.min(Number(max ?? Infinity), Math.max(Number(min), Number((current + (event.deltaY < 0 ? increment : -increment)).toFixed(10))));
      if (next === current && raw !== '') return;
      const canonical = String(next);
      const masked = maskCellText(canonical.replace('.', ','), signed);
      element.value = masked;
      setDraft({ text: masked, value: canonical });
      onValueChange(canonical);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  });
  const update = (typed: string, typedPosition: number) => {
    // Conta depois do valor: cada lado leva a máscara e o operador fica entre eles.
    const sum = relative ? /^(\s*-?[\d.,\s]*[\d,])\s*([+-])\s*([\d.,\s]*)$/.exec(typed) : null;
    if (sum) {
      const left = maskCellText(sum[1].replace(/\s/g, ''), signed), right = maskCellText(sum[3].replace(/\s/g, ''));
      const masked = left + sum[2] + right;
      const plain = (t: string) => t.replace(/\./g, '').replace(',', '.');
      // O cursor acompanha o mesmo número de dígitos que ficou antes dele, do lado do operador em que estava.
      const operatorAt = typed.indexOf(sum[2], sum[1].length), after = typedPosition > operatorAt;
      const digits = (after ? typed.slice(operatorAt + 1, typedPosition) : typed.slice(0, typedPosition)).replace(/[^\d,]/g, '').length;
      let seen = 0, position = after ? left.length + 1 : 0;
      while (position < masked.length && seen < digits) { if (/[\d,]/.test(masked[position])) seen++; position++; }
      caret.current = position;
      setDraft({ text: masked, value: plain(left) + sum[2] + plain(right) });
      onValueChange(plain(left) + sum[2] + plain(right));
      return;
    }
    // O "+" de comando fica fora da máscara: só o número depois dele é formatado.
    const lead = relative ? /^\s*\+/.exec(typed)?.[0].length ?? 0 : 0;
    const sign = lead ? '+' : '';
    const next = typed.slice(lead), position = Math.max(0, typedPosition - lead);
    if ((signed ? /[^\d.,\s-]/ : /[^\d.,\s]/).test(next) || (lead && next.trimStart().startsWith('-'))) return;
    const edit = maskNumericEdit(next, position, signed);
    const masked = sign + edit.text;
    const raw = sign + edit.text.replace(/\./g, '').replace(',', '.');
    caret.current = edit.caret + sign.length;
    setDraft({ text: masked, value: raw });
    onValueChange(raw);
  };
  return <Input {...props} ref={input} type="text" inputMode={Number(step) === 1 ? 'numeric' : 'decimal'} value={text}
    onChange={e => {
      const { value, selectionStart } = e.target;
      const position = selectionStart ?? value.length;
      const typed = (e.nativeEvent as InputEvent).data ?? '';
      update(typed === '.' ? value.slice(0, position - 1) + ',' + value.slice(position) : value, position);
    }}
    onPaste={e => {
      e.preventDefault();
      const pasted = parseCellInput(e.clipboardData.getData('text'));
      if (pasted === null || (pasted < 0 && !signed)) return;
      const from = e.currentTarget.selectionStart ?? text.length;
      const to = e.currentTarget.selectionEnd ?? from;
      const inserted = String(pasted).replace('.', ',');
      update(text.slice(0, from) + inserted + text.slice(to), from + inserted.length);
    }}
    onBlur={e => { setDraft(null); onBlur?.(e); }} />;
}
