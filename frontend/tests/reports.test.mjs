import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLines, summarizeByProduct, findIssues, countByKind, agencyCompleteness, consolidate, walletRows, bySegment, byManager, describeIssue, quarters, toCsv, NO_FILTERS, NO_MANAGER } from '../src/reportData.ts';

const flat = (value) => Array(12).fill(value);
const wallet = (id, code, segment, manager, amounts, percents) => ({ id, code, name: `Carteira ${code}`, manager, segment_id: segment, segment_code: `S${segment}`, segment_name: `Segmento ${segment}`, color: '#123456', months: amounts.map((amount, i) => ({ month: i + 1, amount, percent: percents[i] })) });
const goal = (id, product, unit, annual, months, extra = {}) => ({ id, product_id: product, product_name: `Produto ${product}`, sub_product: `Sub ${product}`, unit, annual_amount: annual, annual_pending: false, missing_months: [], months: months.map((amount, i) => ({ month: i + 1, amount, manual: 0, closed: false })), ...extra });
const agency = (id, code, regional, name) => ({ id, code, name: `Agência ${code}`, regional_id: regional, regional_name: name });

// Agência 1 (Regional A): Crédito completo, 3 carteiras 50/30/20. Agência 2 (Regional B): Crédito com carteira zerada.
const complete = { agency: agency(1, '001', 1, 'Regional A'), goal: goal(1, 1, 'BRL', 1200, flat(100)), portfolios: [
  wallet(11, '1', 1, 'Ana', flat(50), flat(50)), wallet(12, '2', 2, 'Bia', flat(30), flat(30)), wallet(13, '3', 2, 'Ana', flat(20), flat(20))] };
const zeroed = { agency: agency(2, '002', 2, 'Regional B'), goal: goal(2, 1, 'BRL', 600, flat(50)), portfolios: [
  wallet(21, '1', 1, 'Caio', flat(50), flat(100)), wallet(22, '2', 2, '', flat(0), flat(0))] };
const rate = { agency: agency(1, '001', 1, 'Regional A'), goal: goal(3, 2, 'PCT', 5, flat(5)), portfolios: [wallet(14, '1', 1, 'Ana', flat(5), flat(100))] };
const rows = [complete, zeroed, rate];

test('filtros de regional, agência e subproduto escolhem as metas; segmento e gestor recalculam pelas carteiras', () => {
  assert.equal(buildLines(rows, NO_FILTERS).length, 3);
  assert.deepEqual(buildLines(rows, { ...NO_FILTERS, regional: 1 }).map(l => l.key), [1, 3]);
  assert.deepEqual(buildLines(rows, { ...NO_FILTERS, product: 1, agency: 2 }).map(l => l.key), [2]);
  const gestor = buildLines(rows, { ...NO_FILTERS, product: 1, manager: 'Ana' });
  assert.deepEqual(gestor.map(l => [l.key, l.total]), [[1, 840]]);
  assert.equal(gestor[0].scoped, true);
  assert.equal(gestor[0].planned, 840);
  const segmento = buildLines(rows, { ...NO_FILTERS, product: 1, segment: 2 });
  assert.deepEqual(segmento.map(l => [l.key, l.total]), [[1, 600], [2, 0]]);
  assert.equal(buildLines(rows, { ...NO_FILTERS, manager: NO_MANAGER })[0].agency.id, 2);
});

test('resumo por subproduto soma metas e meses sem misturar unidades', () => {
  const [credito, pct] = summarizeByProduct(buildLines(rows, NO_FILTERS));
  assert.equal(credito.product.id, 1);
  assert.deepEqual([credito.planned, credito.total, credito.agencies, credito.goals, credito.loaded], [1800, 1800, 2, 2, 2]);
  assert.deepEqual(credito.months, flat(150));
  assert.equal(pct.additive, false);
  assert.deepEqual(quarters(credito.months), [450, 450, 450, 450]);
});

test('conferência acha cada tipo de pendência e a carteira zerada não vira "só uma zerada"', () => {
  const problems = [
    { agency: agency(3, '003', 1, 'Regional A'), goal: goal(30, 1, 'BRL', 1200, flat(90)), portfolios: complete.portfolios },
    { agency: agency(4, '004', 1, 'Regional A'), goal: goal(31, 1, 'BRL', 1200, flat(0), { annual_pending: true }), portfolios: complete.portfolios },
    { agency: agency(5, '005', 1, 'Regional A'), goal: goal(32, 1, 'BRL', 0, flat(0)), portfolios: [] },
    { agency: agency(6, '006', 1, 'Regional A'), goal: goal(33, 1, 'BRL', 1200, flat(100)), portfolios: [] },
    { agency: agency(7, '007', 1, 'Regional A'), goal: goal(34, 1, 'BRL', 1200, flat(100), { missing_months: [4, 5] }), portfolios: [wallet(71, '1', 1, 'A', flat(100), flat(90))] },
    { agency: agency(8, '008', 1, 'Regional A'), goal: goal(35, 1, 'BRL', 1200, flat(100)), portfolios: [
      wallet(81, '1', 1, 'A', [0, ...Array(11).fill(60)], [0, ...Array(11).fill(60)]), wallet(82, '2', 1, 'B', [100, ...Array(11).fill(40)], [100, ...Array(11).fill(40)])] },
  ];
  const issues = findIssues(buildLines([...rows, ...problems], NO_FILTERS));
  const kinds = (key) => issues.filter(i => i.line.key === key).map(i => i.kind);
  assert.deepEqual(kinds(1), []);
  assert.deepEqual(kinds(2), ['carteira_zerada']);
  assert.deepEqual(kinds(30), ['faltam']);
  assert.equal(issues.find(i => i.line.key === 30).amount, 120);
  assert.deepEqual(kinds(31), ['a_distribuir']);
  assert.deepEqual(kinds(32), ['sem_total']);
  assert.deepEqual(kinds(33), ['sem_carteiras']);
  assert.deepEqual(kinds(34).sort(), ['meses_origem', 'percentual']);
  assert.deepEqual(issues.find(i => i.line.key === 34 && i.kind === 'percentual').months, flat(0).map((_, i) => i + 1));
  assert.deepEqual(kinds(35), ['uma_zerada']);
  const lone = issues.find(i => i.line.key === 35 && i.kind === 'uma_zerada');
  assert.equal(lone.wallet.id, 81);
  assert.deepEqual(lone.months, [1]);
  // Carteira zerada o ano todo é "Carteira sem meta"; nunca conta também como "só uma zerada".
  assert.equal(issues.filter(i => i.line.key === 2 && i.kind === 'uma_zerada').length, 0);
  assert.deepEqual(issues.map(i => i.severity), [...issues.map(i => i.severity)].sort((a, b) => ({ alta: 0, media: 1, baixa: 2 })[a] - ({ alta: 0, media: 1, baixa: 2 })[b]));
  assert.equal(countByKind(issues).faltam, 1);
});

test('agência completa não tem pendência alta nem média; sem meta carregada não bloqueia', () => {
  const lines = buildLines(rows, NO_FILTERS);
  const status = agencyCompleteness(lines, findIssues(lines));
  assert.deepEqual(status, { total: 2, complete: 1 });
});

test('textos das pendências usam o formatador recebido', () => {
  const lines = buildLines([{ ...complete, goal: goal(1, 1, 'BRL', 1300, flat(100)) }], NO_FILTERS);
  const [issue] = findIssues(lines);
  assert.equal(describeIssue(issue, (v, unit) => `${unit} ${v}`, ['Jan']), 'Faltam BRL 100 para fechar o total anual.');
});

test('consolidado agrupa por subproduto e regional; percentual não ganha subtotal', () => {
  const [credito, pct] = consolidate(buildLines(rows, NO_FILTERS));
  assert.deepEqual(credito.rows.map(r => [r.level, r.label, r.total]), [['regional', 'Regional A', 1200], ['agency', 'Agência 001', 1200], ['regional', 'Regional B', 600], ['agency', 'Agência 002', 600]]);
  assert.deepEqual(pct.rows.map(r => [r.level, r.total]), [['regional', 0], ['agency', 60]]);
});

test('carteiras: participação na meta da agência, por segmento e por gestor', () => {
  const walletsRows = walletRows(buildLines(rows, { ...NO_FILTERS, product: 1 }));
  assert.equal(walletsRows.length, 5);
  const first = walletsRows.find(r => r.wallet.id === 11);
  assert.equal(first.total, 600);
  assert.equal(first.share, 0.5);
  const segments = bySegment(walletsRows);
  assert.deepEqual(segments.map(s => [s.label, s.total, s.wallets]), [['S1 · Segmento 1', 1200, 2], ['S2 · Segmento 2', 600, 3]]);
  assert.equal(Math.round(segments.reduce((s, x) => s + x.share, 0) * 1000) / 1000, 1);
  const managers = byManager(walletsRows);
  assert.deepEqual(managers.map(m => m.label), ['Ana', 'Caio', 'Bia', NO_MANAGER]);
  assert.equal(managers[0].total, 840);
  assert.equal(managers[0].agencies, 1);
});

test('CSV leva BOM, vírgula decimal e protege textos que parecem fórmula', () => {
  assert.equal(toCsv([['Agência', 'Total'], ['=SOMA(A1)', 1234.5], ['-5 texto', -3]]), '﻿"Agência";"Total"\r\n"\'=SOMA(A1)";"1234,5"\r\n"\'-5 texto";"-3"\r\n');
});

test('destravamento e importação são lidos do texto do log', async () => {
  const { parseUnlock, parseImport } = await import('../src/reportData.ts');
  const unlock = 'Total anual salvo. Total anual destravado: 12000000 → 12500000. Motivo: Revisão. aprovada pela diretoria.';
  assert.deepEqual(parseUnlock(unlock), { before: 12000000, after: 12500000, reason: 'Revisão. aprovada pela diretoria' });
  const both = 'Metas mensais atualizadas. Total anual destravado: 100 → 120. Motivo: Planilha oficial. Importação alterou: Janeiro 1100 → 1000; Fevereiro 90 → 95.';
  assert.equal(parseUnlock(both).reason, 'Planilha oficial');
  assert.deepEqual(parseImport(both), ['Janeiro 1100 → 1000', 'Fevereiro 90 → 95']);
  assert.equal(parseUnlock('Meta do mês 02 ajustada manualmente.'), null);
  assert.equal(parseImport('Meta do mês 02 ajustada manualmente.'), null);
});

test('diferença entre duas versões: total, meses e carteiras (inclui carteira que só existe em uma)', async () => {
  const { diffVersions } = await import('../src/reportData.ts');
  const snapshot = (annual, months, portfolios) => ({ version: 1, timestamp: '', actor: null, action: 'update', detail: '', annual_amount: annual, months, portfolios });
  const a = snapshot(1200, flat(100), [{ id: 1, name: 'Agro', amounts: flat(60) }, { id: 2, name: 'PF', amounts: flat(40) }]);
  const b = snapshot(1300, [90, ...Array(11).fill(100)], [{ id: 1, name: 'Agro', amounts: [50, ...Array(11).fill(60)] }, { id: 3, name: 'PJ', amounts: flat(40) }]);
  const diff = diffVersions(a, b);
  assert.deepEqual(diff.annual, { a: 1200, b: 1300, delta: 100 });
  assert.equal(diff.changedMonths, 1);
  assert.deepEqual(diff.months[0], { month: 1, a: 100, b: 90, delta: -10 });
  assert.deepEqual(diff.wallets.map(w => [w.id, w.a, w.b, w.delta]), [[1, 720, 710, -10], [2, 480, 0, -480], [3, 0, 480, 480]]);
  assert.equal(diff.wallets[2].name, 'PJ');
});

test('ano × ano junta por agência e subproduto e calcula a variação sobre o ano A', async () => {
  const { compareYears } = await import('../src/reportData.ts');
  const lineOf = (row, total) => buildLines([{ ...row, goal: { ...row.goal, months: flat(total / 12).map((amount, i) => ({ month: i + 1, amount, manual: 0, closed: false })), annual_amount: total } }], NO_FILTERS)[0];
  const third = { ...complete, agency: agency(3, '003', 1, 'Regional A') };
  const [section] = compareYears([lineOf(complete, 1200), lineOf(zeroed, 600)], [lineOf(complete, 1500), lineOf(third, 300)]);
  assert.deepEqual([section.totalA, section.totalB, section.delta, section.pct], [1800, 1800, 0, 0]);
  assert.deepEqual(section.rows.map(r => [r.agency.code, r.a, r.b, r.delta, r.pct]), [['001', 1200, 1500, 300, 0.25], ['002', 600, 0, -600, -1], ['003', 0, 300, 300, null]]);
  assert.deepEqual(section.monthsA, flat(150));
});
