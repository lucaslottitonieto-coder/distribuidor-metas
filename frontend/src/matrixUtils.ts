import { unitScale } from './units.ts';

/** Formatação das matrizes conforme a unidade do produto. */
export function matrixNumber(value: number, unit: string) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + (unit === 'PCT' ? '%' : '');
}

export function totalPortfolio(months: {amount: number}[], unit: string) {
  const scale = unitScale(unit);
  return months.reduce((sum, month) => sum + Math.round(month.amount * scale), 0) / scale;
}

/** Cor do card da carteira: 1 a 6 têm cor própria; acima disso repete as cores de 2 a 6. 0 = neutro (código não numérico). */
export function walletTone(code: string) {
  const n = Number.parseInt(code, 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return n <= 6 ? n : ((n - 2) % 5) + 2;
}

export function planningOrigin(goal: {manual_months: number; planning_method: string; missing_months: number[]}) {
  if (goal.planning_method === 'annual') return {label: 'A distribuir', tone: 'empty'};
  if (goal.planning_method === 'annual_imported') return {label: 'Excel · a distribuir', tone: 'empty'};
  if (goal.planning_method === 'equal') return {label: 'Divisão igual', tone: 'seasonal'};
  if (goal.planning_method === 'percent') return {label: 'Percentuais (%)', tone: 'seasonal'};
  if (goal.manual_months) return {label: `Ajuste manual · ${goal.manual_months}m`, tone: 'manual'};
  if (goal.planning_method === 'seasonal') return {label: 'Sazonalidade', tone: 'seasonal'};
  if (goal.planning_method === 'imported') return {label: `Planilha · ${12 - goal.missing_months.length}m`, tone: 'imported'};
  if (goal.planning_method === 'copied') return {label: 'Ano anterior', tone: 'copied'};
  if (goal.planning_method === 'monthly') return {label: 'Revisão manual', tone: 'manual'};
  return {label: 'A definir', tone: 'empty'};
}
