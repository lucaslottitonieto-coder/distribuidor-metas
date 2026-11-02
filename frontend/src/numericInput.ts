/** Texto brasileiro para digitação; o valor enviado à API usa ponto decimal e nenhum milhar. */
export function maskCellText(text: string, signed = false) {
  const negative = signed && text.trimStart().startsWith('-');
  const [integer = '', ...decimals] = text.replace(/[^\d,]/g, '').split(',');
  const grouped = integer.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negative ? '-' : '') + (decimals.length ? `${grouped || '0'},${decimals.join('')}` : grouped);
}

export function parseCellInput(text: string) {
  const value = text.trim().replace(/\s/g, '');
  if (!value) return null;
  const normalized = value.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(value)
    ? value.replace(/\./g, '').replace(',', '.') : value;
  if (!/^-?\d+(\.\d*)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function caretAfter(masked: string, significant: number) {
  let seen = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '-') continue;
    if (seen === significant) return i;
    if (masked[i] !== '.') seen++;
  }
  return masked.length;
}

export function maskNumericEdit(text: string, position: number, signed = false) {
  const masked = maskCellText(text, signed);
  const prefix = text.slice(0, position).replace(/[^\d,]/g, '');
  // A vírgula no campo vazio insere um zero antes dela: o cursor segue após a vírgula.
  const significant = prefix.length + (prefix.startsWith(',') ? 1 : 0);
  return { text: masked, caret: caretAfter(masked, significant) };
}

export function numericInputError(value: string, min?: number | string, max?: number | string, step?: number | string) {
  if (!value) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Informe um número válido.';
  const display = (n: number) => n.toLocaleString('pt-BR');
  if (min !== undefined && number < Number(min)) return `O valor mínimo é ${display(Number(min))}.`;
  if (max !== undefined && number > Number(max)) return `O valor máximo é ${display(Number(max))}.`;
  if (step !== undefined && step !== 'any' && Number(step) > 0) {
    // Passos decimais (1, 0.01, 0.001) são conferidos pelo texto: dividir valores grandes perderia precisão.
    const places = String(step).split('.')[1]?.length ?? 0;
    const decimalStep = Number(step) === 10 ** -places;
    const typedPlaces = value.split('.')[1]?.length ?? 0;
    const steps = (number - (Number(min ?? 0) > 0 ? Number(min) : 0)) / Number(step);
    if (decimalStep ? typedPlaces > places : Math.abs(steps - Math.round(steps)) > 1e-6) {
      return places === 0 ? 'Informe um número inteiro.' : `Use no máximo ${places === 1 ? 'uma casa decimal' : `${places === 2 ? 'duas' : places === 3 ? 'três' : places} casas decimais`}.`;
    }
  }
  return '';
}

/**
 * Ajuste digitado num campo, em duas formas:
 * - conta com o valor do campo: "1000800-49200" (valor, operador e quanto tirar ou somar), como no Excel sem o "=";
 * - comando só com o sinal: "-49200" tira 49.200 e "+49200" soma 49.200 do valor que o campo tinha ao receber o foco.
 * Devolve o novo valor, ou null quando o texto é um valor comum. Em metas negativas o "-" no início é um valor
 * (não um comando), então `minusIsCommand` vem desligado; a conta com valor na frente vale sempre.
 */
export function applyRelativeInput(base: number, text: string, minusIsCommand = true) {
  const value = text.trim();
  const sum = /^(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/.exec(value);
  if (sum) return Number((Number(sum[1]) + (sum[2] === '-' ? -1 : 1) * Number(sum[3])).toFixed(3));
  const command = /^([+-])(\d+(?:\.\d+)?)$/.exec(value);
  if (!command || !Number.isFinite(base) || (command[1] === '-' && !minusIsCommand)) return null;
  return Number((base + (command[1] === '-' ? -1 : 1) * Number(command[2])).toFixed(3));
}

/** Texto do campo já com o ajuste aplicado; um operador sobrando no fim ("1000800-") é descartado. */
export function settleRelativeInput(base: number, text: string, minusIsCommand = true) {
  const result = applyRelativeInput(base, text, minusIsCommand);
  if (result !== null) return String(result);
  return /^-?\d+(?:\.\d+)?[+-]$/.test(text.trim()) ? text.trim().slice(0, -1) : text;
}
