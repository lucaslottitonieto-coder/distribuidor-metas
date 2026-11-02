import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from backend import database as db
from backend.main import app


class WholeMonthsTests(unittest.TestCase):
    """Dividir o total pelos meses nunca deixa centavos quebrados: reais (ou unidades) cheios, somando o total."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "whole.db"
        db.initialize()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def goal(self, id=1):
        return next(r["goal"] for r in self.client.get("/api/goals?year=2026").json()["rows"] if r["goal"]["id"] == id)

    def distribute(self, method, total, id=1, **extra):
        goal = self.goal(id)
        return self.client.post("/api/annual-goals", json={"year": 2026, "method": method, "product_id": goal["product_id"], "unlock_reason": "ajuste de teste", **extra,
                                "entries": [{"goal_id": id, "revision": goal["revision"], "annual_amount": total}]})

    def months(self, id=1):
        return [m["amount"] for m in self.goal(id)["months"]]

    def test_equal_division_of_a_total_that_does_not_divide_gives_whole_reais(self):
        self.assertEqual(self.distribute("equal", 8_000_000).status_code, 200)
        months = self.months()
        self.assertEqual(months, [666_667] * 8 + [666_666] * 4)
        self.assertEqual(sum(months), 8_000_000)

    def test_unit_goals_are_whole_units_too(self):
        self.assertEqual(self.distribute("equal", 1000, id=2).status_code, 200)
        months = self.months(2)
        self.assertEqual(sorted(set(months)), [83, 84])
        self.assertEqual(sum(months), 1000)

    def test_a_total_with_decimals_keeps_months_whole_and_the_rest_goes_to_the_last_month(self):
        self.assertEqual(self.distribute("equal", 150.6).status_code, 200)
        months = self.months()
        self.assertEqual(round(sum(months), 3), 150.6)
        self.assertTrue(all(float(m).is_integer() for m in months[:-1]))
        self.assertEqual(round(months[-1] % 1, 3), 0.6)

    def test_percent_and_seasonal_distributions_also_use_whole_reais(self):
        self.assertEqual(self.distribute("percent", 12_000_001, weights=[8.34] * 4 + [8.33] * 8).status_code, 200)
        months = self.months()
        self.assertTrue(all(float(m).is_integer() for m in months))
        self.assertEqual(sum(months), 12_000_001)

    def test_closed_months_keep_their_values_and_the_rest_stays_whole(self):
        revision = self.client.get("/api/closures?year=2026").json()["months"][0]["revision"]
        closed = self.client.put("/api/closures/2026/1", json={"revision": revision, "closed": True, "actor": "Teste", "reason": "Conferência concluída", "confirmation": "FECHAR"})
        self.assertEqual(closed.status_code, 200, closed.text)
        january = self.months()[0]
        total = 9_000_000
        self.assertEqual(self.distribute("equal", total).status_code, 200)
        months = self.months()
        self.assertEqual(months[0], january)
        self.assertEqual(round(sum(months), 3), total)
        self.assertTrue(all(float(m).is_integer() for m in months))
        self.assertLessEqual(max(months[1:]) - min(months[1:]), 1)

    def test_percentage_goals_keep_three_decimals(self):
        with db.connect() as conn:
            conn.execute("UPDATE products SET unit='PCT' WHERE id=4")
        self.assertEqual(self.distribute("equal", 5, id=4).status_code, 200)
        months = self.months(4)
        self.assertEqual(round(sum(months), 3), 5)
        self.assertEqual(sorted(set(months)), [0.416, 0.417])


    def entries(self, month, id=1):
        result = self.client.get(f"/api/goals/{id}/allocations?month={month}")
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()["entries"]

    def test_wallets_get_whole_reais_and_still_add_up_to_the_month(self):
        self.assertEqual(self.distribute("equal", 8_000_000).status_code, 200)
        for month, expected in ((1, 666_667), (12, 666_666)):
            amounts = [e["amount"] for e in self.entries(month)]
            self.assertTrue(all(float(a).is_integer() for a in amounts), amounts)
            self.assertEqual(sum(amounts), expected)

    def test_wallet_remainder_below_one_real_goes_to_the_largest_wallet(self):
        self.assertEqual(self.distribute("equal", 150.6).status_code, 200)
        entries = self.entries(12)
        amounts = [e["amount"] for e in entries]
        self.assertEqual(round(sum(amounts), 3), round(self.months()[-1], 3))
        fractional = [e for e in entries if not float(e["amount"]).is_integer()]
        self.assertEqual(len(fractional), 1)
        self.assertEqual(fractional[0]["percent"], max(e["percent"] for e in entries))

    def test_adjusting_a_single_month_and_saving_percentages_keep_wallets_whole(self):
        self.assertEqual(self.distribute("equal", 12_000_000).status_code, 200)
        goal = self.goal()
        adjusted = self.client.put("/api/goals/1/months/2", json={"revision": goal["revision"], "amount": 999_999})
        self.assertEqual(adjusted.status_code, 200, adjusted.text)
        amounts = [e["amount"] for e in self.entries(2)]
        self.assertTrue(all(float(a).is_integer() for a in amounts), amounts)
        self.assertEqual(sum(amounts), 999_999)
        entries = self.entries(3)
        body = {"revision": self.goal()["revision"], "month": 3, "mode": "percent", "apply_to_all": True,
                "entries": [{"portfolio_id": e["portfolio_id"], "value": v} for e, v in zip(entries, [10, 20, 30, 15, 25])]}
        self.assertEqual(len(body["entries"]), 5)
        saved = self.client.put("/api/goals/1/allocations", json=body)
        self.assertEqual(saved.status_code, 200, saved.text)
        for month in (3, 4, 12):
            parts = [e["amount"] for e in self.entries(month)]
            self.assertTrue(all(float(a).is_integer() for a in parts), parts)
            self.assertEqual(sum(parts), self.months()[month - 1])

    def test_percentage_goals_keep_decimals_in_wallets(self):
        with db.connect() as conn:
            conn.execute("UPDATE products SET unit='PCT' WHERE id=4")
        self.assertEqual(self.distribute("equal", 5, id=4).status_code, 200)
        amounts = [e["amount"] for e in self.entries(1, id=4)]
        self.assertEqual(round(sum(amounts), 3), self.months(4)[0])
        self.assertTrue(any(not float(a).is_integer() for a in amounts))


if __name__ == "__main__":
    unittest.main()
