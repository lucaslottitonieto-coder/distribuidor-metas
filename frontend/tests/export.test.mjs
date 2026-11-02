import test from 'node:test';
import assert from 'node:assert/strict';
import { tableCsv } from '../src/tableExport.ts';

const cell = (innerText, rowSpan = 1, colSpan = 1) => ({ innerText, rowSpan, colSpan });
const table = (...rows) => ({ rows: rows.map(cells => ({ cells })) });

test('exportação da visão por agência mantém meses, totais e agências em células mescladas', () => {
  const csv = tableCsv(table(
    [cell('Agência'), cell('Subproduto'), cell('Total do ano'), cell('Jan'), cell('Dez')],
    [cell('Regional I\n3 agências'), cell('Crédito Rural'), cell('13.051.073,07'), cell('1.088.459,49'), cell('1.087.154,39')],
    [cell('073702 Mangueirinha', 2), cell('Crédito Rural'), cell('1.073,07'), cell('89,49'), cell('89,38')],
    [cell('Depósitos a Prazo'), cell('12\nA distribuir'), cell('—'), cell('—')],
  ));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Regional I 3 agências";"Crédito Rural";"13.051.073,07"'));
  assert.ok(csv.includes('"073702 Mangueirinha";"Depósitos a Prazo";"12 A distribuir";"";""'));
  assert.ok(!csv.includes('Carteira'));
});

test('exporta apenas as linhas e colunas presentes na visão filtrada e recolhida', () => {
  const csv = tableCsv(table(
    [cell('Agência'), cell('Subproduto'), cell('Distribuição'), cell('Total do ano')],
    [cell('Regional II'), cell('Seguro'), cell('1 agência'), cell('0')],
  ));
  assert.equal(csv, '\uFEFF"Agência";"Subproduto";"Distribuição";"Total do ano"\r\n"Regional II";"Seguro";"1 agência";"0"\r\n');
});

test('exporta só o nome da regional, sem o rótulo auxiliar de quantidade de agências', () => {
  const regional = { ...cell('Regional I\n3 agências'), querySelectorAll: () => [{ innerText: '3 agências' }] };
  const csv = tableCsv(table([regional, cell('Crédito Rural')]));
  assert.equal(csv, '﻿"Regional I";"Crédito Rural"\r\n');
});

test('exporta o total anual sem as etiquetas "A distribuir" e "Faltam" da tela', () => {
  const total = (text, label) => ({ ...cell(`${text}\n${label}`), querySelectorAll: () => [{ innerText: label }] });
  const csv = tableCsv(table([total('1.000', 'A distribuir'), total('12.000.000', 'Faltam 100.800'), cell('900.000')]));
  assert.equal(csv, '﻿"1.000";"12.000.000";"900.000"\r\n');
});

test('protege nomes com fórmulas e preserva aspas, separadores e acentos no CSV', () => {
  const csv = tableCsv(table([cell('=1+1'), cell('Agência "Sul"; PR'), cell('R$\u00a01.234,56')]));
  assert.equal(csv, '\uFEFF"\'=1+1";"Agência ""Sul""; PR";"R$ 1.234,56"\r\n');
});

test('exporta células sem valor vazias e mantém negativos como número', () => {
  const csv = tableCsv(table([cell('Jan'), cell('Fev'), cell('Mar')], [cell('—'), cell('-1.234,5'), cell('-=cmd')]));
  assert.ok(csv.includes(`"";"-1.234,5";"'-=cmd"`));
});

test('linhas de meta levam a versão numa última coluna, e arquivos sem versão não ganham a coluna', () => {
  const row = (revision, ...cells) => ({ cells, dataset: revision === undefined ? {} : { goalRevision: String(revision) } });
  const csv = tableCsv({ rows: [
    row(undefined, cell('Agência'), cell('Subproduto'), cell('Total do ano')),
    row(undefined, cell('Regional I'), cell('Crédito Rural'), cell('39.900.000')),
    row(7, cell('073702 Mangueirinha'), cell('Crédito Rural'), cell('12.000.000')),
  ] });
  assert.equal(csv, '\uFEFF"Agência";"Subproduto";"Total do ano";"Versão da meta"\r\n"Regional I";"Crédito Rural";"39.900.000";""\r\n"073702 Mangueirinha";"Crédito Rural";"12.000.000";"7"\r\n');
  assert.ok(!tableCsv(table([cell('Agência'), cell('Total do ano')])).includes('Versão'));
});
