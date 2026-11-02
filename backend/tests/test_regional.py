import csv
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

from unlocked_client import UnlockedClient
from openpyxl import load_workbook

from backend import database as db
from backend.main import app


class RegionalTests(unittest.TestCase):
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

    def agencies(self):
        return {a["id"]: a for a in self.client.get("/api/bootstrap").json()["agencies"]}

    def regional(self, name="Regional Sudoeste", **extra):
        r = self.client.post("/api/regionals", json={"name": name, **extra})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def body(self, agency, **changes):
        keys = ("code", "name", "regional_id", "city", "state", "manager")
        return {**{k: agency[k] for k in keys}, "active": bool(agency["active"]), **changes}

    def move(self, agency_id, regional_id):
        r = self.client.put(f"/api/agencies/{agency_id}", json=self.body(self.agencies()[agency_id], regional_id=regional_id))
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def split(self):
        """Agência 2 (073702) vai para uma regional própria; a 1 (073707) fica em "Sem regional"."""
        regional = self.regional()
        self.move(2, regional["id"])
        return regional

    def export(self, query=""):
        r = self.client.get(f"/api/export?year=2026{query}")
        self.assertEqual(r.status_code, 200)
        return list(csv.reader(io.StringIO(r.content.decode("utf-8-sig")), delimiter=";"))

    def test_existing_agencies_start_in_the_default_regional(self):
        boot = self.client.get("/api/bootstrap").json()
        self.assertEqual([(r["name"], r["active"]) for r in boot["regionals"]], [("Sem regional", 1)])
        self.assertTrue(all(a["regional_id"] == boot["regionals"][0]["id"] and a["regional_name"] == "Sem regional" for a in boot["agencies"]))

    def test_regional_name_is_unique_ignoring_case_and_validated(self):
        self.regional("Regional Sudoeste")
        self.assertEqual(self.client.post("/api/regionals", json={"name": "regional sudoeste"}).status_code, 409)
        self.assertEqual(self.client.post("/api/regionals", json={"name": "A"}).status_code, 422)
        other = self.regional("Regional Oeste")
        self.assertEqual(self.client.put(f"/api/regionals/{other['id']}", json={"name": "REGIONAL SUDOESTE"}).status_code, 409)
        renamed = self.client.put(f"/api/regionals/{other['id']}", json={"name": "Regional Litoral", "active": True})
        self.assertEqual(renamed.json()["name"], "Regional Litoral")
        self.assertEqual(self.client.put("/api/regionals/999", json={"name": "Inexistente"}).status_code, 404)

    def test_agency_requires_an_existing_active_regional(self):
        base = self.agencies()[1]
        payload = {"code": "9999", "name": "Agência nova", "city": "Curitiba", "state": "PR"}
        self.assertEqual(self.client.post("/api/agencies", json=payload).status_code, 422)
        self.assertEqual(self.client.post("/api/agencies", json={**payload, "regional_id": 999}).status_code, 422)
        inactive = self.regional("Regional Antiga", active=False)
        self.assertEqual(self.client.post("/api/agencies", json={**payload, "regional_id": inactive["id"]}).status_code, 422)
        self.assertEqual(self.client.put("/api/agencies/1", json=self.body(base, regional_id=inactive["id"])).status_code, 422)
        self.assertEqual(self.client.put("/api/agencies/1", json={k: v for k, v in self.body(base).items() if k != "regional_id"}).status_code, 422)
        created = self.client.post("/api/agencies", json={**payload, "regional_id": 1})
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["agency"]["regional_name"], "Sem regional")

    def test_moving_an_agency_is_audited_and_changes_its_regional(self):
        regional = self.regional()
        moved = self.move(2, regional["id"])
        self.assertEqual((moved["regional_id"], moved["regional_name"]), (regional["id"], "Regional Sudoeste"))
        entry = self.client.get("/api/audit?agency_id=2").json()["entries"][0]
        self.assertIn("Regional: Sem regional → Regional Sudoeste", entry["detail"])

    def test_regional_with_active_agencies_cannot_be_deactivated(self):
        regional = self.split()
        blocked = self.client.put(f"/api/regionals/{regional['id']}", json={"name": regional["name"], "active": False})
        self.assertEqual(blocked.status_code, 422)
        self.move(2, 1)
        self.assertEqual(self.client.put(f"/api/regionals/{regional['id']}", json={"name": regional["name"], "active": False}).status_code, 200)

    def test_inactive_agency_keeps_its_inactive_regional_on_edit(self):
        regional = self.split()
        agency = self.agencies()[2]
        self.assertEqual(self.client.put("/api/agencies/2", json=self.body(agency, active=False)).status_code, 200)
        self.assertEqual(self.client.put(f"/api/regionals/{regional['id']}", json={"name": regional["name"], "active": False}).status_code, 200)
        again = self.client.put("/api/agencies/2", json=self.body(self.agencies()[2], manager="Ana"))
        self.assertEqual(again.status_code, 200, again.text)

    def test_agencies_are_listed_by_regional_then_code(self):
        regional = self.regional("Regional Antiga")
        # 073702 passa para "Regional Antiga", que vem antes de "Sem regional" na ordem alfabética.
        self.move(2, regional["id"])
        listed = self.client.get("/api/bootstrap").json()["agencies"]
        self.assertEqual([(a["regional_name"], a["code"]) for a in listed], [("Regional Antiga", "073702"), ("Sem regional", "073707")])
        rows = self.client.get("/api/goals?year=2026").json()["rows"]
        self.assertEqual([r["agency"]["code"] for r in rows][::4], ["073702", "073707"])

    def test_dashboard_filters_by_regional(self):
        regional = self.split()
        everyone = self.client.get("/api/dashboard?year=2026").json()
        only = self.client.get(f"/api/dashboard?year=2026&regional_id={regional['id']}").json()
        self.assertEqual({a["code"] for a in everyone["agencies"]}, {"073702", "073707"})
        self.assertEqual([(a["code"], a["regional_name"]) for a in only["agencies"]], [("073702", "Regional Sudoeste")])
        self.assertEqual(only["total_goals"], everyone["total_goals"] // 2)
        self.assertEqual(self.client.get("/api/dashboard?year=2026&regional_id=1&agency_id=2").json()["agencies"], [])

    def test_goals_matrix_portfolios_and_audit_filter_by_regional(self):
        regional = self.split()
        rid = regional["id"]
        matrix = self.client.get(f"/api/goals?year=2026&regional_id={rid}").json()["rows"]
        self.assertTrue(matrix and all(r["agency"]["regional_id"] == rid and r["agency"]["regional_name"] == "Regional Sudoeste" for r in matrix))
        self.assertEqual(self.client.get("/api/goals?year=2026&regional_id=999").json()["rows"], [])
        portfolios = self.client.get(f"/api/portfolios?regional_id={rid}").json()
        self.assertTrue(portfolios and all(p["agency_code"] == "073702" and p["regional_name"] == "Regional Sudoeste" for p in portfolios))
        scoped = self.client.get(f"/api/audit?regional_id={rid}").json()
        self.assertTrue(scoped["entries"] and all(e["agency_id"] == 2 for e in scoped["entries"]))
        self.assertLess(scoped["total"], self.client.get("/api/audit").json()["total"])

    def test_export_has_regional_column_and_filters_by_regional(self):
        regional = self.split()
        everyone = self.export()
        self.assertEqual(everyone[0][1:4], ["Regional", "Agência", "Código agência"])
        self.assertEqual({row[1] for row in everyone[1:]}, {"Regional Sudoeste", "Sem regional"})
        only = self.export(f"&regional_id={regional['id']}")
        self.assertTrue(len(only) > 1 and all(row[1] == "Regional Sudoeste" and row[3] == "073702" for row in only[1:]))
        # A ordem do arquivo é regional e, dentro dela, código da agência.
        self.assertEqual([row[1] for row in everyone[1:]], sorted(row[1] for row in everyone[1:]))

    def test_excel_template_lists_the_regional_and_import_shows_it(self):
        self.split()
        template = self.client.get("/api/annual-goals/template?year=2026")
        sheet = load_workbook(io.BytesIO(template.content)).active
        rows = list(sheet.values)
        self.assertEqual(rows[0][:2], ("Regional", "Agência"))
        self.assertEqual({(r[0], str(r[1])) for r in rows[1:]}, {("Regional Sudoeste", "073702"), ("Sem regional", "073707")})
        sheet.cell(row=2, column=6, value=1000)
        stream = io.BytesIO()
        sheet.parent.save(stream)
        preview = self.client.post("/api/annual-goals/preview?year=2026", files={"file": ("m.xlsx", stream.getvalue())}).json()
        self.assertEqual(preview["errors"], [])
        self.assertEqual([(e["agency_code"], e["regional_name"]) for e in preview["entries"]], [("073702", "Regional Sudoeste")])

    def test_legacy_database_moves_agencies_to_the_default_regional_once(self):
        goals = self.client.get("/api/goals?year=2026").json()
        raw = sqlite3.connect(db.DB_PATH)
        raw.execute("PRAGMA foreign_keys=OFF")
        raw.execute("CREATE TABLE agencies_old(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, manager TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1)")
        raw.execute("INSERT INTO agencies_old SELECT id,code,name,city,state,manager,active FROM agencies")
        raw.execute("DROP TABLE agencies")
        raw.execute("ALTER TABLE agencies_old RENAME TO agencies")
        raw.execute("DROP TABLE regionals")
        raw.commit()
        raw.close()
        backups = lambda: list((db.DB_PATH.parent / "backups").glob("metas-before-regional-*.db"))
        db.initialize()
        boot = self.client.get("/api/bootstrap").json()
        self.assertEqual([r["name"] for r in boot["regionals"]], ["Sem regional"])
        self.assertTrue(all(a["regional_name"] == "Sem regional" for a in boot["agencies"]) and len(boot["agencies"]) == 2)
        self.assertEqual(self.client.get("/api/goals?year=2026").json(), goals)
        self.assertEqual(len(backups()), 1)
        self.assertEqual(self.client.get("/api/audit").json()["entries"][0]["entity"], "regional")
        db.initialize()
        self.assertEqual(len(backups()), 1)
        self.assertEqual(len(self.client.get("/api/bootstrap").json()["regionals"]), 1)


if __name__ == "__main__":
    unittest.main()
