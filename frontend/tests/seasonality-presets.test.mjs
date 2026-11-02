import test from 'node:test';
import assert from 'node:assert/strict';
import { presetWeights, seasonalityPresets, seasonalityDraftMatches } from '../src/seasonalityModels.ts';

test('modelos fecham em 100% com precisão de duas casas e mantêm o formato esperado', () => {
  for (const { id } of seasonalityPresets) {
    const weights = presetWeights(id);
    assert.equal(weights.length, 12);
    assert.equal(weights.reduce((sum, value) => sum + value, 0), 10000);
    assert.ok(weights.every(value => Number.isInteger(value) && value > 0));
  }
  const equal = presetWeights('equal');
  assert.ok(Math.max(...equal) - Math.min(...equal) <= 1);
  const middle = presetWeights('middle');
  assert.deepEqual(middle, [...middle].reverse());
  assert.ok(middle.slice(1, 6).every((value, i) => value > middle[i]));
  const increasing = presetWeights('increasing');
  assert.ok(increasing.slice(1).every((value, i) => value > increasing[i]));
});

test('cada modelo preserva percentuais fechados e distribui somente o saldo', () => {
  const original = [2000, 1000, ...Array(10).fill(700)];
  for (const { id } of seasonalityPresets) {
    for (const closed of [new Set([1, 2]), new Set([1, 4, 8]), new Set(Array.from({ length: 11 }, (_, i) => i + 1))]) {
      const weights = presetWeights(id, original, closed);
      assert.equal(weights.reduce((sum, value) => sum + value, 0), 10000);
      for (const month of closed) assert.equal(weights[month - 1], original[month - 1]);
    }
  }
  assert.deepEqual(original, [2000, 1000, ...Array(10).fill(700)]);
});

test('modelos não são aplicáveis se todos os meses estão fechados ou o saldo é inválido', () => {
  for (const { id } of seasonalityPresets) {
    assert.equal(presetWeights(id, Array(12).fill(834), new Set(Array.from({ length: 12 }, (_, i) => i + 1))), null);
    assert.equal(presetWeights(id, [10001, ...Array(11).fill(0)], new Set([1])), null);
    assert.deepEqual(presetWeights(id, [10000, ...Array(11).fill(0)], new Set([1])), [10000, ...Array(11).fill(0)]);
  }
});

test('perfil personalizado salvo não volta a ser considerado um rascunho do modelo crescente', () => {
  const saved = [6.52, 2.56, 3.85, 5.13, 6.41, 7.69, 8.97, 10.26, 11.54, 12.82, 14.1, 10.15];
  assert.equal(seasonalityDraftMatches(saved.map(String), saved), true);
  assert.equal(seasonalityDraftMatches(saved.map(value => value.toFixed(2)), saved), true);
  assert.equal(seasonalityDraftMatches(presetWeights('increasing').map(value => String(value / 100)), saved), false);
  for (const invalid of [undefined, [], [...saved.map(String).slice(0, 11)], ['', ...saved.slice(1).map(String)], ['NaN', ...saved.slice(1).map(String)]]) {
    assert.equal(seasonalityDraftMatches(invalid, saved), false);
  }
  assert.equal(seasonalityDraftMatches(saved.map(String), undefined), false);
});
