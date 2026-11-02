import csv
import io
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unlocked_client import UnlockedClient

from backend import database as db
from backend.domain import apportion
from backend.main import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_db = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "test.db"
        db.initialize()
        self.client = UnlockedClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original_db
        self.temp.cleanup()

    def allocation(self, goal=1, month=1):
        return self.client.get(f"/api/goals/{goal}/allocations?month={month}").json()

    def payload(self, shares=None, goal=1, month=1):
        a = self.allocation(goal, month)
        return {"revision": a["revision"], "month": month, "mode": "percent", "entries": [{"portfolio_id":e["portfolio_id"],"value":v} for e,v in zip(a["entries"], shares or [10,20,25,25,20])]}

    def plan(self):
        return self.client.get("/api/agencies/1/goals?year=2026").json()

    def review_months(self):
        g = self.plan()["goals"][0]
        return self.client.put("/api/goals/1", json={"revision":g["revision"], "mode":"monthly", "amounts":[m["amount"] for m in g["months"]]})

    def test_reference_is_imported_with_twelve_months_and_missing_april(self):
        b = self.client.get("/api/bootstrap").json()
        self.assertEqual((len(b["agencies"]),len(b["products"]),len(b["templates"])),(2,4,5))
        p = self.plan()
        self.assertEqual(len(p["goals"][0]["months"]),12)
        self.assertEqual(p["goals"][0]["missing_months"],[4])
        self.assertEqual(p["goals"][0]["annual_amount"],11700000)

    def test_new_agency_gets_products_months_and_default_portfolios(self):
        r = self.client.post("/api/agencies",json={"code":"9999","name":"Agência teste","regional_id":1,"city":"Curitiba","state":"PR","year":2027})
        self.assertEqual(r.status_code,201,r.text)
        p = r.json()
        self.assertEqual(len(p["portfolios"]),5)
        self.assertEqual(len(p["goals"]),4)
        for goal in p["goals"]:
            self.assertEqual(len(goal["months"]),12)
            self.assertEqual(goal["annual_amount"],0)
            a = self.allocation(goal["id"])
            self.assertEqual(sum(e["percent"] for e in a["entries"]),100)

    def test_duplicate_agency_is_rejected(self):
        r = self.client.post("/api/agencies",json={"code":"073707","name":"Duplicada","regional_id":1,"city":"Curitiba","state":"PR"})
        self.assertEqual(r.status_code,409)

    def test_sixty_percent_is_rejected_without_changes(self):
        before=self.allocation()
        r=self.client.put("/api/goals/1/allocations",json=self.payload([10,50,0,0,0]))
        self.assertEqual(r.status_code,422)
        self.assertIn("60%",r.json()["detail"])
        self.assertEqual(self.allocation(),before)

    def test_over_allocation_is_rejected(self):
        r=self.client.put("/api/goals/1/allocations",json=self.payload([30,30,30,30,30]))
        self.assertEqual(r.status_code,422)

    def test_negative_percent_is_rejected(self):
        r=self.client.put("/api/goals/1/allocations",json=self.payload([-10,30,30,30,20]))
        self.assertEqual(r.status_code,422)

    def test_fraction_beyond_basis_point_is_rejected(self):
        r=self.client.put("/api/goals/1/allocations",json=self.payload([10.001,19.999,25,25,20]))
        self.assertEqual(r.status_code,422)

    def test_duplicate_portfolio_is_rejected(self):
        body=self.payload()
        body["entries"][1]["portfolio_id"]=body["entries"][0]["portfolio_id"]
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,422)

    def test_other_agency_portfolio_is_rejected(self):
        body=self.payload()
        body["entries"][0]["portfolio_id"]=self.allocation(5)["entries"][0]["portfolio_id"]
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,422)

    def test_missing_portfolio_is_rejected(self):
        body=self.payload();body["entries"].pop()
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,422)

    def test_valid_distribution_updates_and_conserves_total(self):
        r=self.client.put("/api/goals/1/allocations",json=self.payload([15,18,22,20,25]))
        self.assertEqual(r.status_code,200,r.text)
        a=r.json()
        self.assertEqual(sum(e["amount"] for e in a["entries"]),a["total"])
        self.assertEqual(a["revision"],2)

    def test_valid_amount_distribution_preserves_exact_values(self):
        body=self.payload();body["mode"]="amount"
        for e,v in zip(body["entries"],[0.01,0.02,0.03,0.04,1099999.9]):e["value"]=v
        r=self.client.put("/api/goals/1/allocations",json=body)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()["entries"][0]["amount"],0.01)
        self.assertEqual(sum(e["percent"] for e in r.json()["entries"]),100)

    def test_incomplete_amounts_are_rejected(self):
        body=self.payload();body["mode"]="amount"
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,422)

    def test_stale_revision_is_rejected(self):
        body=self.payload()
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,200)
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,409)

    def test_concurrent_same_revision_has_only_one_winner(self):
        body=self.payload()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.client.put("/api/goals/1/allocations",json=body).status_code,range(2)))
        self.assertEqual(sorted(results),[200,409])

    def test_all_months_copy_conserves_each_month(self):
        body=self.payload([33.33,33.33,33.34,0,0]);body["apply_to_all"]=True
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,200)
        for m in range(1,13):
            a=self.allocation(month=m)
            self.assertEqual(round(sum(e["amount"] for e in a["entries"]),2),a["total"])

    def test_bad_seasonal_weights_do_not_mutate_plan(self):
        before=self.plan()
        r=self.client.put("/api/goals/1",json={"revision":1,"mode":"seasonal","annual_amount":100,"weights":[5]*12})
        self.assertEqual(r.status_code,422)
        self.assertEqual(self.plan(),before)

    def test_seasonal_rounding_conserves_annual_cents(self):
        r=self.client.put("/api/goals/1",json={"revision":1,"mode":"seasonal","annual_amount":0.07,"weights":[8.34]*4+[8.33]*8})
        self.assertEqual(r.status_code,200,r.text)
        g=r.json()["goals"][0]
        self.assertEqual(sum(round(m["amount"]*1000) for m in g["months"]),70)
        self.assertEqual(g["missing_months"],[])
        for m in range(1,13):
            a=self.allocation(month=m)
            self.assertEqual(sum(round(e["amount"]*1000) for e in a["entries"]),round(a["total"]*1000))

    def test_units_remain_integer(self):
        r=self.client.put("/api/goals/2",json={"revision":1,"mode":"seasonal","annual_amount":17,"weights":[8.34]*4+[8.33]*8})
        self.assertEqual(r.status_code,200,r.text)
        g=r.json()["goals"][1]
        self.assertEqual(sum(round(m["amount"]*1000) for m in g["months"]),17000)
        self.assertTrue(all(round(m["amount"],3)==m["amount"] for m in g["months"]))
        r=self.client.put("/api/goals/2",json={"revision":2,"mode":"monthly","amounts":[1.4999]*12})
        self.assertEqual(r.status_code,422)

    def test_twelve_months_are_required(self):
        r=self.client.put("/api/goals/1",json={"revision":1,"mode":"monthly","amounts":[0]*11})
        self.assertEqual(r.status_code,422)

    def test_goals_have_no_draft_validation_or_publication_step(self):
        body=self.payload();body["apply_to_all"]=True
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=body).status_code,200)
        goal=self.plan()["goals"][0]
        for gone in ("status","confirmed_months"):
            self.assertNotIn(gone,goal)
        self.assertNotIn("confirmed",goal["months"][0])
        self.assertNotIn("confirmed",self.allocation())
        self.assertNotIn("status",self.allocation())
        # A meta continua editável depois de distribuída e não existe rota para publicar ou reabrir.
        self.assertEqual(self.review_months().status_code,200)
        self.assertEqual(self.client.put("/api/goals/1/allocations",json=self.payload()).status_code,200)
        for action in ("publish","reopen"):
            self.assertIn(self.client.post(f"/api/goals/1/{action}",json={"revision":1}).status_code,(404,405))
        d=self.client.get("/api/dashboard").json()
        self.assertEqual(d["loaded_goals"],sum(g["annual_amount"]>0 for g in self.client.get("/api/agencies/1/goals").json()["goals"])+sum(g["annual_amount"]>0 for g in self.client.get("/api/agencies/2/goals").json()["goals"]))
        for gone in ("published_goals","pending_months"):
            self.assertNotIn(gone,d)

    def test_new_product_propagates_to_existing_agencies(self):
        r=self.client.post("/api/products",json={"name":"Consórcios","sub_product":"Planejamento","unit":"BRL"})
        self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(len(self.plan()["goals"]),5)
        self.assertEqual(len(self.client.get('/api/agencies/2/goals').json()["goals"]),5)

    def test_subproduct_is_the_unit_of_goals_inside_a_product(self):
        base={"name":"Crédito","unit":"BRL"}
        r=self.client.post("/api/products",json={**base,"sub_product":"Crédito rural"})
        self.assertEqual(r.status_code,201,r.text)
        created=r.json()
        self.assertEqual((created["name"],created["sub_product"]),("Crédito","Crédito rural"))
        # O mesmo produto com outro subproduto ganha a própria meta e distribuição em cada agência.
        goal=next(g for g in self.plan()["goals"] if g["product_id"]==created["id"])
        self.assertEqual((goal["product_name"],goal["sub_product"]),("Crédito","Crédito rural"))
        self.assertEqual(len(self.plan()["goals"]),5)
        self.assertEqual(self.allocation(goal["id"])["total"],0)
        # Produto + subproduto não se repetem, sem diferenciar maiúsculas, nem ao criar nem ao editar.
        self.assertEqual(self.client.post("/api/products",json={**base,"sub_product":"crédito RURAL"}).status_code,409)
        other=self.client.post("/api/products",json={**base,"sub_product":"Crédito pessoal"}).json()
        self.assertEqual(self.client.put(f"/api/products/{other['id']}",json={**base,"sub_product":"Crédito rural"}).status_code,409)
        self.assertEqual(self.client.put(f"/api/products/{other['id']}",json={**base,"sub_product":"Consignado"}).status_code,200)
        # O campo antigo "category" deixou de existir.
        self.assertEqual(self.client.post("/api/products",json={"name":"Consórcios","category":"Planejamento","unit":"BRL"}).status_code,422)

    def test_template_must_close_one_hundred(self):
        r=self.client.put("/api/templates",json={"entries":[{"name":"Carteira única","segment_id":1,"suggested_percent":60}]})
        self.assertEqual(r.status_code,422)
        self.assertEqual(len(self.client.get('/api/bootstrap').json()['templates']),5)

    def test_new_portfolio_starts_at_zero_percent_and_bumps_goal_revision(self):
        body=self.payload();body["apply_to_all"]=True
        self.client.put("/api/goals/1/allocations",json=body)
        revision=self.plan()['goals'][0]['revision']
        r=self.client.post("/api/agencies/1/portfolios",json={"code":"7","name":"Nova carteira","segment_id":2})
        self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(self.plan()['goals'][0]['revision'],revision+1)
        self.assertEqual(self.allocation()['entries'][-1]['percent'],0)
        self.assertEqual(sum(e['percent'] for e in self.allocation()['entries']),100)

    def test_cannot_archive_portfolio_with_assigned_values(self):
        p=self.plan()['portfolios'][0]
        body={k:p[k] for k in ['code','name','segment_id','manager','suggested_percent']};body['active']=False
        self.assertEqual(self.client.put(f"/api/portfolios/{p['id']}",json=body).status_code,422)

    def test_money_and_units_are_separate(self):
        d=self.client.get('/api/dashboard').json()
        self.assertEqual(d['currency_total'],round(sum(p['total'] for p in d['products'] if p['unit']=='BRL'),2))

    def test_export_is_filtered_and_auditable(self):
        r=self.client.get('/api/export?year=2026&agency_id=1')
        self.assertEqual(r.status_code,200)
        records=list(csv.reader(io.StringIO(r.content.decode('utf-8-sig')),delimiter=';'))
        self.assertEqual(len(records),1+4*12*5)
        self.assertEqual(records[0][1:4],['Regional','Agência','Código agência'])
        self.assertEqual(records[0][4:],['Produto','Subproduto','Mês','Carteira','Segmento','Responsável','Meta agência','Percentual','Meta carteira'])
        self.assertTrue(all(len(row)==13 and 1<=int(row[6])<=12 for row in records[1:]))
        self.assertTrue(all(row[3]=='073707' and row[1]=='Sem regional' for row in records[1:]))

    def test_invalid_month_has_validation_error(self):
        self.assertEqual(self.client.get('/api/goals/1/allocations?month=13').status_code,422)

    def test_apportion_handles_small_totals(self):
        for total in [0,1,2,7,13,101,100000001]:
            parts=apportion(total,[3333,3333,3334])
            self.assertEqual(sum(parts),total)
            self.assertTrue(all(v>=0 for v in parts))

    def test_matrix_groups_agencies_and_keeps_twelve_months(self):
        r = self.client.get('/api/goals?year=2026')
        self.assertEqual(r.status_code, 200, r.text)
        rows = r.json()['rows']
        self.assertEqual(len(rows), 8)
        self.assertEqual([row['agency']['code'] for row in rows[:4]], ['073702']*4)
        for item in rows:
            self.assertEqual(len(item['goal']['months']), 12)
            self.assertEqual(len(item['portfolios']), 5)
            self.assertEqual(item['goal']['planning_method'], 'imported')
            self.assertEqual(item['goal']['manual_months'], 0)
            scale = 100 if item['goal']['unit'] == 'BRL' else 1
            for i, month in enumerate(item['goal']['months']):
                self.assertEqual(sum(round(p['months'][i]['amount']*scale) for p in item['portfolios']), round(month['amount']*scale))
                self.assertEqual(sum(round(p['months'][i]['percent']*100) for p in item['portfolios']), 10000)

    def test_matrix_filters_agency_product_and_year(self):
        rows = self.client.get('/api/goals?year=2026&agency_id=1&product_id=3').json()['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['agency']['id'], 1)
        self.assertEqual(rows[0]['goal']['product_id'], 3)
        self.assertEqual(self.client.get('/api/goals?year=2027').json()['rows'], [])
        self.assertEqual(self.client.get('/api/goals?year=2026&agency_id=999').json()['rows'], [])

    def test_matrix_excludes_inactive_agencies_and_counts_missing_portfolios(self):
        with db.connect() as conn:
            conn.execute('UPDATE agencies SET active=0 WHERE id=2')
            conn.execute('UPDATE portfolios SET active=0 WHERE agency_id=1')
        matrix = self.client.get('/api/goals').json()
        self.assertEqual(len(matrix['rows']), 4)
        self.assertEqual(matrix['goals_without_portfolios'], 4)
        self.assertTrue(all(not r['portfolios'] for r in matrix['rows']))

    def test_month_edit_preserves_other_months_and_marks_manual(self):
        body = self.payload(); body['apply_to_all'] = True
        self.client.put('/api/goals/1/allocations', json=body)
        before = self.plan()['goals'][0]
        amount = before['months'][1]['amount'] - .07
        r = self.client.put('/api/goals/1/months/2', json={'revision': before['revision'], 'amount': amount})
        self.assertEqual(r.status_code, 200, r.text)
        g = r.json()['goals'][0]
        self.assertEqual(g['planning_method'], 'monthly')
        self.assertEqual(g['manual_months'], 1)
        self.assertEqual(g['missing_months'], [4])
        self.assertEqual(g['months'][1]['manual'], 1)
        self.assertTrue(all(m == before['months'][i] for i,m in enumerate(g['months']) if i != 1))
        allocation = self.allocation(month=2)
        self.assertEqual(sum(round(e['amount']*100) for e in allocation['entries']), round(amount*100))
        self.assertEqual(g['annual_amount'], before['annual_amount'])

    def test_april_review_does_not_clear_unrelated_missing_months(self):
        with db.connect() as conn:
            conn.execute("UPDATE goals SET missing_months='[4,5]' WHERE id=1")
        r = self.client.put('/api/goals/1/months/4',json={'revision':1,'amount':0})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['goals'][0]['missing_months'], [5])
        self.assertEqual(r.json()['goals'][0]['months'][3]['manual'], 1)

    def test_month_edit_enforces_revision_and_integer_units(self):
        self.assertEqual(self.client.put('/api/goals/1/months/1',json={'revision':0,'amount':1}).status_code,409)
        self.assertEqual(self.client.put('/api/goals/2/months/1',json={'revision':1,'amount':1.5555}).status_code,422)
        self.assertEqual(self.client.put('/api/goals/1/months/13',json={'revision':1,'amount':1}).status_code,422)

    def test_seasonality_persists_weights_and_clears_manual_flags(self):
        self.client.put('/api/goals/1/months/1',json={'revision':1,'amount':1})
        weights = [8.34]*4 + [8.33]*8
        r = self.client.put('/api/goals/1',json={'revision':2,'mode':'seasonal','annual_amount':123.45,'weights':weights})
        self.assertEqual(r.status_code, 200, r.text)
        g = r.json()['goals'][0]
        self.assertEqual(g['seasonal_weights'], weights)
        self.assertEqual(g['planning_method'], 'seasonal')
        self.assertEqual(g['manual_months'], 0)

    def test_matrix_uses_exact_amount_overrides_instead_of_recalculating_percentages(self):
        body = self.payload(); body['mode'] = 'amount'
        for e,v in zip(body['entries'],[0.01,0.02,0.03,0.04,1099999.9]):
            e['value'] = v
        self.client.put('/api/goals/1/allocations',json=body)
        item = self.client.get('/api/goals?agency_id=1&product_id=1').json()['rows'][0]
        self.assertEqual(item['portfolios'][0]['months'][0]['amount'],0.01)
        self.assertEqual(item['portfolios'][0]['months'][0]['percent'],0)

    def test_export_filters_match_matrix_product_selection(self):
        r = self.client.get('/api/export?year=2026&agency_id=1&product_id=1&active_only=true')
        records = list(csv.reader(io.StringIO(r.content.decode('utf-8-sig')),delimiter=';'))
        self.assertEqual(len(records),61)
        self.assertEqual(records[0][4:6],['Produto','Subproduto'])
        self.assertTrue(all(row[3]=='073707' and row[4:6]==['Crédito','Crédito e financiamento'] for row in records[1:]))

    def save_seasonality(self, product=1, year=2026, weights=None, revision=0):
        return self.client.put(f'/api/seasonality/{product}/{year}', json={
            'revision': revision, 'weights': weights if weights is not None else [5]*11+[45]})

    def test_product_seasonality_is_saved_by_year_without_changing_goals(self):
        before = self.plan()
        r = self.save_seasonality()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['revision'], 1)
        self.assertEqual(self.plan(), before)
        profiles = self.client.get('/api/seasonality?year=2026').json()['profiles']
        self.assertEqual(profiles[0]['weights'], [5]*11+[45])
        self.assertEqual(profiles[1]['revision'], 0)
        self.assertEqual(self.client.get('/api/seasonality?year=2027').json()['profiles'][0]['revision'], 0)
        db.initialize()
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0], r.json())

    def test_product_seasonality_rejects_invalid_weights_without_saving(self):
        invalid = [[5]*12, [10]*12, [100]+[0]*10, [-1, 101]+[0]*10, [8.333]*12]
        for weights in invalid:
            with self.subTest(weights=weights):
                self.assertEqual(self.save_seasonality(weights=weights).status_code, 422)
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0]['revision'], 0)
        self.assertEqual(self.save_seasonality(year=2101).status_code, 422)
        self.assertEqual(self.save_seasonality(product=999).status_code, 404)

    def test_product_seasonality_detects_stale_saves(self):
        self.assertEqual(self.save_seasonality().status_code, 200)
        self.assertEqual(self.save_seasonality(weights=[100]+[0]*11).status_code, 409)
        r = self.save_seasonality(weights=[100]+[0]*11, revision=1)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['revision'], 2)

    def test_apply_product_seasonality_to_multiple_agencies_conserves_totals_and_shares(self):
        body = self.payload(); body['apply_to_all'] = True
        self.client.put('/api/goals/1/allocations', json=body)
        rows = self.client.get('/api/goals?product_id=1').json()['rows']
        untouched = self.client.get('/api/goals?product_id=2').json()
        self.save_seasonality()
        r = self.client.post('/api/seasonality/1/2026/apply', json={'revision': 1,
            'goals': [{'goal_id': row['goal']['id'], 'revision': row['goal']['revision']} for row in rows]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['applied'], 2)
        after = self.client.get('/api/goals?product_id=1').json()['rows']
        for old, item in zip(rows, after):
            goal = item['goal']
            self.assertEqual(goal['annual_amount'], old['goal']['annual_amount'])
            self.assertEqual(goal['revision'], old['goal']['revision']+1)
            self.assertEqual(goal['planning_method'], 'seasonal')
            self.assertEqual(goal['seasonal_weights'], [5]*11+[45])
            self.assertEqual(goal['manual_months'], 0)
            self.assertEqual(goal['missing_months'], [])
            for month in range(12):
                self.assertEqual(sum(round(p['months'][month]['amount']*100) for p in item['portfolios']), round(goal['months'][month]['amount']*100))
                self.assertEqual([p['months'][month]['percent'] for p in item['portfolios']], [p['months'][month]['percent'] for p in old['portfolios']])
        self.assertEqual(self.client.get('/api/goals?product_id=2').json(), untouched)

    def test_apply_seasonality_to_one_agency_handles_cents_and_integer_units(self):
        for product, total in [(1, .07), (2, 7)]:
            goal = self.plan()['goals'][product-1]
            result = self.client.post('/api/annual-goals', json={'year': 2026, 'product_id': product, 'method': 'equal', 'entries': [{'goal_id': goal['id'], 'revision': goal['revision'], 'annual_amount': total}]})
            self.assertEqual(result.status_code, 200, result.text)
            goal = self.plan()['goals'][product-1]
            self.save_seasonality(product=product)
            other = self.client.get('/api/agencies/2/goals').json()
            r = self.client.post(f'/api/seasonality/{product}/2026/apply', json={'revision': 1, 'goals': [{'goal_id': goal['id'], 'revision': goal['revision']}]})
            self.assertEqual(r.status_code, 200, r.text)
            after = self.plan()['goals'][product-1]
            expected_total = 70 if product == 1 else 7000
            # Reais (ou unidades) cheios por mês; o que sobra do real vai para o último mês com peso.
            units, left = divmod(expected_total, 1000)
            expected = [v * 1000 for v in apportion(units, [500]*11+[4500])]
            expected[-1] += left
            self.assertEqual([round(m['amount']*1000) for m in after['months']], expected)
            self.assertEqual(self.client.get('/api/agencies/2/goals').json(), other)

    def test_apply_seasonality_is_atomic_for_stale_goals(self):
        self.save_seasonality()
        before = self.client.get('/api/goals').json()
        audit = self.client.get('/api/audit').json()
        r = self.client.post('/api/seasonality/1/2026/apply', json={'revision': 1, 'goals': [
            {'goal_id': 1, 'revision': 1}, {'goal_id': 5, 'revision': 0}]})
        self.assertEqual(r.status_code, 409, r.text)
        self.assertEqual(self.client.get('/api/goals').json(), before)
        self.assertEqual(self.client.get('/api/audit').json(), audit)

    def test_apply_seasonality_validates_profile_targets_and_scope(self):
        body = {'revision': 1, 'goals': [{'goal_id': 1, 'revision': 1}]}
        self.assertEqual(self.client.post('/api/seasonality/1/2026/apply', json=body).status_code, 409)
        self.save_seasonality()
        for goals in [[], [{'goal_id': 1, 'revision': 1}]*2, [{'goal_id': 2, 'revision': 1}]]:
            self.assertEqual(self.client.post('/api/seasonality/1/2026/apply', json={**body, 'goals': goals}).status_code, 422)
        self.save_seasonality(year=2027)
        self.assertEqual(self.client.post('/api/seasonality/1/2027/apply', json=body).status_code, 422)
        with db.connect() as conn:
            conn.execute('UPDATE agencies SET active=0 WHERE id=1')
        self.assertEqual(self.client.post('/api/seasonality/1/2026/apply', json=body).status_code, 422)

    def test_apply_seasonality_detects_changed_profile_and_audits_success(self):
        self.save_seasonality()
        self.save_seasonality(revision=1)
        body = {'revision': 1, 'goals': [{'goal_id': 1, 'revision': 1}]}
        self.assertEqual(self.client.post('/api/seasonality/1/2026/apply', json=body).status_code, 409)
        body['revision'] = 2
        r = self.client.post('/api/seasonality/1/2026/apply', json=body)
        self.assertEqual(r.status_code, 200, r.text)
        entries = self.client.get('/api/audit?agency_id=1').json()['entries']
        self.assertEqual(entries[0]['entity'], 'goal')
        self.assertIn('seasonal', entries[0]['after_json'])

    def test_confirmed_save_requires_typed_word_and_leaves_goals_untouched(self):
        before = self.client.get('/api/goals').json()
        payload = {'revision': 0, 'weights': [5]*11+[45], 'action': 'save', 'confirmation': ''}
        for word in ['', 'salvar', 'APLICAR', 'SALVA']:
            r = self.client.post('/api/seasonality/1/2026/save', json={**payload, 'confirmation': word})
            self.assertEqual(r.status_code, 422, r.text)
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0]['revision'], 0)
        r = self.client.post('/api/seasonality/1/2026/save', json={**payload, 'confirmation': 'SALVAR'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['applied'], 0)
        self.assertEqual(r.json()['profile']['weights'], payload['weights'])
        self.assertEqual(self.client.get('/api/goals').json(), before)

    def test_confirmed_apply_can_select_nonconsecutive_agencies(self):
        r = self.client.post('/api/agencies', json={'code': '9999', 'name': 'Agência terceira', 'regional_id': 1, 'city': 'Curitiba', 'state': 'PR'})
        self.assertEqual(r.status_code, 201, r.text)
        third_goal = r.json()['goals'][0]
        result = self.client.post('/api/annual-goals', json={'year': 2026, 'product_id': third_goal['product_id'], 'method': 'equal', 'entries': [{'goal_id': third_goal['id'], 'revision': third_goal['revision'], 'annual_amount': .12}]})
        self.assertEqual(result.status_code, 200, result.text)
        rows = self.client.get('/api/goals?product_id=1').json()['rows']
        targets = [r for r in rows if r['agency']['id'] in [1, 3]]
        excluded = self.client.get('/api/agencies/2/goals').json()
        untouched_product = self.client.get('/api/goals?product_id=2').json()
        payload = {'revision': 0, 'weights': [5]*11+[45], 'action': 'apply', 'confirmation': 'APLICAR',
            'goals': [{'goal_id': r['goal']['id'], 'revision': r['goal']['revision']} for r in targets]}
        r = self.client.post('/api/seasonality/1/2026/save', json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['applied'], 2)
        for target in targets:
            goal = self.client.get(f"/api/agencies/{target['agency']['id']}/goals").json()['goals'][0]
            self.assertEqual(goal['seasonal_weights'], payload['weights'])
            self.assertEqual(goal['annual_amount'], target['goal']['annual_amount'])
        self.assertEqual(self.client.get('/api/agencies/2/goals').json(), excluded)
        self.assertEqual(self.client.get('/api/goals?product_id=2').json(), untouched_product)

    def test_confirmed_apply_can_select_one_agency_and_rejects_empty_selection(self):
        before = self.client.get('/api/agencies/2/goals').json()
        payload = {'revision': 0, 'weights': [100]+[0]*11, 'action': 'apply', 'confirmation': 'APLICAR', 'goals': []}
        r = self.client.post('/api/seasonality/1/2026/save', json=payload)
        self.assertEqual(r.status_code, 422, r.text)
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0]['revision'], 0)
        payload['goals'] = [{'goal_id': 1, 'revision': 1}]
        r = self.client.post('/api/seasonality/1/2026/save', json=payload)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['applied'], 1)
        self.assertEqual(self.plan()['goals'][0]['months'][0]['amount'], self.plan()['goals'][0]['annual_amount'])
        self.assertEqual(self.client.get('/api/agencies/2/goals').json(), before)

    def test_confirmed_apply_rolls_back_profile_and_audit_on_any_target_conflict(self):
        self.save_seasonality(weights=[100]+[0]*11)
        before_profile = self.client.get('/api/seasonality').json()
        before_goals = self.client.get('/api/goals').json()
        before_audit = self.client.get('/api/audit').json()
        payload = {'revision': 1, 'weights': [5]*11+[45], 'action': 'apply', 'confirmation': 'APLICAR',
            'goals': [{'goal_id': 1, 'revision': 1}, {'goal_id': 5, 'revision': 0}]}
        r = self.client.post('/api/seasonality/1/2026/save', json=payload)
        self.assertEqual(r.status_code, 409, r.text)
        self.assertEqual(self.client.get('/api/seasonality').json(), before_profile)
        self.assertEqual(self.client.get('/api/goals').json(), before_goals)
        self.assertEqual(self.client.get('/api/audit').json(), before_audit)

    def test_confirmed_save_rejects_mismatched_action_and_targets(self):
        payload = {'revision': 0, 'weights': [5]*11+[45], 'action': 'apply', 'confirmation': 'SALVAR',
            'goals': [{'goal_id': 1, 'revision': 1}]}
        self.assertEqual(self.client.post('/api/seasonality/1/2026/save', json=payload).status_code, 422)
        payload['action'] = 'save'
        self.assertEqual(self.client.post('/api/seasonality/1/2026/save', json=payload).status_code, 422)
        payload['action'] = 'apply'; payload['confirmation'] = 'APLICAR'
        payload['goals'] = [{'goal_id': 2, 'revision': 1}]
        self.assertEqual(self.client.post('/api/seasonality/1/2026/save', json=payload).status_code, 422)
        self.assertEqual(self.client.get('/api/seasonality').json()['profiles'][0]['revision'], 0)

    def test_schema_upgrade_keeps_goals_and_creates_backup(self):
        before = self.allocation()
        with db.connect() as conn:
            conn.execute('ALTER TABLE goals DROP COLUMN planning_method')
            conn.execute('ALTER TABLE goals DROP COLUMN seasonal_weights')
            conn.execute('ALTER TABLE months DROP COLUMN manual')
        db.initialize()
        self.assertEqual(self.allocation(),before)
        backups = list((db.DB_PATH.parent/'backups').glob('*.db'))
        self.assertEqual(len(backups),1)
        db.initialize()
        self.assertEqual(len(list((db.DB_PATH.parent/'backups').glob('*.db'))),1)

    def test_old_databases_lose_status_and_confirmed_columns_without_losing_goals(self):
        with db.connect() as conn:
            conn.execute("ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'")
            conn.execute("ALTER TABLE months ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0")
            conn.execute("UPDATE goals SET status='published' WHERE id=1")
            conn.execute("UPDATE months SET confirmed=1 WHERE goal_id=1")
        before=self.client.get('/api/goals').json()
        for item in before['rows']:
            item['goal'].pop('status')  # a coluna antiga ainda vazava na resposta antes de ser removida
        db.initialize()
        with db.connect() as conn:
            self.assertNotIn('status',[r[1] for r in conn.execute('PRAGMA table_info(goals)')])
            self.assertNotIn('confirmed',[r[1] for r in conn.execute('PRAGMA table_info(months)')])
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.client.get('/api/goals').json(),before)
        self.assertEqual(len(list((db.DB_PATH.parent/'backups').glob('metas-before-no-plans-*.db'))),1)
        # Uma meta que estava publicada volta a ser editável como qualquer outra.
        self.assertEqual(self.review_months().status_code,200)
        db.initialize()
        self.assertEqual(len(list((db.DB_PATH.parent/'backups').glob('metas-before-no-plans-*.db'))),1)


if __name__=='__main__':
    unittest.main()
