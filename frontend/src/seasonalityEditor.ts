import type { SeasonalityProfile } from './api';
import { seasonalityDraftMatches } from './seasonalityModels.ts';

export type SeasonalityEditorState = {
  profiles: Record<number, SeasonalityProfile>;
  drafts: Record<number, string[]>;
};

export type SeasonalityEditorAction =
  | { type: 'load'; profiles: SeasonalityProfile[] }
  | { type: 'month'; productId: number; index: number; value: string }
  | { type: 'replace'; productId: number; values: string[] }
  | { type: 'reset'; productId: number }
  | { type: 'saved'; profile: SeasonalityProfile; submitted: number[] };

export function seasonalityEditorState(profiles: SeasonalityProfile[]): SeasonalityEditorState {
  return { profiles: Object.fromEntries(profiles.map(profile => [profile.product_id, { ...profile, weights: [...profile.weights] }])), drafts: {} };
}

export function confirmedSeasonalitySave(profile: SeasonalityProfile | undefined, submitted: { product: { id: number }; year: number; revision: number; weights: number[] }): boolean {
  return !!profile && profile.product_id === submitted.product.id && profile.year === submitted.year &&
    profile.revision > submitted.revision && seasonalityDraftMatches(submitted.weights.map(String), profile.weights);
}

/** Uma única atualização confirma o perfil e retira somente o rascunho que foi salvo. */
export function seasonalityEditorReducer(state: SeasonalityEditorState, action: SeasonalityEditorAction): SeasonalityEditorState {
  if (action.type === 'load') {
    const profiles = { ...state.profiles };
    for (const incoming of action.profiles) {
      const current = profiles[incoming.product_id];
      // Uma leitura anterior ao POST não pode substituir a resposta confirmada pelo POST.
      if (!current || incoming.revision > current.revision) profiles[incoming.product_id] = { ...incoming, weights: [...incoming.weights] };
    }
    const drafts = Object.fromEntries(Object.entries(state.drafts).filter(([id, values]) => !seasonalityDraftMatches(values, profiles[Number(id)]?.weights)));
    return { profiles, drafts };
  }
  const productId = action.type === 'saved' ? action.profile.product_id : action.productId;
  const drafts = { ...state.drafts };
  if (action.type === 'saved') {
    if (!drafts[productId] || seasonalityDraftMatches(drafts[productId], action.submitted)) delete drafts[productId];
    return { profiles: { ...state.profiles, [productId]: { ...action.profile, weights: [...action.profile.weights] } }, drafts };
  }
  if (action.type === 'reset') delete drafts[productId];
  else {
    const profile = state.profiles[productId];
    if (!profile) return state;
    // Cada mês parte do estado mais recente, inclusive em eventos próximos no mesmo quadro.
    const values = action.type === 'replace' ? [...action.values] : (drafts[productId] ?? profile.weights.map(String)).map((value, index) => index === action.index ? action.value : value);
    if (seasonalityDraftMatches(values, profile.weights)) delete drafts[productId];
    else drafts[productId] = values;
  }
  return { profiles: state.profiles, drafts };
}
