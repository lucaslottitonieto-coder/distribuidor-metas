import json
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from unlocked_client import UnlockedClient
from backend import database as db
from backend.main import app


class ClosureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_db = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / 'closures.db'
        db.initialize()
        self.client = UnlockedClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original_db
        self.temp.cleanup()

    def change(self, month=1, closed=True, year=2026, revision=None, actor='Lucas Teste'):
        if revision is None:
            revision = self.client.get(f'/api/closures?year={year}').json()['months'][month-1]['revision']
        return self.client.put(f'/api/closures/{year}/{month}', json={
            'revision': revision, 'closed': closed, 'actor': actor,
            'reason': 'Conferência do período concluída' if closed else 'Correção aprovada para o período',
            'confirmation': 'FECHAR' if closed else 'REABRIR'})

    def goal(self, id=1):
        return next(r['goal'] for r in self.client.get('/api/goals?year=2026').json()['rows'] if r['goal']['id'] == id)

    def snapshot(self, month=1):
        with db.connect() as conn:
            return ([dict(r) for r in conn.execute('SELECT m.* FROM months m JOIN goals g ON g.id=m.goal_id WHERE g.year=2026 AND m.month=? ORDER BY m.goal_id', (month,))],
                    [dict(r) for r in conn.execute('SELECT a.* FROM allocations a JOIN goals g ON g.id=a.goal_id WHERE g.year=2026 AND a.month=? ORDER BY a.goal_id,a.portfolio_id', (month,))])

    def allocation_body(self, month=1, all=False):
        data = self.client.get(f'/api/goals/1/allocations?month={month}').json()
        return {'revision': data['revision'], 'month': month, 'mode': 'percent', 'apply_to_all': all,
                'entries': [{'portfolio_id': e['portfolio_id'], 'value': 100 if i == 0 else 0} for i, e in enumerate(data['entries'])]}

    def test_close_reopen_and_reclose_keep_actor_dates_and_complete_history(self):
        before = self.snapshot()
        self.assertEqual(self.change().status_code, 200)
        closed = self.client.get('/api/closures?year=2026').json()
        january = closed['months'][0]
        self.assertEqual((january['closed'], january['revision'], january['closed_by']), (1, 1, 'Lucas Teste'))
        self.assertTrue(january['closed_at'])
        self.assertEqual(self.change(closed=False, actor='Maria Teste').status_code, 200)
        reopened = self.client.get('/api/closures?year=2026').json()
        self.assertEqual(reopened['months'][0]['closed_at'], january['closed_at'])
        self.assertEqual(reopened['months'][0]['closed_by'], 'Lucas Teste')
        self.assertEqual(reopened['months'][0]['updated_by'], 'Maria Teste')
        self.assertEqual(self.change().status_code, 200)
        events = self.client.get('/api/closures?year=2026').json()['entries']
        self.assertEqual([e['action'] for e in events], ['close', 'reopen', 'close'])
        self.assertEqual(events[1]['actor'], 'Maria Teste')
        self.assertEqual(json.loads(events[1]['before_json'])['closed'], 1)
        self.assertEqual(json.loads(events[1]['after_json'])['closed'], 0)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(any(e['entity'] == 'closure' for e in self.client.get('/api/audit').json()['entries']))

    def test_required_identity_reason_confirmation_and_stale_revision(self):
        body = {'revision': 0, 'closed': True, 'actor': '   ', 'reason': '   ', 'confirmation': 'FECHAR'}
        self.assertEqual(self.client.put('/api/closures/2026/1', json=body).status_code, 422)
        body.update(actor='Lucas Teste', reason='Conferência concluída', confirmation='REABRIR')
        self.assertEqual(self.client.put('/api/closures/2026/1', json=body).status_code, 422)
        self.assertEqual(self.change().status_code, 200)
        self.assertEqual(self.change(closed=False, revision=0).status_code, 409)
        self.assertEqual(self.change(revision=1).status_code, 409)
        self.assertEqual(self.client.get('/api/closures').json()['total'], 1)

    def test_january_is_locked_globally_but_february_and_another_year_stay_open(self):
        self.change()
        before = self.snapshot()
        for row in self.client.get('/api/goals?year=2026').json()['rows']:
            goal = row['goal']
            result = self.client.put(f"/api/goals/{goal['id']}/months/1", json={'revision': goal['revision'], 'amount': 10})
            self.assertEqual(result.status_code, 409, result.text)
            self.assertTrue(goal['months'][0]['closed'])
            self.assertFalse(goal['months'][1]['closed'])
        goal = self.goal()
        result = self.client.put('/api/goals/1/months/2', json={'revision': goal['revision'], 'amount': 123.45})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.goal()['months'][1]['amount'], 123.45)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.client.post('/api/agencies/1/years', json={'year': 2027}).status_code, 201)
        self.assertEqual(self.client.get('/api/closures?year=2027').json()['months'][0]['closed'], 0)

    def test_monthly_payload_rejects_closed_changes_atomically_but_saves_open_months(self):
        self.change()
        goal = self.goal()
        before = self.snapshot()
        amounts = [m['amount'] for m in goal['months']]
        amounts[0] += 1
        amounts[1] += 2
        body = {'revision': goal['revision'], 'mode': 'monthly', 'amounts': amounts}
        self.assertEqual(self.client.put('/api/goals/1', json=body).status_code, 409)
        self.assertEqual(self.goal(), goal)
        amounts[0] -= 1
        amounts[2] -= 2
        self.assertEqual(self.client.put('/api/goals/1', json=body).status_code, 200)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.goal()['months'][1]['amount'], goal['months'][1]['amount'] + 2)
        self.assertEqual(self.goal()['annual_amount'], goal['annual_amount'])

    def test_allocations_copy_only_to_open_months(self):
        self.change()
        before = self.snapshot()
        self.assertEqual(self.client.put('/api/goals/1/allocations', json=self.allocation_body()).status_code, 409)
        self.assertEqual(self.client.put('/api/goals/1/allocations', json=self.allocation_body(2, True)).status_code, 200)
        for month in range(2, 13):
            entries = self.client.get(f'/api/goals/1/allocations?month={month}').json()['entries']
            self.assertEqual(entries[0]['percent'], 100)
        self.assertEqual(self.snapshot(), before)

    def test_annual_save_keeps_closed_months_and_rejects_a_total_below_them_without_partial_writes(self):
        self.change()
        before = self.client.get('/api/goals?year=2026').json()
        for source in ('manual', 'excel'):
            result = self.client.post('/api/annual-goals', json={'year': 2026, 'method': 'annual', 'source': source,
                'entries': [{'goal_id': self.goal()['id'], 'revision': self.goal()['revision'], 'annual_amount': 10}]})
            self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual(self.client.get('/api/goals?year=2026').json(), before)
        closed = self.snapshot()
        goal = self.goal()
        for source in ('manual', 'excel'):
            result = self.client.post('/api/annual-goals', json={'year': 2026, 'method': 'annual', 'source': source,
                'entries': [{'goal_id': 1, 'revision': self.goal()['revision'], 'annual_amount': goal['annual_amount'] * 2}]})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(self.snapshot(), closed)
            saved = self.goal()
            self.assertEqual(saved['annual_amount'], goal['annual_amount'] * 2)
            self.assertEqual(saved['months'][0]['amount'], goal['months'][0]['amount'])
            self.assertEqual([m['amount'] for m in saved['months'][1:]], [0] * 11)
            self.assertTrue(saved['annual_pending'])

    def test_equal_and_percent_redistribute_only_the_remaining_total(self):
        self.change()
        self.change(month=3)
        before = (self.snapshot(1), self.snapshot(3))
        for method in ('equal', 'percent', 'seasonal'):
            goal = self.goal()
            total = goal['annual_amount'] + .17
            if method == 'seasonal':
                profile = self.client.get('/api/seasonality').json()['profiles'][0]
                saved = self.client.put('/api/seasonality/1/2026', json={'revision': 0, 'weights': profile['weights']})
                self.assertEqual(saved.status_code, 200, saved.text)
            body = {'year': 2026, 'method': method, 'product_id': 1, 'profile_revision': 1 if method == 'seasonal' else None,
                    'weights': [8.34]*4+[8.33]*8 if method == 'percent' else [],
                    'entries': [{'goal_id': 1, 'revision': goal['revision'], 'annual_amount': total}]}
            result = self.client.post('/api/annual-goals', json=body)
            self.assertEqual(result.status_code, 200, result.text)
            after = self.goal()
            self.assertEqual(sum(round(m['amount']*1000) for m in after['months']), round(total*1000))
            self.assertEqual((self.snapshot(1), self.snapshot(3)), before)
            self.assertEqual(round(sum(after['seasonal_weights'])*100), 10000)

    def test_invalid_remaining_total_zero_open_weights_and_all_closed_are_rejected(self):
        self.change()
        goal = self.goal()
        for total, weights, code in ((0, [1]*12, 422), (goal['annual_amount'], [100]+[0]*11, 422)):
            body = {'revision': goal['revision'], 'mode': 'seasonal', 'annual_amount': total, 'weights': weights if sum(weights)==100 else [8.34]*4+[8.33]*8}
            result = self.client.put('/api/goals/1', json=body)
            self.assertEqual(result.status_code, code, result.text)
        for month in range(2,13):
            self.change(month=month)
        goal = self.goal()
        self.assertEqual(self.client.put('/api/goals/1', json={'revision': goal['revision'], 'mode': 'equal', 'annual_amount': goal['annual_amount']}).status_code, 409)

    def test_seasonality_closed_weight_is_frozen_open_weights_remain_editable(self):
        profile = self.client.get('/api/seasonality').json()['profiles'][0]
        self.change()
        before = self.snapshot()
        changed = list(profile['weights'])
        changed[0] += 1
        changed[1] -= 1
        result = self.client.put('/api/seasonality/1/2026', json={'revision': 0, 'weights': changed})
        self.assertEqual(result.status_code, 409, result.text)
        changed = list(profile['weights'])
        changed[1] += 1
        changed[2] -= 1
        result = self.client.post('/api/seasonality/1/2026/save', json={'revision': 0, 'weights': changed, 'action': 'apply', 'confirmation': 'APLICAR', 'goals': [{'goal_id': 1, 'revision': self.goal()['revision']}]})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0]['weights'][0], profile['weights'][0])
        self.assertEqual(self.snapshot(), before)

    def test_profile_and_goal_batch_roll_back_on_conflict_with_closed_months(self):
        self.change()
        before = self.client.get('/api/seasonality').json()
        result = self.client.post('/api/seasonality/1/2026/save', json={'revision': 0, 'weights': before['profiles'][0]['weights'], 'action': 'apply', 'confirmation': 'APLICAR', 'goals': [{'goal_id': 1, 'revision': -1}]})
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.client.get('/api/seasonality').json(), before)

    def test_linked_catalogs_and_new_historical_records_cannot_change_closed_reports(self):
        self.change()
        bootstrap = self.client.get('/api/bootstrap').json()
        self.assertEqual(len(bootstrap['closures']), 1)
        agency = bootstrap['agencies'][0]
        body = {k: agency[k] for k in ('code','name','regional_id','city','state','manager','active')}
        body['name'] = 'Nome alterado'
        self.assertEqual(self.client.put(f"/api/agencies/{agency['id']}", json=body).status_code, 409)
        product = bootstrap['products'][0]
        self.assertEqual(self.client.put(f"/api/products/{product['id']}", json={k: product[k] for k in ('name','sub_product','unit','active')}).status_code, 409)
        self.assertEqual(self.client.post('/api/agencies/1/portfolios', json={'code':'novo','name':'Nova carteira','segment_id':1}).status_code, 409)
        self.assertEqual(self.client.post('/api/products', json={'name':'Novo produto','sub_product':'Novo subproduto'}).status_code, 409)
        self.assertEqual(self.client.post('/api/agencies', json={'code':'9999','name':'Nova agência','regional_id':1,'city':'Curitiba','state':'PR'}).status_code, 409)
        self.assertEqual(self.client.post('/api/agencies', json={'code':'9999','name':'Nova agência','regional_id':1,'city':'Curitiba','state':'PR','year':2027}).status_code, 201)

    def test_database_barrier_rejects_insert_update_delete_and_preserves_data(self):
        self.change()
        before = self.snapshot()
        statements = ["UPDATE months SET amount=0 WHERE goal_id=1 AND month=1", "DELETE FROM months WHERE goal_id=1 AND month=1", "UPDATE allocations SET bps=0 WHERE goal_id=1 AND month=1", "DELETE FROM allocations WHERE goal_id=1 AND month=1", "INSERT INTO months VALUES(1,1,0,0)"]
        for sql in statements:
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'Período fechado'):
                with db.connect() as conn:
                    conn.execute(sql)
        self.assertEqual(self.snapshot(), before)

    def test_concurrent_close_only_one_wins_and_reopening_restores_editing(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.change(revision=0), range(2)))
        self.assertEqual(sorted(r.status_code for r in results), [200,409])
        self.assertEqual(self.client.get('/api/closures').json()['total'], 1)
        self.change(closed=False)
        self.assertEqual(self.client.put('/api/goals/1/months/1', json={'revision': self.goal()['revision'], 'amount': 123}).status_code, 200)

    def test_initialize_is_idempotent_and_keeps_closures_and_audit(self):
        self.change()
        before = self.client.get('/api/closures').json()
        db.initialize()
        db.initialize()
        self.assertEqual(self.client.get('/api/closures').json(), before)

    def test_units_and_percentage_goals_preserve_closed_values_and_exact_totals(self):
        product = self.client.post('/api/products', json={'name': 'Índice', 'sub_product': 'Meta percentual', 'unit': 'PCT'}).json()
        rows = self.client.get('/api/goals?year=2026').json()['rows']
        ids = [next(r['goal']['id'] for r in rows if r['goal']['unit'] == 'UN'), next(r['goal']['id'] for r in rows if r['goal']['product_id'] == product['id'])]
        for id in ids:
            goal = self.goal(id)
            self.assertEqual(self.client.put(f'/api/goals/{id}', json={'revision': goal['revision'], 'mode': 'equal', 'annual_amount': 101}).status_code, 200)
        self.change()
        before = self.snapshot()
        for id in ids:
            goal = self.goal(id)
            scale = 1000
            result = self.client.put(f'/api/goals/{id}', json={'revision': goal['revision'], 'mode': 'equal', 'annual_amount': 103})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(sum(round(m['amount']*scale) for m in self.goal(id)['months']), 103*scale)
        self.assertEqual(self.snapshot(), before)


if __name__ == '__main__':
    unittest.main()
