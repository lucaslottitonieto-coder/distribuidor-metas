import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRelativeInput, settleRelativeInput, maskCellText, maskNumericEdit, parseCellInput, caretAfter, numericInputError } from '../src/numericInput.ts';
import { apportion } from '../src/math.ts';

test('agrupa milhares a cada dígito, sem mudar centavos ou zeros durante a edição', () => {
  assert.deepEqual(['1','12','122','1220','12200','122000','1220000','12200000'].map(maskCellText),
    ['1','12','122','1.220','12.200','122.000','1.220.000','12.200.000']);
  assert.equal(maskCellText('12200000,05'), '12.200.000,05');
  assert.equal(maskCellText('1200,'), '1.200,');
  assert.equal(maskCellText('0,00'), '0,00');
  assert.equal(maskCellText(',5'), '0,5');
  assert.equal(maskCellText(''), '');
});

test('colar números brasileiros e decimais sem agrupamento mantém a escala', () => {
  for (const [text, expected] of [['12.200.000',12200000], ['1.200.000,05',1200000.05], ['1.000',1000], ['1.04',1.04], ['8,34',8.34], ['12200000',12200000]]) {
    assert.equal(parseCellInput(text), expected, text);
  }
  for (const text of ['', 'abc', '1,2,3', '1e6', 'Infinity', '1.2.3']) assert.equal(parseCellInput(text), null, text);
});

test('cursor acompanha os dígitos ao inserir ou apagar próximo aos milhares', () => {
  assert.equal(caretAfter('1.234', 2), 3);
  assert.equal(caretAfter('12.345,05', 6), 7);
  assert.equal(caretAfter('1.234.567', 7), 9);
  assert.equal(caretAfter('', 0), 0);
  assert.deepEqual(maskNumericEdit(',', 1), { text: '0,', caret: 2 });
  assert.deepEqual(maskNumericEdit('1234', 4), { text: '1.234', caret: 5 });
});

test('a máscara mantém as restrições de inteiros, percentuais e casas decimais', () => {
  assert.equal(numericInputError('12200000.05', 0, 90000000000000, '0.01'), '');
  assert.equal(numericInputError('8.34', 0, 100, '0.01'), '');
  assert.match(numericInputError('100.01', 0, 100, '0.01'), /máximo/);
  assert.match(numericInputError('-1', 0), /mínimo/);
  assert.match(numericInputError('1.5', 0, undefined, '1'), /inteiro/);
  assert.match(numericInputError('8.345', 0, 100, '0.01'), /casas decimais/);
});

test('reproduz a diferença de R$ 800 entre pesos percentuais arredondados e divisão igual', () => {
  const annual = 12000000 * 100;
  const percentages = apportion(10000, Array(12).fill(1));
  const monthly = apportion(annual, percentages);
  assert.equal(monthly[0] / 100, 1000800);
  assert.equal((annual - monthly[0] + 1200000 * 100) / 100, 12199200);
  const equal = apportion(annual, Array(12).fill(1));
  assert.equal(equal[0] / 100, 1000000);
  assert.equal((annual - equal[0] + 1200000 * 100) / 100, 12200000);
});

test('metas aceitam sinal de menos e até 3 casas decimais; percentuais continuam sem sinal', () => {
  assert.equal(maskCellText('-1234567', true), '-1.234.567');
  assert.equal(maskCellText('-', true), '-');
  assert.equal(maskCellText('-12,3456', true), '-12,3456');
  assert.equal(maskCellText('-1234'), '1.234');
  assert.equal(parseCellInput('-1.000'), -1000);
  assert.equal(parseCellInput('-83,333'), -83.333);
  assert.equal(maskNumericEdit('-', 1, true).caret, 1);
  assert.equal(maskNumericEdit('-12', 3, true).text, '-12');
  assert.equal(numericInputError('83.333', -9e12, 9e12, '0.001'), '');
  assert.equal(numericInputError('83.3333', -9e12, 9e12, '0.001'), 'Use no máximo três casas decimais.');
  assert.equal(numericInputError('-5', 0, undefined, '0.01'), 'O valor mínimo é 0.');
  assert.equal(numericInputError('8.755', 0, undefined, '0.01'), 'Use no máximo duas casas decimais.');
});

test('comando +/- digitado no campo ajusta o valor que ele tinha, sem tocar em valores comuns', () => {
  assert.equal(applyRelativeInput(1000800, '-49200'), 951600);
  assert.equal(applyRelativeInput(1000800, '+49200'), 1050000);
  assert.equal(applyRelativeInput(1000800, '-49200.5'), 951599.5);
  assert.equal(applyRelativeInput(0.1, '+0.2'), 0.3);
  assert.equal(applyRelativeInput(1000800, '49200'), null);
  assert.equal(applyRelativeInput(1000800, '-'), null);
  assert.equal(applyRelativeInput(1000800, '+'), null);
  assert.equal(applyRelativeInput(1000800, '-12-3-4'), null);
  assert.equal(applyRelativeInput(-500, '-100', false), null);
  assert.equal(applyRelativeInput(-500, '+100', false), -400);
  assert.equal(applyRelativeInput(Number.NaN, '-1'), null);
});

test('conta digitada depois do valor do campo (1.000.800-49.200) também ajusta, e operador sobrando é descartado', () => {
  assert.equal(applyRelativeInput(0, '1000800-49200'), 951600);
  assert.equal(applyRelativeInput(999, '1000800+49200'), 1050000);
  assert.equal(applyRelativeInput(0, '1000800-49200.5'), 951599.5);
  assert.equal(applyRelativeInput(0, '-500-100', false), -600);
  assert.equal(applyRelativeInput(0, '1000800-'), null);
  assert.equal(applyRelativeInput(0, '1000800-1-2'), null);
  assert.equal(settleRelativeInput(1000800, '1000800-49200'), '951600');
  assert.equal(settleRelativeInput(1000800, '-49200'), '951600');
  assert.equal(settleRelativeInput(1000800, '1000800-'), '1000800');
  assert.equal(settleRelativeInput(1000800, '1000800+'), '1000800');
  assert.equal(settleRelativeInput(1000800, '951600'), '951600');
  assert.equal(settleRelativeInput(1000800, '-'), '-');
});
