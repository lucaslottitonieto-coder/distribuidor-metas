import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from backend import database as db
from backend.main import app


class AnnualLockTests(unittest.TestCase):
    """O total anual informado é travado: só muda com motivo, tudo fica no histórico e meses fechados não mudam."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "lock.db"
        db.initialize()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def goal(self, id=1):
        return next(r["goal"] for r in self.client.get("/api/goals?year=2026").json()["rows"] if r["goal"]["id"] == id)

    def post(self, method, amount, id=1, **extra):
        goal = self.goal(id)
        return self.client.post("/api/annual-goals", json={"year": 2026, "method": method, "product_id": goal["product_id"], **extra,
                                "entries": [{"goal_id": id, "revision": goal["revision"], "annual_amount": amount}]})

    def last_audit(self):
        with db.connect() as conn:
            return dict(conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 1").fetchone())

    def close_month(self, month=1):
        revision = self.client.get("/api/closures?year=2026").json()["months"][month - 1]["revision"]
        result = self.client.put(f"/api/closures/2026/{month}", json={"revision": revision, "closed": True, "actor": "Lucas Teste",
                                 "reason": "Conferência do período concluída", "confirmation": "FECHAR"})
        self.assertEqual(result.status_code, 200, result.text)

    def test_changing_a_locked_total_needs_a_reason_and_writes_nothing_without_it(self):
        before = self.goal()
        self.assertGreater(before["annual_amount"], 0)
        for method in ("annual", "equal"):
            for reason in ({}, {"unlock_reason": ""}, {"unlock_reason": "  ok "}):
                result = self.post(method, before["annual_amount"] + 100, **reason)
                self.assertEqual(result.status_code, 409, result.text)
                self.assertIn("travado", result.json()["detail"])
        self.assertEqual(self.goal(), before)
        with db.connect() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM audit WHERE detail LIKE '%destravado%'").fetchone()[0], 0)

    def test_unlocking_with_a_reason_changes_the_total_and_logs_before_after_reason_and_author(self):
        before = self.goal()
        new_total = before["annual_amount"] + 100
        for method in ("annual", "equal"):
            result = self.post(method, new_total, unlock_reason="Revisão aprovada pela diretoria")
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(self.goal()["annual_amount"], new_total)
            entry = self.last_audit()
            self.assertIn("Total anual destravado", entry["detail"])
            self.assertIn("Motivo: Revisão aprovada pela diretoria", entry["detail"])
            self.assertEqual(json.loads(entry["after_json"])["unlock_reason"], "Revisão aprovada pela diretoria")
            with db.connect() as conn:
                version = conn.execute("SELECT * FROM goal_versions WHERE goal_id=1 ORDER BY version DESC LIMIT 1").fetchone()
            self.assertIn("Motivo: Revisão aprovada pela diretoria", version["detail"])
            new_total += 100

    def test_log_shows_both_totals_in_plain_numbers(self):
        before = self.goal()
        self.assertEqual(self.post("equal", before["annual_amount"] + 5, unlock_reason="Ajuste de meta do ano").status_code, 200)
        detail = self.last_audit()["detail"]
        self.assertIn(f"{before['annual_amount']:.0f} → {before['annual_amount'] + 5:.0f}", detail)

    def test_same_total_needs_no_reason_so_redistributing_is_free(self):
        before = self.goal()
        self.assertEqual(self.post("equal", before["annual_amount"]).status_code, 200)
        self.assertEqual(self.goal()["annual_amount"], before["annual_amount"])
        self.assertNotIn("destravado", self.last_audit()["detail"])

    def test_goal_without_a_total_can_receive_one_without_reason_and_is_then_locked(self):
        with db.connect() as conn:
            conn.execute("UPDATE goals SET annual_target=NULL WHERE id=1")
            conn.execute("UPDATE months SET amount=0 WHERE goal_id=1")
            conn.execute("UPDATE allocations SET amount=0 WHERE goal_id=1")
        self.assertEqual(self.goal()["annual_amount"], 0)
        self.assertEqual(self.post("annual", 1200).status_code, 200)
        self.assertEqual(self.goal()["annual_amount"], 1200)
        self.assertEqual(self.post("annual", 1300).status_code, 409)
        self.assertEqual(self.goal()["annual_amount"], 1200)

    def test_put_goal_cannot_change_a_locked_total_without_reason(self):
        goal = self.goal()
        body = {"revision": goal["revision"], "mode": "seasonal", "annual_amount": goal["annual_amount"] + 1, "weights": [8.34] * 4 + [8.33] * 8}
        self.assertEqual(self.client.put("/api/goals/1", json=body).status_code, 409)
        self.assertEqual(self.goal(), goal)
        self.assertEqual(self.client.put("/api/goals/1", json={**body, "unlock_reason": "Correção do total anual"}).status_code, 200)
        self.assertEqual(self.goal()["annual_amount"], goal["annual_amount"] + 1)

    def test_changing_the_total_never_touches_closed_months(self):
        self.close_month(1)
        before = self.goal()
        jan = before["months"][0]["amount"]
        with db.connect() as conn:
            frozen = [dict(r) for r in conn.execute("SELECT * FROM allocations WHERE goal_id=1 AND month=1 ORDER BY portfolio_id")]
        for method in ("equal", "annual"):
            total = before["annual_amount"] + 1200
            result = self.post(method, total, unlock_reason="Revisão aprovada pela diretoria")
            self.assertEqual(result.status_code, 200, result.text)
            goal = self.goal()
            self.assertEqual(goal["annual_amount"], total)
            self.assertEqual(goal["months"][0]["amount"], jan)
            with db.connect() as conn:
                self.assertEqual([dict(r) for r in conn.execute("SELECT * FROM allocations WHERE goal_id=1 AND month=1 ORDER BY portfolio_id")], frozen)
            if method == "equal":
                self.assertAlmostEqual(sum(m["amount"] for m in goal["months"]), total, places=2)
            self.assertIn("Meses fechados preservados" if method == "annual" else "meses fechados preservados", self.last_audit()["detail"])
            before = goal

    def test_excel_import_flags_locked_changes_and_needs_a_reason_to_apply_them(self):
        import io
        from openpyxl import Workbook
        row = next(r for r in self.client.get("/api/goals?year=2026").json()["rows"] if r["goal"]["id"] == 1)
        total = row["goal"]["annual_amount"]

        def preview(amount):
            sheet = Workbook()
            sheet.active.append(["Agência", "Produto", "Subproduto", "Ano", "Total anual"])
            sheet.active.append([row["agency"]["code"], row["goal"]["product_name"], row["goal"]["sub_product"], 2026, amount])
            stream = io.BytesIO()
            sheet.save(stream)
            result = self.client.post("/api/annual-goals/preview?year=2026", files={"file": ("metas.xlsx", stream.getvalue())})
            self.assertEqual(result.status_code, 200, result.text)
            return result.json()

        same, changed = preview(total), preview(total + 100)
        self.assertEqual((same["errors"], changed["errors"]), ([], []))
        self.assertFalse(same["entries"][0]["locked_change"])
        self.assertTrue(changed["entries"][0]["locked_change"])
        entries = [{k: e[k] for k in ("goal_id", "revision", "annual_amount", "agency_id", "product_id", "months")} for e in changed["entries"]]
        body = {"year": 2026, "method": "annual", "source": "excel", "entries": entries}
        before = self.goal()
        self.assertEqual(self.client.post("/api/annual-goals", json=body).status_code, 409)
        self.assertEqual(self.goal(), before)
        self.assertEqual(self.client.post("/api/annual-goals", json={**body, "unlock_reason": "Planilha oficial revisada"}).status_code, 200)
        self.assertEqual(self.goal()["annual_amount"], total + 100)
        self.assertIn("Motivo: Planilha oficial revisada", self.last_audit()["detail"])

    def test_total_below_the_closed_months_is_rejected_even_with_a_reason(self):
        self.close_month(1)
        before = self.goal()
        result = self.post("annual", before["months"][0]["amount"] / 2, unlock_reason="Revisão aprovada pela diretoria")
        self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual(self.goal(), before)


if __name__ == "__main__":
    unittest.main()
