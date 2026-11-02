export type Unit = 'BRL' | 'UN' | 'PCT';

/** Todas as unidades guardam valores em milésimos (3 casas decimais). */
export const AMOUNT_SCALE = 1000;
export const unitScale = (_unit?: string) => AMOUNT_SCALE;
/** Menor valor que um mês recebe ao dividir o total (mesma regra da API): reais e unidades cheios; % mantém as 3 casas. */
export const distributionStep = (unit?: string) => unit === 'PCT' ? 1 : AMOUNT_SCALE;
/** Maior valor (em módulo) aceito: 9 trilhões, para caber em milésimos inteiros seguros. */
export const MAX_AMOUNT = 9_000_000_000_000;
export const unitSymbol = (unit: string) => unit === 'BRL' ? 'R$' : unit === 'PCT' ? '%' : 'unidades';
export const unitLabel = (unit: string) => unit === 'BRL' ? 'Reais (R$)' : unit === 'PCT' ? 'Percentual (%)' : 'Quantidade';
const decimal = (value: number, digits: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const loose = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function formatGoal(value: number, unit = 'BRL') {
  if (unit === 'BRL') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 });
  if (unit === 'PCT') return `${loose(value)}%`;
  return `${loose(value)} un.`;
}

export function compactGoal(value: number, unit = 'BRL') {
  if (unit === 'PCT') return formatGoal(value, unit);
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}${unit === 'BRL' ? 'R$ ' : ''}${abs >= 1e6 ? `${decimal(abs / 1e6, 2)} mi` : abs >= 1e3 ? `${decimal(abs / 1e3, 1)} mil` : loose(abs)}`;
}
