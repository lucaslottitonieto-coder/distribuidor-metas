import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from backend import database as db
from backend.main import app

MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


class ImportCheckTests(unittest.TestCase):
    """A importação confere mês a mês, trava mês fechado e arquivo exportado antes de uma mudança mais nova."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = db.DB_PATH
        db.DB_PATH = Path(self.temp.name) / "check.db"
        db.initialize()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        db.DB_PATH = self.original
        self.temp.cleanup()

    def row(self):
        return next(r for r in self.client.get("/api/goals?year=2026").json()["rows"] if r["goal"]["id"] == 1)

    def csv(self, months, total=None, revision="same"):
        row = self.row()
        goal = row["goal"]
        pt = lambda v: f"{v:.2f}".replace(".", ",")
        total = goal["annual_amount"] if total is None else total
        revision = goal["revision"] if revision == "same" else revision
        header = "Agência;Produto;Subproduto;Distribuição;Total do ano;" + ";".join(MONTHS) + (";Versão da meta" if revision is not None else "")
        line = f'"{row["agency"]["code"]} {row["agency"]["name"]}";"{goal["product_name"]}";"{goal["sub_product"]}";"Planilha";"{pt(total)}";' + ";".join(f'"{pt(m)}"' for m in months) + (f';"{revision}"' if revision is not None else "")
        return ("﻿" + header + "\r\n" + line).encode("utf-8")

    def preview(self, content):
        result = self.client.post("/api/annual-goals/preview?year=2026", files={"file": ("metas.csv", content, "text/csv")})
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def months(self):
        return [m["amount"] for m in self.row()["goal"]["months"]]

    def save(self, preview, **extra):
        entries = [{k: e[k] for k in ("goal_id", "revision", "annual_amount", "agency_id", "product_id", "months")} for e in preview["entries"]]
        return self.client.post("/api/annual-goals", json={"year": 2026, "method": "annual", "source": "excel", "entries": entries, **extra})

    def last_audit(self):
        with db.connect() as conn:
            return dict(conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 1").fetchone())

    def close_month(self, month):
        revision = self.client.get("/api/closures?year=2026").json()["months"][month - 1]["revision"]
        result = self.client.put(f"/api/closures/2026/{month}", json={"revision": revision, "closed": True, "actor": "Teste",
                                 "reason": "Conferência concluída", "confirmation": "FECHAR"})
        self.assertEqual(result.status_code, 200, result.text)

    def test_preview_lists_each_changed_month_with_system_and_file_values(self):
        months = self.months()
        edited = [months[0] - 100000, months[1] + 0, *months[2:]]
        preview = self.preview(self.csv(edited))
        self.assertEqual(preview["errors"], [])
        entry = preview["entries"][0]
        self.assertEqual(entry["changed_months"], [1])
        self.assertEqual(entry["month_changes"], [{"month": 1, "before": months[0], "after": months[0] - 100000}])
        self.assertEqual(self.preview(self.csv(months))["entries"][0]["month_changes"], [])

    def test_import_logs_every_changed_month_with_before_and_after(self):
        months = self.months()
        edited = [months[0] - 100000, months[1] - 5000, *months[2:]]
        self.assertEqual(self.save(self.preview(self.csv(edited))).status_code, 200)
        detail = self.last_audit()["detail"]
        self.assertIn(f"Importação alterou: Janeiro {months[0]:.0f} → {months[0] - 100000:.0f}", detail)
        self.assertIn(f"Fevereiro {months[1]:.0f} → {months[1] - 5000:.0f}", detail)
        self.assertNotIn("Março", detail)

    def test_closed_month_changed_by_the_file_is_an_error_in_the_preview(self):
        self.close_month(1)
        months = self.months()
        preview = self.preview(self.csv([months[0] - 50000, *months[1:]]))
        self.assertEqual(len(preview["errors"]), 1)
        self.assertIn("Janeiro", preview["errors"][0])
        self.assertIn("fechado", preview["errors"][0])
        self.assertEqual(self.preview(self.csv([months[0], months[1] - 50000, *months[2:]]))["errors"], [])

    def test_file_exported_before_a_newer_change_is_blocked_only_when_it_would_change_something(self):
        months = self.months()
        exported_revision = self.row()["goal"]["revision"]
        goal_id = self.row()["goal"]["id"]
        month = self.client.put(f"/api/goals/{goal_id}/months/2", json={"revision": exported_revision, "amount": months[1] - 1000})
        self.assertEqual(month.status_code, 200, month.text)
        self.assertGreater(self.row()["goal"]["revision"], exported_revision)
        stale = self.preview(self.csv([months[0] - 100000, *months[1:]], revision=exported_revision))
        self.assertEqual(len(stale["errors"]), 1)
        self.assertIn("mudou no sistema depois que este arquivo foi exportado", stale["errors"][0])
        current = self.months()
        self.assertEqual(self.preview(self.csv(current, revision=exported_revision))["errors"], [])
        self.assertEqual(self.preview(self.csv([months[0] - 100000, *months[1:]], revision=self.row()["goal"]["revision"]))["errors"], [])
        self.assertEqual(self.preview(self.csv([months[0] - 100000, *months[1:]], revision=None))["errors"], [])

    def test_non_numeric_version_asks_for_a_new_export(self):
        months = self.months()
        preview = self.client.post("/api/annual-goals/preview?year=2026", files={"file": ("metas.csv", self.csv([months[0] - 1, *months[1:]], revision="abc"), "text/csv")}).json()
        self.assertIn("Versão da meta", preview["errors"][0])


if __name__ == "__main__":
    unittest.main()
