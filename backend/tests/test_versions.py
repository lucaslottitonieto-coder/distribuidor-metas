import tempfile
import unittest
from pathlib import Path

from unlocked_client import UnlockedClient
from backend import database as db
from backend.main import app


class VersionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "versions.db"
        db.initialize()
        self.client = UnlockedClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def goal(self, agency=1, product=1):
        return next(g for g in self.client.get(f"/api/agencies/{agency}/goals?year=2026").json()["goals"] if g["product_id"] == product)

    def edit_month(self, goal, month, amount, **kwargs):
        return self.client.put(f"/api/goals/{goal['id']}/months/{month}", json={"revision": goal["revision"], "amount": amount}, **kwargs)

    def test_every_goal_starts_with_a_baseline_version(self):
        versions = self.client.get("/api/versions?year=2026&limit=200").json()
        goals = self.client.get("/api/dashboard?year=2026").json()["total_goals"]
        self.assertEqual(versions["total"], goals)
        self.assertTrue(all(v["version"] == 1 and v["changes"] == [] for v in versions["entries"]))

    def test_month_edit_records_who_when_and_before_after(self):
        goal = self.goal()
        before = goal["months"][0]["amount"]
        r = self.edit_month(goal, 1, before - 10, headers={"X-User-Email": "ana@sicredi.com.br"})
        self.assertEqual(r.status_code, 200, r.text)
        latest = self.client.get(f"/api/versions?year=2026&agency_id=1&product_id=1").json()["entries"][0]
        self.assertEqual(latest["version"], 2)
        self.assertEqual(latest["actor"], "ana@sicredi.com.br")
        self.assertIn("T", latest["timestamp"])
        self.assertEqual(latest["agency"]["id"], 1)
        month = next(c for c in latest["changes"] if c["kind"] == "month")
        self.assertEqual((month["label"], month["before"], month["after"]), ("Janeiro", before, before - 10))

    def test_actor_is_empty_without_the_portal_header_and_versions_are_never_overwritten(self):
        goal = self.goal()
        self.assertEqual(self.edit_month(goal, 2, goal["months"][1]["amount"] - 1).status_code, 200)
        goal = self.goal()
        self.assertEqual(self.edit_month(goal, 2, goal["months"][1]["amount"] - 1, headers={"X-Forwarded-Email": "bia@sicredi.com.br"}).status_code, 200)
        entries = self.client.get("/api/versions?year=2026&agency_id=1&product_id=1").json()["entries"]
        self.assertEqual([e["version"] for e in entries], [3, 2, 1])
        self.assertEqual([e["actor"] for e in entries], ["bia@sicredi.com.br", None, None])

    def test_filters_and_pagination(self):
        goal = self.goal(agency=1, product=1)
        self.edit_month(goal, 1, goal["months"][0]["amount"] - 5)
        only = self.client.get("/api/versions?year=2026&agency_id=1&product_id=1").json()
        self.assertEqual({e["goal_id"] for e in only["entries"]}, {goal["id"]})
        page = self.client.get("/api/versions?year=2026&limit=1&offset=1").json()
        self.assertEqual(len(page["entries"]), 1)
        self.assertGreater(page["total"], 1)
        self.assertEqual(self.client.get("/api/versions?year=2019").status_code, 422)


    def brasilia_today(self):
        from datetime import datetime, timedelta, timezone
        return (datetime.now(timezone.utc) - timedelta(hours=3)).date()

    def make_history(self):
        goal = self.goal()
        self.edit_month(goal, 1, goal["months"][0]["amount"] - 10, headers={"X-User-Email": "ana@sicredi.com.br"})
        goal = self.goal()
        total = goal["annual_amount"] + 1000
        unlocked = self.client.post("/api/annual-goals", json={"year": 2026, "method": "annual", "product_id": 1, "unlock_reason": "Revisão aprovada pela diretoria",
                                    "entries": [{"goal_id": goal["id"], "revision": goal["revision"], "annual_amount": total}]}, headers={"X-User-Email": "bia@sicredi.com.br"})
        self.assertEqual(unlocked.status_code, 200, unlocked.text)

    def test_period_author_action_and_kind_filters_with_counts_and_facets(self):
        self.make_history()
        everything = self.client.get("/api/versions?year=2026&agency_id=1&product_id=1").json()
        self.assertEqual(everything["counts"]["all"], everything["total"])
        self.assertEqual(everything["counts"]["unlock"], 1)
        self.assertIn("ana@sicredi.com.br", everything["actors"])
        self.assertIn("update", everything["actions"])
        self.assertIn(None, everything["actors"])
        unlock = self.client.get("/api/versions?year=2026&agency_id=1&product_id=1&kind=unlock").json()
        self.assertEqual(unlock["total"], 1)
        self.assertIn("Motivo: Revisão aprovada pela diretoria", unlock["entries"][0]["detail"])
        self.assertEqual(unlock["entries"][0]["actor"], "bia@sicredi.com.br")
        self.assertEqual(unlock["counts"]["all"], everything["total"])
        by_author = self.client.get("/api/versions?year=2026&agency_id=1&product_id=1&actor=ana@sicredi.com.br").json()
        self.assertEqual([e["actor"] for e in by_author["entries"]], ["ana@sicredi.com.br"])
        self.assertEqual(self.client.get("/api/versions?year=2026&agency_id=1&product_id=1&actor=__sem_autor__").json()["total"], 1)
        self.assertEqual(self.client.get("/api/versions?year=2026&agency_id=1&product_id=1&action=create").json()["total"], 1)
        self.assertEqual(self.client.get("/api/versions?year=2026&agency_id=1&product_id=1&kind=import").json()["total"], 0)

    def test_dates_use_the_brasilia_day_and_regional_scopes_the_list(self):
        self.make_history()
        from datetime import timedelta
        today = self.brasilia_today()
        tomorrow, yesterday = today + timedelta(days=1), today - timedelta(days=1)
        url = "/api/versions?year=2026&agency_id=1&product_id=1"
        self.assertEqual(self.client.get(f"{url}&date_from={today}&date_to={today}").json()["total"], 3)
        self.assertEqual(self.client.get(f"{url}&date_from={tomorrow}").json()["total"], 0)
        self.assertEqual(self.client.get(f"{url}&date_to={yesterday}").json()["total"], 0)
        self.assertEqual(self.client.get(f"{url}&date_from=ontem").status_code, 422)
        agency = self.client.get("/api/bootstrap").json()["agencies"][0]
        self.assertGreater(self.client.get(f"/api/versions?year=2026&regional_id={agency['regional_id']}").json()["total"], 0)
        self.assertEqual(self.client.get("/api/versions?year=2026&regional_id=9999").json()["total"], 0)

    def test_version_history_returns_full_snapshots_newest_first(self):
        self.make_history()
        goal = self.goal()
        history = self.client.get(f"/api/goals/{goal['id']}/versions").json()
        self.assertEqual([v["version"] for v in history["versions"]], [3, 2, 1])
        latest, baseline = history["versions"][0], history["versions"][-1]
        self.assertEqual(len(latest["months"]), 12)
        self.assertEqual(history["goal"]["agency"]["id"], 1)
        self.assertEqual(history["goal"]["product"]["id"], 1)
        self.assertEqual(latest["annual_amount"], baseline["annual_amount"] + 1000)
        self.assertEqual(baseline["months"][0], latest["months"][0] + 10 if latest["action"] != "update" else baseline["months"][0])
        self.assertTrue(baseline["portfolios"] and all(len(p["amounts"]) == 12 for p in baseline["portfolios"]))
        self.assertEqual(self.client.get("/api/goals/99999/versions").status_code, 404)


if __name__ == "__main__":
    unittest.main()
