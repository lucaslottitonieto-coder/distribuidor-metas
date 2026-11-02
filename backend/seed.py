import json
from pathlib import Path
from .domain import AMOUNT_SCALE, apportion, numeric
from .database import audit, default_regional, snapshot_goal


def create_goal(conn, agency_id, product_id, year, amounts=None, source_annual=None, missing=None, initial_bps=None):
    method = 'imported' if source_annual is not None else 'copied' if amounts is not None else 'unconfigured'
    goal_id = conn.execute("INSERT INTO goals(agency_id,product_id,year,source_annual,missing_months,planning_method) VALUES(?,?,?,?,?,?)", (agency_id, product_id, year, source_annual, json.dumps(missing or []), method)).lastrowid
    portfolios = conn.execute("SELECT id,suggested_bps FROM portfolios WHERE agency_id=? AND active=1 ORDER BY id", (agency_id,)).fetchall()
    weights = initial_bps or apportion(10000, [p["suggested_bps"] for p in portfolios])
    if portfolios and sum(weights) == 0:
        weights = apportion(10000, [1] * len(portfolios))
    for month in range(1, 13):
        amount = (amounts or [0]*12)[month-1]
        conn.execute("INSERT INTO months(goal_id,month,amount) VALUES(?,?,?)", (goal_id, month, amount))
        for p, bps, part in zip(portfolios, weights, apportion(amount, weights)):
            conn.execute("INSERT INTO allocations VALUES(?,?,?,?,?)", (goal_id, month, p["id"], bps, part))
    snapshot_goal(conn, goal_id, "create", "Meta criada.")
    return goal_id


def seed(conn):
    conn.executemany("INSERT INTO segments(code,name,color) VALUES(?,?,?)", [("AG", "Agronegócio", "#27c200"), ("PF", "Pessoa física", "#f7c500"), ("PJ", "Pessoa jurídica", "#006c2d")])
    conn.executemany("INSERT INTO products(name,unit,sub_product) VALUES(?,?,?)", [("Crédito", "BRL", "Crédito e financiamento"), ("Associados Ativos", "UN", "Relacionamento"), ("Investimentos", "BRL", "Investimentos"), ("Seguros", "BRL", "Proteção")])
    defaults = [("Agro", 1, 1500), ("Pessoa física I", 2, 1800), ("Pessoa jurídica I", 3, 2200), ("Pessoa física II", 2, 2000), ("Pessoa jurídica II", 3, 2500)]
    conn.executemany("INSERT INTO templates(name,segment_id,suggested_bps) VALUES(?,?,?)", defaults)
    path = Path(__file__).parent / "source_data.json"
    source = json.loads(path.read_text(encoding="utf-8"))
    # A planilha de origem não informa regional: as agências começam na padrão até serem classificadas.
    regional_id = default_regional(conn)
    for agency in source["agencies"]:
        agency_id = conn.execute("INSERT INTO agencies(code,name,city,state,regional_id) VALUES(:code,:name,:city,:state,:regional_id)", {**agency, "regional_id": regional_id}).lastrowid
        reference = [p for p in source["portfolios"] if p["agency_code"] == agency["code"]]
        for i, (name, segment, suggested) in enumerate(defaults):
            code = reference[i]["code"] if reference else str(i+2)
            conn.execute("INSERT INTO portfolios(agency_id,code,name,segment_id,suggested_bps) VALUES(?,?,?,?,?)", (agency_id, code, name, segment, suggested))
        for goal in [g for g in source["goals"] if g["agency_code"] == agency["code"]]:
            product = conn.execute("SELECT * FROM products WHERE name=?", (goal["product"],)).fetchone()
            scale = 1 if product["unit"] == "UN" else 100
            # A origem usa frações para associados; preservamos totais por maiores restos.
            raw = [v or 0 for v in goal["months"]]
            if scale == 1:
                amounts = apportion(round(sum(raw)), [round(v*100) for v in raw])
            else:
                amounts = [numeric(v) for v in raw]
            shares = [numeric(p["percent"]) for p in reference] if reference and goal["product"] == "Crédito" else None
            # Os valores acima estão em centavos/unidades; o banco guarda milésimos.
            factor = AMOUNT_SCALE // scale
            create_goal(conn, agency_id, product["id"], int(goal["year"]), [a * factor for a in amounts], round(goal["source_annual"]*scale) * factor, [i+1 for i,v in enumerate(goal["months"]) if v is None], shares)
    conn.execute("INSERT INTO metadata VALUES('import_report',?)", (json.dumps({"source": source["source"], "warnings": source["warnings"], "agencies": len(source["agencies"]), "goals": len(source["goals"]), "portfolios": len(source["portfolios"])}, ensure_ascii=False),))
    audit(conn, "import", "workbook", None, "Referência importada: 2 agências, 4 produtos e carteiras. Abril sinalizado para revisão.")
