import { presetWeights, seasonalityPresets, type SeasonalityPresetId } from './seasonalityModels';
import './seasonality-presets.css';

export function SeasonalityPresets({ weights, original, closed = new Set<number>(), disabled, onSelect }: {
  weights: number[];
  original?: number[];
  closed?: Set<number>;
  disabled?: boolean;
  onSelect: (id: SeasonalityPresetId, weights: string[]) => void;
}) {
  return <div className="season-presets" role="group" aria-label="Modelos de sazonalidade">
    <div className="season-presets-heading"><strong>Modelos de sazonalidade</strong><small>{closed.size ? 'Os meses fechados são preservados; o saldo é distribuído nos meses abertos.' : 'Escolha um modelo e ajuste os percentuais se desejar.'}</small></div>
    <div className="season-presets-options">{seasonalityPresets.map(preset => {
      const next = presetWeights(preset.id, original, closed);
      const selected = !!next && next.every((value, i) => value === weights[i]);
      const max = Math.max(...preset.weights);
      return <button type="button" key={preset.id} className="season-preset" aria-pressed={selected} disabled={disabled || !next} onClick={() => next && onSelect(preset.id, next.map(value => String(value / 100)))}>
        <span className="season-preset-chart" aria-hidden="true">{preset.weights.map((value, i) => <i key={i} style={{ height: `${value / max * 100}%` }} />)}</span>
        <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
      </button>;
    })}</div>
  </div>;
}
