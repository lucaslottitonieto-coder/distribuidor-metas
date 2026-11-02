import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSeasonalitySave, seasonalityEditorReducer as reduce, seasonalityEditorState } from '../src/seasonalityEditor.ts';

const increasing = [1.28, 2.56, 3.85, 5.13, 6.41, 7.69, 8.97, 10.26, 11.54, 12.82, 14.1, 15.39];
const profile = (extra = {}) => ({ product_id: 1, year: 2026, revision: 1, weights: [...increasing], ...extra });
const edit = (state, index, value, productId = 1) => reduce(state, { type: 'month', productId, index, value });
const edited = () => edit(edit(seasonalityEditorState([profile()]), 3, '10.13'), 11, '10.39');
const commit = state => reduce(state, { type: 'saved', profile: profile({ revision: 2, weights: state.drafts[1].map(Number) }), submitted: state.drafts[1].map(Number) });

test('alterar abril e dezembro em sequência conserva as duas alterações e os outros dez meses', () => {
  const state = edited();
  const expected = [...increasing]; expected[3] = 10.13; expected[11] = 10.39;
  assert.deepEqual(state.drafts[1].map(Number), expected);
  assert.equal(state.drafts[1].reduce((sum, value) => sum + Math.round(Number(value) * 100), 0), 10000);
  assert.deepEqual(state.profiles[1].weights, increasing);
});

test('confirmar o salvamento troca perfil e rascunho juntos, sem voltar ao modelo inicial', () => {
  let state = commit(edited());
  assert.equal(state.drafts[1], undefined);
  assert.equal(state.profiles[1].revision, 2);
  for (const incoming of [profile(), profile({ revision: 0 }), profile({ revision: 2 })]) {
    state = reduce(state, { type: 'load', profiles: [incoming] });
    assert.equal(state.profiles[1].weights[3], 10.13);
    assert.equal(state.profiles[1].weights[11], 10.39);
    assert.deepEqual(state.drafts, {});
  }
});

test('atualizar o servidor e depois recarregar conserva os percentuais confirmados', () => {
  let state = commit(edited());
  state = reduce(state, { type: 'load', profiles: [profile({ revision: 2, weights: [...state.profiles[1].weights] })] });
  const reloaded = seasonalityEditorState(Object.values(state.profiles));
  assert.equal(reloaded.profiles[1].weights[3], 10.13);
  assert.equal(reloaded.profiles[1].weights[11], 10.39);
  assert.deepEqual(reloaded.drafts, {});
});

test('salvar um subproduto conserva as alterações não salvas dos outros e edições posteriores', () => {
  let state = seasonalityEditorState([profile(), profile({ product_id: 2 })]);
  state = edit(edit(edit(state, 3, '10.13'), 11, '10.39'), 0, '9', 2);
  const submitted = state.drafts[1].map(Number);
  state = edit(state, 3, '11.13');
  state = reduce(state, { type: 'saved', profile: profile({ revision: 2, weights: submitted }), submitted });
  assert.equal(state.drafts[1][3], '11.13');
  assert.equal(state.drafts[2][0], '9');
  assert.equal(state.profiles[1].weights[3], 10.13);
});

test('desfazer usa o último perfil confirmado e formatação igual não cria alteração pendente', () => {
  let state = commit(edited());
  state = edit(state, 3, '10.130');
  assert.deepEqual(state.drafts, {});
  state = edit(state, 3, '');
  assert.equal(state.drafts[1][3], '');
  state = reduce(state, { type: 'reset', productId: 1 });
  assert.deepEqual(state.drafts, {});
  assert.equal(state.profiles[1].weights[3], 10.13);
});

test('nova versão externa é recebida sem descartar edição local, e modelos só mudam por ação explícita', () => {
  let state = edited();
  state = reduce(state, { type: 'load', profiles: [profile({ revision: 3, weights: [8.34, 8.34, 8.34, 8.34, ...Array(8).fill(8.33)] })] });
  assert.equal(state.drafts[1][3], '10.13');
  assert.equal(state.drafts[1][11], '10.39');
  const values = increasing.map(String);
  state = reduce(state, { type: 'replace', productId: 1, values });
  values[3] = '99';
  assert.equal(state.drafts[1][3], '5.13');
});

test('resposta antiga, de outro perfil ou com pesos diferentes não pode confirmar o salvamento', () => {
  const submitted = { product: { id: 1 }, year: 2026, revision: 1, weights: edited().drafts[1].map(Number) };
  const confirmed = profile({ revision: 2, weights: [...submitted.weights] });
  assert.equal(confirmedSeasonalitySave(confirmed, submitted), true);
  for (const rejected of [undefined, profile(), { ...confirmed, revision: 1 }, { ...confirmed, product_id: 2 }, { ...confirmed, year: 2027 }, { ...confirmed, weights: increasing }]) {
    assert.equal(confirmedSeasonalitySave(rejected, submitted), false);
  }
});
