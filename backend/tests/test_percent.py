import sqlite3
import tempfile
import unittest
from pathlib import Path
from unlocked_client import UnlockedClient

from backend import database as db
from backend.main import app


class PercentageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_db = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / 'test.db'
        db.initialize()
        self.client = UnlockedClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original_db
        self.temp.cleanup()

    def plan(self):
        return self.client.get('/api/agencies/1/goals?year=2026').json()

    def test_decimal_goals_allocations_and_export(self):
        r = self.client.post('/api/products', json={'name': 'Crescimento', 'sub_product': 'Indicadores', 'unit': 'PCT'})
        self.assertEqual(r.status_code, 201, r.text)
        product = r.json()
        goal = next(g for g in self.plan()['goals'] if g['product_id'] == product['id'])
        r = self.client.post('/api/annual-goals', json={'year': 2026, 'product_id': product['id'], 'method': 'equal', 'entries': [{'goal_id': goal['id'], 'revision': goal['revision'], 'annual_amount': 150.6}]})
        self.assertEqual(r.status_code, 200, r.text)
        goal = next(g for g in self.plan()['goals'] if g['id'] == goal['id'])
        self.assertEqual(goal['annual_amount'], 150.6)
        allocation = self.client.get(f"/api/goals/{goal['id']}/allocations?month=1").json()
        self.assertEqual(allocation['unit'], 'PCT')
        self.assertEqual(allocation['total'], 12.55)
        self.assertEqual(sum(round(e['amount'] * 100) for e in allocation['entries']), 1255)
        r = self.client.put(f"/api/goals/{goal['id']}/allocations", json={'revision': allocation['revision'], 'month': 1, 'mode': 'amount', 'entries': [{'portfolio_id': e['portfolio_id'], 'value': e['amount']} for e in allocation['entries']]})
        self.assertEqual(r.status_code, 200, r.text)
        r = self.client.put(f"/api/goals/{goal['id']}/months/2", json={'revision': r.json()['revision'], 'amount': 8.75})
        self.assertEqual(r.status_code, 200, r.text)
        goal = next(g for g in r.json()['goals'] if g['id'] == goal['id'])
        bad = self.client.put(f"/api/goals/{goal['id']}/months/2", json={'revision': goal['revision'], 'amount': 8.7555})
        self.assertEqual(bad.status_code, 422)
        matrix = self.client.get(f"/api/goals?year=2026&agency_id=1&product_id={product['id']}").json()['rows'][0]
        self.assertEqual(matrix['goal']['months'][1]['amount'], 8.75)
        exported = self.client.get(f"/api/export?year=2026&agency_id=1&product_id={product['id']}").text
        self.assertNotIn('Unidade', exported)
        self.assertNotIn('PCT', exported)
        self.assertIn('12,55', exported)
        r = self.client.put(f"/api/products/{product['id']}", json={**{k: product[k] for k in ['name', 'sub_product']}, 'unit': 'UN'})
        self.assertEqual(r.status_code, 422)
        # Seasonal calculations also preserve hundredths of a percentage point.
        r = self.client.put(f"/api/goals/{goal['id']}", json={'revision': goal['revision'], 'mode': 'seasonal', 'annual_amount': 25.55, 'weights': [5] * 11 + [45]})
        self.assertEqual(r.status_code, 200, r.text)
        goal = next(g for g in r.json()['goals'] if g['id'] == goal['id'])
        self.assertEqual(goal['annual_amount'], 25.55)
        self.assertEqual(sum(round(m['amount'] * 1000) for m in goal['months']), 25550)

    def test_migration_preserves_existing_records_and_is_idempotent(self):
        before = self.plan()
        with db.connect() as conn:
            dump = '\n'.join(conn.iterdump()).replace("'BRL','UN','PCT'", "'BRL','UN'")
        db.DB_PATH = Path(self.temp.name) / 'legacy.db'
        conn = sqlite3.connect(db.DB_PATH)
        try:
            conn.executescript(dump)
            conn.execute('PRAGMA user_version=1')  # o dump já está em milésimos
        finally:
            conn.close()
        db.initialize()
        self.assertEqual(self.plan(), before)
        self.assertEqual(len(list((db.DB_PATH.parent / 'backups').glob('metas-before-percent-*.db'))), 1)
        with db.connect() as conn:
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(), [])
        r = self.client.post('/api/products', json={'name': 'Índice', 'sub_product': 'Indicadores', 'unit': 'PCT'})
        self.assertEqual(r.status_code, 201, r.text)
        db.initialize()
        self.assertEqual(len(list((db.DB_PATH.parent / 'backups').glob('metas-before-percent-*.db'))), 1)

    def test_category_becomes_sub_product_without_losing_goals(self):
        before = self.plan()
        with db.connect() as conn:
            dump = '\n'.join(conn.iterdump())
        # Recria o formato anterior: coluna "category" e nome do produto único.
        current = "name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('BRL','UN','PCT')), sub_product TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(name COLLATE NOCASE, sub_product COLLATE NOCASE)"
        legacy = "name TEXT UNIQUE NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('BRL','UN','PCT')), category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1"
        self.assertIn(current, dump)
        db.DB_PATH = Path(self.temp.name) / 'legacy.db'
        conn = sqlite3.connect(db.DB_PATH)
        try:
            conn.executescript(dump.replace(current, legacy))
            conn.execute('PRAGMA user_version=1')  # o dump já está em milésimos
            self.assertIn('category', [r[1] for r in conn.execute('PRAGMA table_info(products)')])
        finally:
            conn.close()
        db.initialize()
        # Ids, metas e distribuições continuam ligados ao mesmo registro; o antigo valor da categoria vira o subproduto.
        self.assertEqual(self.plan(), before)
        self.assertEqual([g['sub_product'] for g in self.plan()['goals']], ['Crédito e financiamento', 'Relacionamento', 'Investimentos', 'Proteção'])
        self.assertEqual(len(list((db.DB_PATH.parent / 'backups').glob('metas-before-subproduct-*.db'))), 1)
        with db.connect() as conn:
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertNotIn('category', [r[1] for r in conn.execute('PRAGMA table_info(products)')])
        db.initialize()
        self.assertEqual(len(list((db.DB_PATH.parent / 'backups').glob('metas-before-subproduct-*.db'))), 1)
