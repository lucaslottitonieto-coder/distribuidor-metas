import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from backend import database as db
from backend.main import app


class StartYearTests(unittest.TestCase):
    """Iniciar um ano copia a estrutura (agências, carteiras, subprodutos) e deixa todos os valores de meta zerados."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "year.db"
        db.initialize()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def start(self, **body):
        return self.client.post("/api/years", json={"year": 2027, "copy_from": 2026, **body})

    def rows(self, year):
        return self.client.get(f"/api/goals?year={year}").json()["rows"]

    def custom_percentages(self):
        """Distribui o Crédito da agência 1 em 2026 com participações diferentes das sugeridas."""
        goal = next(r["goal"] for r in self.rows(2026) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        entries = [{"portfolio_id": p["id"], "value": v} for p, v in zip(next(r for r in self.rows(2026) if r["goal"]["id"] == goal["id"])["portfolios"], [10, 20, 30, 15, 25])]
        saved = self.client.put(f"/api/goals/{goal['id']}/allocations", json={"revision": goal["revision"], "month": 1, "mode": "percent", "apply_to_all": True, "entries": entries})
        self.assertEqual(saved.status_code, 200, saved.text)

    def test_creates_every_active_agency_and_product_with_zero_values(self):
        agencies = len({r["agency"]["id"] for r in self.rows(2026)})
        products = len({r["goal"]["product_id"] for r in self.rows(2026)})
        result = self.start()
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(result.json()["goals"], agencies * products)
        self.assertEqual(result.json()["agencies"], agencies)
        rows = self.rows(2027)
        self.assertEqual(len(rows), agencies * products)
        for row in rows:
            goal = row["goal"]
            self.assertEqual(goal["annual_amount"], 0)
            self.assertTrue(all(m["amount"] == 0 for m in goal["months"]))
            self.assertEqual(goal["planning_method"], "unconfigured")
            self.assertTrue(row["portfolios"])
            self.assertTrue(all(m["amount"] == 0 for p in row["portfolios"] for m in p["months"]))
        before = self.rows(2026)
        self.assertTrue(any(r["goal"]["annual_amount"] != 0 for r in before))

    def test_percentages_are_copied_month_by_month_unless_switched_off(self):
        self.custom_percentages()
        self.assertEqual(self.start().status_code, 201)
        copied = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        for month in (1, 6, 12):
            self.assertEqual([p["months"][month - 1]["percent"] for p in copied["portfolios"]], [10, 20, 30, 15, 25])
        self.assertEqual(self.client.post("/api/years", json={"year": 2028, "copy_from": 2026, "keep_percentages": False}).status_code, 201)
        suggested = next(r for r in self.rows(2028) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in suggested["portfolios"]], [15, 18, 22, 20, 25])

    def test_a_carteira_created_after_the_source_year_enters_with_zero_and_every_month_still_closes_100(self):
        self.custom_percentages()
        created = self.client.post("/api/agencies/1/portfolios", json={"code": "9", "name": "Nova", "segment_id": 1, "manager": "", "suggested_percent": 0, "active": True})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(self.start().status_code, 201)
        row = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual(len(row["portfolios"]), 6)
        for month in range(12):
            self.assertAlmostEqual(sum(p["months"][month]["percent"] for p in row["portfolios"]), 100, places=2)
        self.assertEqual([p["months"][0]["percent"] for p in row["portfolios"]][:5], [10, 20, 30, 15, 25])

    def test_a_month_that_does_not_close_100_in_the_source_keeps_the_suggested_percentages(self):
        self.custom_percentages()
        with db.connect() as conn:
            goal_id = conn.execute("SELECT id FROM goals WHERE agency_id=1 AND product_id=1 AND year=2026").fetchone()[0]
            conn.execute("UPDATE allocations SET bps=bps-100 WHERE goal_id=? AND month=2 AND portfolio_id=(SELECT MIN(id) FROM portfolios WHERE agency_id=1)", (goal_id,))
        self.assertEqual(self.start().status_code, 201)
        row = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in row["portfolios"]], [10, 20, 30, 15, 25])
        self.assertEqual([p["months"][1]["percent"] for p in row["portfolios"]], [15, 18, 22, 20, 25])

    def test_seasonality_profile_follows_the_source_year_unless_switched_off(self):
        weights = [10, 10, 10, 10, 10, 10, 5, 5, 5, 5, 10, 10]
        saved = self.client.put("/api/seasonality/1/2026", json={"revision": 0, "weights": weights})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.start().status_code, 201)
        profile = next(p for p in self.client.get("/api/seasonality?year=2027").json()["profiles"] if p["product_id"] == 1)
        self.assertGreater(profile["revision"], 0)
        self.assertEqual([round(w * 100) for w in profile["weights"]], [round(w * 100) for w in weights])
        self.assertEqual(self.client.post("/api/years", json={"year": 2028, "copy_from": 2026, "keep_seasonality": False}).status_code, 201)
        bare = next(p for p in self.client.get("/api/seasonality?year=2028").json()["profiles"] if p["product_id"] == 1)
        self.assertEqual(bare["revision"], 0)

    def test_second_start_is_refused_and_a_partial_year_only_gets_what_is_missing(self):
        self.assertEqual(self.client.post("/api/agencies/1/years", json={"year": 2027}).status_code, 201)
        partial = len(self.rows(2027))
        result = self.start()
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(result.json()["goals"] + partial, len(self.rows(2027)))
        again = self.start()
        self.assertEqual(again.status_code, 409)
        self.assertIn("já tem metas", again.json()["detail"])

    def test_invalid_origin_and_closed_year_are_rejected_without_creating_anything(self):
        self.assertEqual(self.start(copy_from=2027).status_code, 422)
        self.assertEqual(self.start(copy_from=2030).status_code, 422)
        self.assertEqual(self.rows(2027), [])
        revision = self.client.get("/api/closures?year=2027").json()["months"][0]["revision"]
        closed = self.client.put("/api/closures/2027/1", json={"revision": revision, "closed": True, "actor": "Teste", "reason": "Conferência concluída", "confirmation": "FECHAR"})
        self.assertEqual(closed.status_code, 200, closed.text)
        self.assertEqual(self.start().status_code, 409)
        self.assertEqual(self.rows(2027), [])

    def test_bootstrap_lists_the_years_that_have_goals_and_the_audit_records_each_agency(self):
        before = self.client.get("/api/bootstrap").json()
        self.assertEqual(before["goal_years"], [2026])
        self.assertEqual(self.start().status_code, 201)
        self.assertEqual(self.client.get("/api/bootstrap").json()["goal_years"], [2026, 2027])
        entries = [e for e in self.client.get("/api/audit?limit=200").json()["entries"] if "Metas de 2027 criadas" in e["detail"]]
        self.assertEqual(len(entries), len({r["agency"]["id"] for r in self.rows(2027)}))
        self.assertIn("valores zerados", entries[0]["detail"])
        versions = self.client.get("/api/versions?year=2027").json()
        self.assertEqual(versions["total"], len(self.rows(2027)))


    def test_values_are_copied_only_when_asked_and_wallets_follow_the_month(self):
        self.custom_percentages()
        self.assertEqual(self.start(keep_values=True).status_code, 201)
        source = {r["goal"]["id"]: r for r in self.rows(2026)}
        for row in self.rows(2027):
            old = next(r for r in source.values() if r["agency"]["id"] == row["agency"]["id"] and r["goal"]["product_id"] == row["goal"]["product_id"])
            self.assertEqual(row["goal"]["annual_amount"], old["goal"]["annual_amount"])
            self.assertEqual([m["amount"] for m in row["goal"]["months"]], [m["amount"] for m in old["goal"]["months"]])
            self.assertEqual(row["goal"]["planning_method"], "copied")
            for month in range(12):
                self.assertAlmostEqual(sum(p["months"][month]["amount"] for p in row["portfolios"]), row["goal"]["months"][month]["amount"], places=3)
        copied = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in copied["portfolios"]], [10, 20, 30, 15, 25])
        self.assertTrue(all(float(p["months"][m]["amount"]).is_integer() for p in copied["portfolios"] for m in range(12)))

    def test_values_without_percentages_use_the_suggested_split(self):
        self.custom_percentages()
        self.assertEqual(self.start(keep_values=True, keep_percentages=False).status_code, 201)
        row = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in row["portfolios"]], [15, 18, 22, 20, 25])
        self.assertAlmostEqual(sum(p["months"][0]["amount"] for p in row["portfolios"]), row["goal"]["months"][0]["amount"], places=3)

    def test_values_are_not_copied_without_a_source_year(self):
        result = self.client.post("/api/years", json={"year": 2027, "keep_values": True})
        self.assertEqual(result.status_code, 201, result.text)
        self.assertFalse(result.json()["values"])
        self.assertTrue(all(r["goal"]["annual_amount"] == 0 for r in self.rows(2027)))

    def test_years_overview_counts_goals_loaded_goals_and_closed_months(self):
        overview = self.client.get("/api/years").json()
        first = next(y for y in overview["years"] if y["year"] == 2026)
        agencies = len({r["agency"]["id"] for r in self.rows(2026)})
        self.assertEqual((first["goals"], first["agencies"]), (overview["expected"], agencies))
        self.assertGreater(first["loaded"], 0)
        self.assertEqual(first["closed_months"], 0)
        self.assertEqual(self.start().status_code, 201)
        revision = self.client.get("/api/closures?year=2027").json()["months"][0]["revision"]
        self.assertEqual(self.client.put("/api/closures/2027/1", json={"revision": revision, "closed": True, "actor": "Teste", "reason": "Conferência concluída", "confirmation": "FECHAR"}).status_code, 200)
        second = next(y for y in self.client.get("/api/years").json()["years"] if y["year"] == 2027)
        self.assertEqual((second["goals"], second["loaded"], second["closed_months"]), (overview["expected"], 0, 1))

    def wipe_goals(self, year, where, *args):
        with db.connect() as conn:
            ids = [r[0] for r in conn.execute(f"SELECT id FROM goals WHERE year=? AND {where}", (year, *args))]
            marks = ",".join("?" * len(ids))
            for table in ("allocations", "months", "goal_versions"):
                conn.execute(f"DELETE FROM {table} WHERE goal_id IN ({marks})", ids)
            conn.execute(f"DELETE FROM goals WHERE id IN ({marks})", ids)

    def test_reusing_products_repeats_only_the_subproducts_the_source_year_had(self):
        self.wipe_goals(2026, "product_id=3")
        self.assertEqual(self.start(reuse_products=True).status_code, 201)
        self.assertEqual({r["goal"]["product_id"] for r in self.rows(2027)}, {1, 2, 4})
        self.assertEqual(self.client.post("/api/years", json={"year": 2028, "copy_from": 2026}).status_code, 201)
        self.assertEqual({r["goal"]["product_id"] for r in self.rows(2028)}, {1, 2, 3, 4})

    def test_reusing_regionals_repeats_only_the_regionals_the_source_year_had(self):
        regional = self.client.post("/api/regionals", json={"name": "Regional Sul"}).json()
        agency = next(a for a in self.client.get("/api/bootstrap").json()["agencies"] if a["id"] == 2)
        moved = self.client.put("/api/agencies/2", json={**{k: agency[k] for k in ("code", "name", "city", "state", "manager")}, "regional_id": regional["id"], "active": True})
        self.assertEqual(moved.status_code, 200, moved.text)
        self.wipe_goals(2026, "agency_id=2")
        self.assertEqual(self.start(reuse_regionals=True).status_code, 201)
        self.assertEqual({r["agency"]["id"] for r in self.rows(2027)}, {1})
        self.assertEqual(self.client.post("/api/years", json={"year": 2028, "copy_from": 2026}).status_code, 201)
        self.assertEqual({r["agency"]["id"] for r in self.rows(2028)}, {1, 2})

    def test_reusing_segments_keeps_a_segment_that_had_no_share_at_zero(self):
        goal = next(r for r in self.rows(2026) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        entries = [{"portfolio_id": p["id"], "value": v} for p, v in zip(goal["portfolios"], [0, 20, 30, 25, 25])]
        saved = self.client.put(f"/api/goals/{goal['goal']['id']}/allocations", json={"revision": goal["goal"]["revision"], "month": 1, "mode": "percent", "apply_to_all": True, "entries": entries})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.start(reuse_segments=True, keep_percentages=False).status_code, 201)
        row = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        agro = [p for p in row["portfolios"] if p["segment_id"] == 1]
        self.assertTrue(agro and all(p["months"][m]["percent"] == 0 for p in agro for m in range(12)))
        for month in range(12):
            self.assertAlmostEqual(sum(p["months"][month]["percent"] for p in row["portfolios"]), 100, places=2)
        other = next(r for r in self.rows(2027) if r["agency"]["id"] == 2 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in other["portfolios"]], [15, 18, 22, 20, 25])
        self.assertEqual(self.client.post("/api/years", json={"year": 2028, "copy_from": 2026, "reuse_segments": True, "keep_percentages": True}).status_code, 201)
        exact = next(r for r in self.rows(2028) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        self.assertEqual([p["months"][0]["percent"] for p in exact["portfolios"]], [0, 20, 30, 25, 25])

    def test_reused_segments_also_apply_to_the_copied_values_and_the_audit_says_what_was_reused(self):
        goal = next(r for r in self.rows(2026) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        entries = [{"portfolio_id": p["id"], "value": v} for p, v in zip(goal["portfolios"], [0, 20, 30, 25, 25])]
        self.assertEqual(self.client.put(f"/api/goals/{goal['goal']['id']}/allocations", json={"revision": goal["goal"]["revision"], "month": 1, "mode": "percent", "apply_to_all": True, "entries": entries}).status_code, 200)
        self.assertEqual(self.start(keep_values=True, reuse_segments=True, keep_percentages=False, reuse_products=True, reuse_regionals=True).status_code, 201)
        row = next(r for r in self.rows(2027) if r["agency"]["id"] == 1 and r["goal"]["product_id"] == 1)
        for month in range(12):
            self.assertAlmostEqual(sum(p["months"][month]["amount"] for p in row["portfolios"]), row["goal"]["months"][month]["amount"], places=3)
            self.assertTrue(all(p["months"][month]["amount"] == 0 for p in row["portfolios"] if p["segment_id"] == 1))
        entry = next(e for e in self.client.get("/api/audit?limit=200").json()["entries"] if "Metas de 2027 criadas" in e["detail"])
        self.assertIn("reaproveitando produtos de metas, regionais, segmentos", entry["detail"])

    def test_reuse_flags_do_nothing_without_a_source_year(self):
        result = self.client.post("/api/years", json={"year": 2027, "reuse_products": True, "reuse_regionals": True, "reuse_segments": True})
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(len(self.rows(2027)), len(self.rows(2026)))

if __name__ == "__main__":
    unittest.main()
