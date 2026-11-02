import test from 'node:test';
import assert from 'node:assert/strict';
import { clampColumn, columnLimits, columnStyle, parseColumnWidths } from '../src/columnWidths.ts';

test('largura da coluna respeita o mínimo e o máximo de cada coluna',()=>{
  assert.equal(clampColumn('wallet',10),columnLimits.wallet[0]);
  assert.equal(clampColumn('wallet',5000),columnLimits.wallet[1]);
  assert.equal(clampColumn('wallet',201.6),202);
});

test('larguras salvas ignoram colunas desconhecidas, valores inválidos e JSON quebrado',()=>{
  assert.deepEqual(parseColumnWidths(null),{});
  assert.deepEqual(parseColumnWidths('{nao e json'),{});
  assert.deepEqual(parseColumnWidths('{"wallet":"larga","outra":300,"agency":1}'),{agency:columnLimits.agency[0]});
  assert.deepEqual(parseColumnWidths('{"amount":150,"segment":null}'),{amount:150});
});

test('só as colunas ajustadas viram variáveis CSS; as demais mantêm a largura padrão',()=>{
  assert.deepEqual(columnStyle({}),{});
  assert.deepEqual(columnStyle({agency:300,percent:80}),{'--agency-width':'300px','--percent-width':'80px'});
});
