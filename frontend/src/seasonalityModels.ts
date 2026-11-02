import { apportionOpen } from './math.ts';

export const seasonalityPresets = [
  { id: 'equal', label: 'Igual entre os meses', description: 'Mesma participação ao longo do ano.', weights: Array(12).fill(1) as number[] },
  { id: 'middle', label: 'Maior no meio do ano', description: 'Começa baixo, cresce no meio e termina baixo.', weights: [3, 4, 6, 9, 13, 15, 15, 13, 9, 6, 4, 3] },
  { id: 'increasing', label: 'Crescente mês a mês', description: 'Começa baixo e aumenta até dezembro.', weights: Array.from({ length: 12 }, (_, i) => i + 1) },
] as const;

export type SeasonalityPresetId = typeof seasonalityPresets[number]['id'];

/** Compara os valores digitados com o perfil, sem marcar vírgulas/zeros de formatação como alteração. */
export function seasonalityDraftMatches(values: string[] | undefined, weights: number[] | undefined): boolean {
  return !!values && !!weights && values.length === 12 && weights.length === 12 &&
    values.every((value, i) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) === weights[i]);
}

/** Percentuais em centésimos: preserva os meses fechados e distribui o saldo até 100%. */
export function presetWeights(id: SeasonalityPresetId, original: number[] = Array(12).fill(0), closed: Set<number> = new Set()): number[] | null {
  const preset = seasonalityPresets.find(p => p.id === id)!;
  return apportionOpen(10000, [...preset.weights], original, closed);
}
