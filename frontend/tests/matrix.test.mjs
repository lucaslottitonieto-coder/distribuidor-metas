import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixNumber, totalPortfolio, planningOrigin, walletTone } from '../src/matrixUtils.ts';
import { formatGoal, compactGoal, unitScale } from '../src/units.ts';

test('metas percentuais preservam casas decimais e símbolo em todas as formatações',()=>{
  assert.equal(formatGoal(12.55, 'PCT'), '12,55%');
  assert.equal(compactGoal(12.55, 'PCT'), '12,55%');
  assert.equal(matrixNumber(12.55, 'PCT'), '12,55%');
  assert.equal(totalPortfolio([{amount: 1.25}, {amount: 2.55}], 'PCT'), 3.8);
  // Todas as unidades guardam milésimos (3 casas decimais).
  assert.equal(unitScale('PCT'), 1000);
  assert.equal(unitScale('UN'), 1000);
  assert.equal(unitScale('BRL'), 1000);
});

test('formatação mostra até 3 casas decimais e valores negativos em qualquer unidade',()=>{
  assert.equal(matrixNumber(83.333,'UN'),'83,333');
  assert.equal(matrixNumber(-1234.5675,'BRL'),'-1.234,568');
  assert.equal(matrixNumber(-0.5,'PCT'),'-0,5%');
  assert.equal(formatGoal(83.333,'UN'),'83,333 un.');
  assert.equal(formatGoal(-12.5,'BRL').replace(/\s/g,' '),'-R$ 12,50');
  assert.equal(compactGoal(-2500000,'BRL'),'-R$ 2,50 mi');
  assert.equal(totalPortfolio([{amount:-1.001},{amount:2.002}],'UN'),1.001);
});

test('matriz preserva centavos e formata unidades inteiras',()=>{
  assert.equal(matrixNumber(708333.34,'BRL'),'708.333,34');
  assert.equal(matrixNumber(1100000,'BRL'),'1.100.000');
  assert.equal(matrixNumber(950,'UN'),'950');
  assert.equal(totalPortfolio([{amount:.1},{amount:.2},{amount:.01}],'BRL'),.31);
});
test('origem distingue a planilha de sazonalidade e ajuste manual',()=>{
  const initial={manual_months:0,planning_method:'imported',missing_months:[4]};
  assert.equal(planningOrigin(initial).label,'Planilha · 11m');
  assert.equal(planningOrigin({...initial,planning_method:'seasonal'}).label,'Sazonalidade');
  assert.equal(planningOrigin({...initial,manual_months:2}).label,'Ajuste manual · 2m');
  assert.equal(planningOrigin({...initial,planning_method:'unconfigured'}).label,'A definir');
});

test('card da carteira: 1 a 6 têm cor própria, acima repete 2 a 6 e texto vira neutro',()=>{
  assert.deepEqual(['1','2','3','4','5','6'].map(walletTone), [1,2,3,4,5,6]);
  assert.deepEqual(['7','8','9','10','11'].map(walletTone), [2,3,4,5,6]);
  assert.equal(walletTone('AG'), 0);
  assert.equal(walletTone('0'), 0);
});
