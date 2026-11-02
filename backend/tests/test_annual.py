import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

from unlocked_client import UnlockedClient
from openpyxl import Workbook, load_workbook
from backend import database as db
from backend.main import app


class AnnualTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "annual.db"
        db.initialize()
        self.client = UnlockedClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def goal(self, agency=1, product=1, year=2026):
        goals = self.client.get(f"/api/agencies/{agency}/goals?year={year}").json()["goals"]
        return next(g for g in goals if g["product_id"] == product)

    def entry(self, agency=1, product=1, amount=1200):
        g = self.goal(agency, product)
        return {"goal_id": g["id"], "revision": g["revision"], "annual_amount": amount}

    def batch(self, method="annual", entries=None, **kwargs):
        return self.client.post("/api/annual-goals", json={"year": 2026, "method": method, "product_id": 1, "entries": entries or [self.entry()], **kwargs})

    def workbook(self, rows, header=("Agência", "Produto", "Subproduto", "Ano", "Total anual")):
        w = Workbook()
        w.active.append(list(header))
        for r in rows:
            w.active.append(r)
        stream = io.BytesIO()
        w.save(stream)
        return stream.getvalue()

    def preview(self, rows, year=2026, **kwargs):
        return self.client.post(f"/api/annual-goals/preview?year={year}", files={"file": ("metas.xlsx", self.workbook(rows, **kwargs), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

    def import_preview(self, preview):
        entries = [{k: e[k] for k in ["goal_id", "revision", "annual_amount", "agency_id", "product_id"]} for e in preview["entries"]]
        return self.client.post("/api/annual-goals", json={"year": preview["year"], "method": "annual", "source": "excel", "entries": entries})

    def test_annual_is_saved_separately_and_months_wait_for_distribution(self):
        before = self.client.get('/api/goals/1/allocations').json()
        self.assertEqual(self.batch().status_code, 200)
        g = self.goal()
        self.assertEqual(g['annual_amount'], 1200)
        self.assertTrue(g['annual_pending'])
        self.assertEqual(sum(m['amount'] for m in g['months']), 0)
        a = self.client.get('/api/goals/1/allocations').json()
        self.assertEqual([e['percent'] for e in a['entries']], [e['percent'] for e in before['entries']])
        self.assertEqual(sum(e['amount'] for e in a['entries']), 0)
        r = self.client.put('/api/goals/1/months/1', json={'revision': g['revision'], 'amount': 100})
        self.assertEqual(r.status_code, 422)
        # Persistência não depende do total de meses ou de estado em memória.
        db.initialize()
        self.assertEqual(self.goal()['annual_amount'], 1200)

    def test_equal_division_uses_twelve_equal_weights_and_preserves_cents(self):
        self.assertEqual(self.batch('equal').status_code, 200)
        self.assertEqual([m['amount'] for m in self.goal()['months']], [100] * 12)
        self.assertEqual(self.batch('equal', [self.entry(amount=1)]).status_code, 200)
        cents = [round(m['amount'] * 1000) for m in self.goal()['months']]
        self.assertEqual(sum(cents), 1000)
        # Meses em reais cheios: nenhum mês fica com centavos quebrados e a diferença entre meses é de no máximo R$ 1.
        self.assertTrue(all(v % 1000 == 0 for v in cents))
        self.assertLessEqual(max(cents) - min(cents), 1000)
        self.assertFalse(self.goal()['annual_pending'])

    def test_equal_integer_units_do_not_create_fractions(self):
        result = self.batch('equal', [self.entry(product=2, amount=13)], product_id=2)
        self.assertEqual(result.status_code, 200, result.text)
        values = [m['amount'] for m in self.goal(product=2)['months']]
        self.assertEqual(round(sum(values), 3), 13)
        self.assertEqual(sorted(set(values)), [1, 2])
        self.assertEqual(self.batch('annual', [self.entry(product=2, amount=1.5)], product_id=2).status_code, 200)
        self.assertEqual(self.batch('annual', [self.entry(product=2, amount=1.5005)], product_id=2).status_code, 422)

    def test_month_increase_requires_compensation_and_rejections_are_atomic(self):
        self.assertEqual(self.batch('equal', [self.entry(amount=12_000_000)]).status_code, 200)
        before = self.goal()
        matrix = self.client.get('/api/goals').json()
        audit = self.client.get('/api/audit').json()
        allocation = self.client.get('/api/goals/1/allocations?month=1').json()
        response = self.client.put('/api/goals/1/months/1', json={'revision': before['revision'], 'amount': 1_200_000})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn('meta anual planejada', response.json()['detail'])
        amounts = [m['amount'] for m in before['months']]
        amounts[0] = 1_200_000
        body = {'revision': before['revision'], 'mode': 'monthly', 'amounts': amounts, 'annual_amount': 20_000_000}
        self.assertEqual(self.client.put('/api/goals/1', json=body).status_code, 422)
        self.assertEqual(self.client.get('/api/goals').json(), matrix)
        self.assertEqual(self.client.get('/api/audit').json(), audit)
        amounts[1] = 800_000
        response = self.client.put('/api/goals/1', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        after = self.goal()
        self.assertEqual(after['annual_amount'], 12_000_000)
        self.assertEqual([m['amount'] for m in after['months']], amounts)
        for month, target in [(1, 1_200_000), (2, 800_000)]:
            entries = self.client.get(f'/api/goals/1/allocations?month={month}').json()['entries']
            self.assertEqual([e['percent'] for e in entries], [e['percent'] for e in allocation['entries']])
            self.assertEqual(sum(round(e['amount']*100) for e in entries), target*100)

    def test_reducing_then_reusing_balance_keeps_the_original_annual_limit(self):
        for product, annual, reduced, increased, excess in [(1, 12_000_000, 800_000, 1_200_000, .01), (2, 12, 0, 2, 1)]:
            with self.subTest(product=product):
                self.assertEqual(self.batch('equal', [self.entry(product=product, amount=annual)], product_id=product).status_code, 200)
                g = self.goal(product=product)
                result = self.client.put(f"/api/goals/{g['id']}/months/2", json={'revision': g['revision'], 'amount': reduced})
                self.assertEqual(result.status_code, 200, result.text)
                g = self.goal(product=product)
                self.assertEqual(g['annual_amount'], annual)
                result = self.client.put(f"/api/goals/{g['id']}/months/1", json={'revision': g['revision'], 'amount': increased})
                self.assertEqual(result.status_code, 200, result.text)
                g = self.goal(product=product)
                self.assertEqual(g['annual_amount'], annual)
                result = self.client.put(f"/api/goals/{g['id']}/months/1", json={'revision': g['revision'], 'amount': increased+excess})
                self.assertEqual(result.status_code, 422)
                self.assertEqual(self.goal(product=product), g)

    def test_legacy_null_target_is_frozen_on_first_monthly_edit(self):
        self.assertEqual(self.batch('equal', [self.entry(amount=1200)]).status_code, 200)
        with db.connect() as conn:
            conn.execute('UPDATE goals SET annual_target=NULL WHERE id=1')
        g = self.goal()
        result = self.client.put('/api/goals/1/months/1', json={'revision': g['revision'], 'amount': 50})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.goal()['annual_amount'], 1200)
        with db.connect() as conn:
            self.assertEqual(conn.execute('SELECT annual_target FROM goals WHERE id=1').fetchone()[0], 1200000)

    def test_monthly_batch_keeps_unallocated_balance_and_zero_target_blocks_increases(self):
        for annual in [1200, 0]:
            self.assertEqual(self.batch('equal', [self.entry(amount=annual)]).status_code, 200)
            g = self.goal()
            amounts = [m['amount'] for m in g['months']]
            amounts[0] = 0
            result = self.client.put('/api/goals/1', json={'revision': g['revision'], 'mode': 'monthly', 'amounts': amounts})
            self.assertEqual(result.status_code, 200, result.text)
            g = self.goal()
            self.assertEqual(g['annual_amount'], annual)
            amounts[0] = annual + .01
            result = self.client.put('/api/goals/1', json={'revision': g['revision'], 'mode': 'monthly', 'amounts': amounts})
            self.assertEqual(result.status_code, 422)
            self.assertEqual(self.goal(), g)

    def test_custom_percentages_and_invalid_sums(self):
        before = self.goal()
        self.assertEqual(self.batch('percent', weights=[5] * 12).status_code, 422)
        self.assertEqual(self.goal(), before)
        self.assertEqual(self.batch('percent', weights=[10] * 10 + [0, 0]).status_code, 200)
        self.assertEqual([m['amount'] for m in self.goal()['months']], [120] * 10 + [0, 0])

    def test_saved_seasonality_uses_annual_target_and_checks_revision(self):
        self.batch()
        self.assertEqual(self.batch('seasonal', profile_revision=0).status_code, 422)
        self.client.put('/api/seasonality/1/2026', json={'revision': 0, 'weights': [100] + [0] * 11})
        before = self.goal()
        self.assertEqual(self.batch('seasonal', profile_revision=0).status_code, 409)
        self.assertEqual(self.goal(), before)
        self.assertEqual(self.batch('seasonal', profile_revision=1).status_code, 200)
        self.assertEqual(self.goal()['months'][0]['amount'], 1200)

    def test_existing_seasonality_page_can_distribute_pending_annual_target(self):
        self.batch()
        self.client.put('/api/seasonality/1/2026', json={'revision': 0, 'weights': [100] + [0] * 11})
        g = self.goal()
        r = self.client.post('/api/seasonality/1/2026/apply', json={'revision': 1, 'goals': [{'goal_id': g['id'], 'revision': g['revision']}]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.goal()['months'][0]['amount'], 1200)

    def test_batch_conflicts_duplicates_and_scope_are_atomic(self):
        before = self.client.get('/api/goals').json()
        audit = self.client.get('/api/audit').json()
        entries = [self.entry(), self.entry(agency=2)]
        entries[1]['revision'] = 0
        self.assertEqual(self.batch(entries=entries).status_code, 409)
        self.assertEqual(self.client.get('/api/goals').json(), before)
        self.assertEqual(self.client.get('/api/audit').json(), audit)
        self.assertEqual(self.batch(entries=[self.entry(), self.entry()]).status_code, 422)
        self.assertEqual(self.batch(entries=[self.entry(product=2)]).status_code, 422)
        self.assertEqual(self.goal(), next(r['goal'] for r in before['rows'] if r['goal']['id'] == 1))

    def test_excel_preview_reads_brazilian_values_without_writing(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        before = self.client.get('/api/goals').json()
        r = self.preview([[int(code), 'Crédito', 'Crédito e financiamento', 2026, '1.234,56'], [code, 'Associados Ativos', 'Relacionamento', 2026, 13], [code, 'Seguros', 'Proteção', 2026, None]])
        self.assertEqual(r.status_code, 200, r.text)
        preview = r.json()
        self.assertEqual(preview['errors'], [])
        self.assertEqual([e['annual_amount'] for e in preview['entries']], [1234.56, 13])
        self.assertEqual(self.client.get('/api/goals').json(), before)
        r = self.import_preview(preview)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self.goal()['annual_pending'])
        self.assertEqual(self.goal()['annual_amount'], 1234.56)
        self.assertEqual(self.goal()['planning_method'], 'annual_imported')

    def test_excel_reports_invalid_rows_including_formulas_duplicate_and_wrong_year(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        r = self.preview([[code, 'Crédito', 'Crédito e financiamento', 2026, 100], [code, 'Crédito', 'Crédito e financiamento', 2026, 200], [code, 'Seguros', 'Proteção', 2027, 100], [code, 'Investimentos', 'Investimentos', 2026, '=10*20'], [code, 'Associados Ativos', 'Relacionamento', 2026, 1.5], ['missing', 'Seguros', 'Proteção', 2026, 1], [code, 'missing', 'missing', 2026, 1]])
        self.assertEqual(r.status_code, 200, r.text)
        # 1,5 associado é aceito (3 casas decimais); as demais linhas continuam inválidas.
        self.assertEqual(len(r.json()['errors']), 5)
        self.assertEqual(len(r.json()['entries']), 2)

    def test_excel_matches_the_subproduct_and_treats_product_as_optional(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        short = ("Agência", "Subproduto", "Ano", "Total anual")
        r = self.preview([[code, 'proteção', 2026, 50]], header=short)
        self.assertEqual(r.status_code, 200, r.text)
        entry = r.json()['entries'][0]
        self.assertEqual((entry['product_name'], entry['sub_product'], entry['annual_amount']), ('Seguros', 'Proteção', 50))
        # O nome do produto não substitui o subproduto: "Seguros" não é um subproduto cadastrado.
        self.assertEqual(len(self.preview([[code, 'Seguros', 'Seguros', 2026, 50]]).json()['errors']), 1)
        self.assertEqual(self.preview([[code, 'Seguros', 2026, 50]], header=("Agência", "Produto", "Ano", "Total anual")).status_code, 422)

    def test_csv_exported_by_the_screen_can_be_imported(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        name = next(a['name'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        lines = ['Agência;Produto;Subproduto;Distribuição;Total do ano;Jan;Fev',
                 '"Regional I";"Crédito";"Crédito e financiamento";"3 agências";"39.900.000";"3.327.660";"3.226.860"',
                 f'"{code} {name}";"Crédito";"Crédito e financiamento";"Ajuste manual · 1m";"12.000.000";"1.000.800";"900.000"',
                 f'"{code} {name}";"Associados Ativos";"Relacionamento";"Excel · a distribuir";"1.000";"—";"—"',
                 f'"{code} {name}";"Seguros";"Proteção";"Excel · a distribuir";"—";"—";"—"']
        content = ('\ufeff' + '\r\n'.join(lines) + '\r\n').encode('utf-8')
        r = self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('metas-por-agencia-2026.csv', content, 'text/csv')})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['errors'], [])
        self.assertEqual([e['annual_amount'] for e in r.json()['entries']], [12_000_000, 1000])
        self.assertEqual(self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('metas.txt', content, 'text/plain')}).status_code, 422)

    def test_csv_with_twelve_months_roundtrips_an_edited_month_without_zeroing_the_rest(self):
        agency = next(a for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        before = self.goal()
        amounts = [m['amount'] for m in before['months']]
        edited = list(amounts)
        edited[1] = max(amounts[1] - 100, 0)
        pt = lambda v: f'{v:.2f}'.replace('.', ',')
        header = 'Agência;Produto;Subproduto;Distribuição;Total do ano;' + ';'.join(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'])
        row = f'"{agency["code"]} {agency["name"]}";"Crédito";"Crédito e financiamento";"Planilha";"{pt(before["annual_amount"])}";' + ';'.join(f'"{pt(v)}"' for v in edited)
        pending = f'"{agency["code"]} {agency["name"]}";"Associados Ativos";"Relacionamento";"Excel · a distribuir";"1.000";' + ';'.join(['"—"'] * 12)
        upload = lambda text: self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('metas.csv', ('\ufeff' + text).encode('utf-8'), 'text/csv')})
        r = upload('\r\n'.join([header, row, pending]))
        self.assertEqual(r.status_code, 200, r.text)
        preview = r.json()
        self.assertEqual(preview['errors'], [])
        first, second = preview['entries']
        self.assertEqual(first['changed_months'], [2])
        self.assertIsNone(second['months'])
        entries = [{k: e[k] for k in ['goal_id', 'revision', 'annual_amount', 'agency_id', 'product_id', 'months']} for e in preview['entries']]
        saved = self.client.post('/api/annual-goals', json={'year': 2026, 'method': 'annual', 'source': 'excel', 'entries': entries})
        self.assertEqual(saved.status_code, 200, saved.text)
        after = self.goal()
        self.assertEqual([m['amount'] for m in after['months']], edited)
        self.assertEqual(after['annual_amount'], before['annual_amount'])
        # Fev foi alterado; abril, ausente na planilha de origem, passa a revisado ao vir com valor.
        self.assertEqual([i for i, m in enumerate(after['months'], 1) if m['manual']], [2, 4])
        self.assertEqual(after['missing_months'], [])
        self.assertTrue(self.goal(product=2)['annual_pending'] or self.goal(product=2)['annual_amount'] == 1000)
        # Meses que passam do total anual são recusados já na conferência.
        over = row.replace(f'"{pt(edited[1])}"', f'"{pt(before["annual_amount"])}"')
        self.assertEqual(len(upload('\r\n'.join([header, over])).json()['errors']), 1)

    def test_negative_goals_distribute_by_absolute_value_and_limit_months_by_magnitude(self):
        self.assertEqual(self.batch('equal', [self.entry(amount=-1200.5)]).status_code, 200)
        g = self.goal()
        self.assertEqual(g['annual_amount'], -1200.5)
        self.assertEqual(round(sum(m['amount'] for m in g['months']), 3), -1200.5)
        self.assertTrue(all(m['amount'] < 0 for m in g['months']))
        # Distribuição por carteira acompanha o sinal e conserva o total do mês.
        a = self.client.get('/api/goals/1/allocations?month=1').json()
        self.assertLess(a['total'], 0)
        self.assertEqual(sum(round(e['amount'] * 1000) for e in a['entries']), round(a['total'] * 1000))
        # Reduzir o módulo de um mês libera saldo; ultrapassar o planejado é recusado.
        less = self.client.put('/api/goals/1/months/1', json={'revision': g['revision'], 'amount': -50})
        self.assertEqual(less.status_code, 200, less.text)
        g = self.goal()
        over = self.client.put('/api/goals/1/months/2', json={'revision': g['revision'], 'amount': -1200})
        self.assertEqual(over.status_code, 422, over.text)
        # Valores por carteira precisam ter o sinal da meta do mês.
        a = self.client.get('/api/goals/1/allocations?month=3').json()
        mixed = [e['amount'] for e in a['entries']]
        mixed[0], mixed[1] = -mixed[0] + 0, mixed[1] - 2 * mixed[0]
        r = self.client.put('/api/goals/1/allocations', json={'revision': a['revision'], 'month': 3, 'mode': 'amount', 'entries': [{'portfolio_id': e['portfolio_id'], 'value': v} for e, v in zip(a['entries'], mixed)]})
        self.assertEqual(r.status_code, 422, r.text)

    def test_three_decimal_places_are_kept_and_a_fourth_is_rejected(self):
        self.assertEqual(self.batch('annual', [self.entry(product=2, amount=83.333)], product_id=2).status_code, 200)
        self.assertEqual(self.goal(product=2)['annual_amount'], 83.333)
        self.assertEqual(self.batch('annual', [self.entry(product=2, amount=83.3333)], product_id=2).status_code, 422)

    def test_amount_scale_migration_converts_legacy_units_once_and_allows_negatives(self):
        before = self.client.get(f"/api/agencies/1/goals?year=2026").json()
        with db.connect() as conn:
            dump = '\n'.join(conn.iterdump())
        legacy = Path(self.temp.name) / 'legacy.db'
        db.DB_PATH = legacy
        conn = sqlite3.connect(legacy)
        try:
            # Banco anterior: restrições de valor >= 0 e valores em centavos/unidades.
            conn.executescript(dump.replace(' amount INTEGER NOT NULL', ' amount INTEGER NOT NULL CHECK(amount>=0)'))
            for table, join in (('months', 'goal_id'), ('allocations', 'goal_id')):
                conn.execute(f"UPDATE {table} SET amount=amount/(CASE (SELECT p.unit FROM goals g JOIN products p ON p.id=g.product_id WHERE g.id={table}.{join}) WHEN 'UN' THEN 1000 ELSE 10 END)")
            conn.execute("UPDATE goals SET source_annual=source_annual/(CASE (SELECT unit FROM products WHERE id=goals.product_id) WHEN 'UN' THEN 1000 ELSE 10 END), annual_target=annual_target/(CASE (SELECT unit FROM products WHERE id=goals.product_id) WHEN 'UN' THEN 1000 ELSE 10 END)")
            conn.commit()
            self.assertEqual(conn.execute('PRAGMA user_version').fetchone()[0], 0)
        finally:
            conn.close()
        db.initialize()
        self.assertEqual(self.client.get('/api/agencies/1/goals?year=2026').json(), before)
        self.assertEqual(len(list((legacy.parent / 'backups').glob('metas-before-3-decimais-*.db'))), 1)
        with db.connect() as conn:
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(conn.execute('PRAGMA user_version').fetchone()[0], 1)
        db.initialize()
        self.assertEqual(self.client.get('/api/agencies/1/goals?year=2026').json(), before)
        self.assertEqual(len(list((legacy.parent / 'backups').glob('metas-before-3-decimais-*.db'))), 1)
        g = self.goal()
        r = self.client.put('/api/goals/1/months/1', json={'revision': g['revision'], 'amount': -5})
        self.assertEqual(r.status_code, 200, r.text)

    def test_csv_with_full_month_names_and_empty_cells_is_imported(self):
        agency = next(a for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        before = self.goal()
        amounts = [m['amount'] for m in before['months']]
        pt = lambda v: f'{v:.2f}'.replace('.', ',')
        names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
        header = 'Agência;Produto;Subproduto;Distribuição;Total do ano;' + ';'.join(names)
        row = f'"{agency["code"]} {agency["name"]}";"Crédito";"Crédito e financiamento";"Planilha";"{pt(before["annual_amount"])}";' + ';'.join(f'"{pt(v)}"' for v in amounts)
        pending = f'"{agency["code"]} {agency["name"]}";"Associados Ativos";"Relacionamento";"Excel · a distribuir";"1.000";' + ';'.join(['""'] * 12)
        r = self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('metas.csv', ('\ufeff' + '\r\n'.join([header, row, pending])).encode('utf-8'), 'text/csv')})
        self.assertEqual(r.status_code, 200, r.text)
        preview = r.json()
        self.assertEqual(preview['errors'], [])
        first, second = preview['entries']
        self.assertIsNotNone(first['months'])
        self.assertEqual(first['changed_months'], [])
        self.assertIsNone(second['months'])

    def test_csv_import_accepts_negative_totals_and_rounds_to_three_decimals(self):
        agency = next(a for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        newline = chr(10)
        header = 'Agência;Produto;Subproduto;Ano;Total anual' + newline
        rows = [f'{agency["code"]};Crédito;Crédito e financiamento;2026;"-1.234,5675"', f'{agency["code"]};Associados Ativos;Relacionamento;2026;83,33333333']
        r = self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('metas.csv', (header + newline.join(rows)).encode('utf-8'), 'text/csv')})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['errors'], [])
        self.assertEqual([e['annual_amount'] for e in r.json()['entries']], [-1234.568, 83.333])

    def test_csv_months_follow_the_negative_total_limit(self):
        agency = next(a for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        header = 'Agência;Subproduto;Total do ano;' + ';'.join(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']) + chr(10)
        def upload(months):
            row = f'{agency["code"]};Crédito e financiamento;-120;' + ';'.join(months)
            return self.client.post('/api/annual-goals/preview?year=2026', files={'file': ('m.csv', (header + row).encode('utf-8'), 'text/csv')}).json()
        self.assertEqual(upload(['-10'] * 12)['errors'], [])
        self.assertEqual(len(upload(['-11'] * 12)['errors']), 1)

    def test_excel_requires_the_product_only_when_the_subproduct_name_repeats(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        created = self.client.post('/api/products', json={'name': 'Cartões', 'sub_product': 'Proteção', 'unit': 'BRL'})
        self.assertEqual(created.status_code, 201, created.text)
        short = ("Agência", "Subproduto", "Ano", "Total anual")
        errors = self.preview([[code, 'Proteção', 2026, 50]], header=short).json()['errors']
        self.assertEqual(len(errors), 1)
        self.assertIn('Produto', errors[0])
        ok = self.preview([[code, 'Cartões', 'Proteção', 2026, 70], [code, 'Seguros', 'Proteção', 2026, 80]]).json()
        self.assertEqual(ok['errors'], [])
        self.assertEqual({e['product_name']: e['annual_amount'] for e in ok['entries']}, {'Cartões': 70, 'Seguros': 80})

    def test_excel_can_create_goals_for_new_year_atomically(self):
        code = next(a['code'] for a in self.client.get('/api/bootstrap').json()['agencies'] if a['id'] == 1)
        p = self.preview([[code, 'Crédito', 'Crédito e financiamento', 2027, 900]], year=2027).json()
        self.assertIsNone(p['entries'][0]['goal_id'])
        self.assertEqual(self.import_preview(p).status_code, 200)
        self.assertEqual(self.goal(year=2027)['annual_amount'], 900)
        self.assertEqual(self.import_preview(p).status_code, 409)

    def test_template_is_valid_and_preview_has_no_fake_targets(self):
        response = self.client.get('/api/annual-goals/template?year=2027')
        self.assertEqual(response.status_code, 200)
        w = load_workbook(io.BytesIO(response.content))
        self.assertEqual(list(w.active.values)[0], ('Regional', 'Agência', 'Produto', 'Subproduto', 'Ano', 'Total anual'))
        w.close()
        r = self.client.post('/api/annual-goals/preview?year=2027', files={'file': ('model.xlsx', response.content)})
        self.assertEqual(r.json()['entries'], [])
        self.assertTrue(r.json()['errors'])
        self.assertEqual(self.client.post('/api/annual-goals/preview', files={'file': ('bad.xlsx', b'bad')}).status_code, 422)

    def test_annual_migration_preserves_existing_months_and_is_idempotent(self):
        before = self.goal()
        with db.connect() as conn:
            conn.execute('ALTER TABLE goals DROP COLUMN annual_target')
        db.initialize()
        self.assertEqual(self.goal(), before)
        self.assertEqual(len(list((db.DB_PATH.parent/'backups').glob('*.db'))), 1)
        db.initialize()
        self.assertEqual(len(list((db.DB_PATH.parent/'backups').glob('*.db'))), 1)


if __name__ == '__main__':
    unittest.main()
