from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import StringIO, BytesIO
from pathlib import Path
from typing import Literal
import csv
import json
import os
import sqlite3
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from . import database as db
from .domain import AMOUNT_SCALE, amount as to_amount, numeric, percentages, apportion, apportion_whole
from .seed import create_goal
from .closures import MONTHS, closed_months, require_open, protect_catalog, distribute_open, closure_for


@asynccontextmanager
async def lifespan(app):
    db.initialize()
    yield


# O portal autentica o usuário e repassa o e-mail em um destes cabeçalhos. A API só deve ficar acessível pelo portal,
# senão qualquer cliente poderia informar o cabeçalho. METAS_ACTOR_HEADER troca o nome do cabeçalho.
ACTOR_HEADERS = [h.strip().lower() for h in os.environ.get("METAS_ACTOR_HEADER", "x-user-email,x-forwarded-email,x-auth-request-email").split(",") if h.strip()]


async def capture_actor(request: Request):
    email = next((v.strip() for h in ACTOR_HEADERS if (v := request.headers.get(h))), "")
    db.current_actor.set(email[:200] or None)


app = FastAPI(dependencies=[Depends(capture_actor)], title="Distribuidor de Metas", version="1.0.0", lifespan=lifespan, description="API para agências, produtos e subprodutos, sazonalidade e distribuição de metas. O subproduto é o nível em que a meta é definida e distribuída nas carteiras. Valores monetários na API em reais; persistência em centavos. Percentuais de 0 a 100, com duas casas decimais.")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("METAS_ALLOWED_ORIGINS","http://127.0.0.1:5173,http://localhost:5173").split(","), allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"])


@app.exception_handler(sqlite3.IntegrityError)
async def integrity_error(request, exc):
    if str(exc).startswith("Período fechado:"):
        return JSONResponse(status_code=409, content={"detail": str(exc)})
    raise exc


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ClosureInput(Model):
    revision: int = Field(ge=0)
    closed: bool
    actor: str = Field(min_length=3, max_length=100)
    reason: str = Field(min_length=5, max_length=500)
    confirmation: str


@app.get("/api/closures")
def get_closures(year: int = Query(2026, ge=2020, le=2100), limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    with db.connect() as conn:
        key = str(year)
        return {"year": year, "months": [closure_for(conn, year, m) for m in range(1, 13)],
                "total": conn.execute("SELECT count(*) FROM audit WHERE entity='closure' AND entity_id=?", (key,)).fetchone()[0],
                "entries": [dict(r) for r in conn.execute("SELECT * FROM audit WHERE entity='closure' AND entity_id=? ORDER BY id DESC LIMIT ? OFFSET ?", (key, limit, offset))]}


@app.put("/api/closures/{year}/{month}")
def change_closure(year: int, month: int, body: ClosureInput):
    if not 2020 <= year <= 2100 or not 1 <= month <= 12:
        raise HTTPException(422, "Informe ano e mês válidos.")
    if body.confirmation != ("FECHAR" if body.closed else "REABRIR"):
        raise HTTPException(422, "Digite FECHAR ou REABRIR para confirmar a operação correspondente.")
    with db.connect() as conn:
        before = closure_for(conn, year, month)
        if before["revision"] != body.revision or bool(before["closed"]) == body.closed:
            raise HTTPException(409, "O fechamento mudou em outra sessão. Atualize antes de continuar.")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("INSERT INTO month_closures(year,month,closed,revision,closed_at,closed_by,updated_at,updated_by,reason) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(year,month) DO UPDATE SET closed=excluded.closed,revision=excluded.revision,closed_at=excluded.closed_at,closed_by=excluded.closed_by,updated_at=excluded.updated_at,updated_by=excluded.updated_by,reason=excluded.reason",
                     (year, month, int(body.closed), before["revision"] + 1, now if body.closed else before["closed_at"], body.actor if body.closed else before["closed_by"], now, body.actor, body.reason))
        after = closure_for(conn, year, month)
        db.audit(conn, "close" if body.closed else "reopen", "closure", year,
                 f"{MONTHS[month - 1]} de {year} {'fechado' if body.closed else 'reaberto'}. Motivo: {body.reason}", before=before, after=after, actor=body.actor)
        return after


class RegionalInput(Model):
    name: str = Field(min_length=2, max_length=100)
    active: bool = True


class AgencyInput(Model):
    code: str = Field(min_length=1, max_length=12, pattern=r"^[0-9A-Za-z-]+$")
    name: str = Field(min_length=2, max_length=100)
    regional_id: int = Field(ge=1)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(pattern=r"^[A-Z]{2}$")
    manager: str = Field(default="", max_length=100)
    year: int = Field(default=2026, ge=2020, le=2100)
    active: bool = True


class ProductInput(Model):
    # Cada registro é um subproduto de um produto: é ele que recebe meta, sazonalidade e distribuição.
    name: str = Field(min_length=2, max_length=100)
    sub_product: str = Field(min_length=2, max_length=100)
    unit: Literal["BRL", "UN", "PCT"] = "BRL"
    active: bool = True


class SegmentInput(Model):
    code: str = Field(min_length=1, max_length=10, pattern=r"^[A-Z0-9]+$")
    name: str = Field(min_length=2, max_length=100)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    active: bool = True


class PortfolioInput(Model):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    segment_id: int
    manager: str = Field(default="", max_length=100)
    suggested_percent: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    active: bool = True


class GoalInput(Model):
    revision: int
    mode: Literal["monthly", "seasonal", "percent", "equal"]
    amounts: list[float] = Field(default_factory=list)
    annual_amount: float = Field(default=0, allow_inf_nan=False)
    weights: list[float] = Field(default_factory=list)
    # Total anual já informado só muda com um motivo, que entra no histórico.
    unlock_reason: str = Field(default="", max_length=500)


class AllocationRow(Model):
    portfolio_id: int
    value: float = Field(allow_inf_nan=False)


class AllocationInput(Model):
    revision: int
    month: int = Field(ge=1, le=12)
    mode: Literal["percent", "amount"] = "percent"
    entries: list[AllocationRow]
    apply_to_all: bool = False


class SeasonalityInput(Model):
    revision: int = Field(ge=0)
    weights: list[float] = Field(min_length=12, max_length=12)


class SeasonalityTarget(Model):
    goal_id: int
    revision: int


class SeasonalityApplyInput(Model):
    revision: int = Field(ge=1)
    goals: list[SeasonalityTarget] = Field(min_length=1)


class SeasonalitySaveInput(SeasonalityInput):
    action: Literal["save", "apply"]
    confirmation: str
    goals: list[SeasonalityTarget] = Field(default_factory=list)


class MonthGoalInput(Model):
    revision: int
    amount: float = Field(allow_inf_nan=False)


class YearInput(Model):
    year: int = Field(ge=2020, le=2100)
    copy_from: int | None = Field(default=None, ge=2020, le=2100)


class YearStartInput(Model):
    """Inicia um ano para todas as agências: a estrutura vem do cadastro e os valores de meta começam zerados."""
    year: int = Field(ge=2020, le=2100)
    copy_from: int | None = Field(default=None, ge=2020, le=2100)
    keep_percentages: bool = True
    keep_seasonality: bool = True
    keep_values: bool = False
    # Marcado, repete o que o ano de origem tinha; desmarcado, parte do cadastro atual.
    reuse_products: bool = False
    reuse_regionals: bool = False
    reuse_segments: bool = False


class AnnualTarget(Model):
    goal_id: int | None = None
    agency_id: int | None = None
    product_id: int | None = None
    revision: int
    annual_amount: float = Field(allow_inf_nan=False)
    # Importação com Jan–Dez: grava os meses informados em vez de zerar a distribuição.
    months: list[float] | None = Field(default=None, min_length=12, max_length=12)


class AnnualBatch(Model):
    year: int = Field(ge=2020, le=2100)
    method: Literal["annual", "equal", "percent", "seasonal"]
    source: Literal["manual", "excel"] = "manual"
    product_id: int | None = None
    profile_revision: int | None = None
    weights: list[float] = Field(default_factory=list)
    unlock_reason: str = Field(default="", max_length=500)
    entries: list[AnnualTarget] = Field(min_length=1, max_length=5000)


class TemplateRow(Model):
    id: int | None = None
    name: str = Field(min_length=2, max_length=100)
    segment_id: int
    suggested_percent: float = Field(ge=0, le=100, allow_inf_nan=False)


class TemplatesInput(Model):
    entries: list[TemplateRow] = Field(min_length=1, max_length=50)


# Toda agência pertence a uma regional; as consultas de agência trazem o nome dela junto (regional_name).
AGENCY_SQL = db.AGENCY_SQL
# Regional e, dentro dela, código da agência: é a ordem em que as agências aparecem nas telas e nos arquivos.
AGENCY_ORDER = " ORDER BY regional_name COLLATE NOCASE,a.code"


def agency_filters(agency_id=None, regional_id=None, active=None):
    """Condições SQL (sobre o alias `a` de AGENCY_SQL) e argumentos para filtrar agências."""
    clauses, args = [], []
    if active is not None:
        clauses.append("a.active=?")
        args.append(int(active))
    if agency_id:
        clauses.append("a.id=?")
        args.append(agency_id)
    if regional_id:
        clauses.append("a.regional_id=?")
        args.append(regional_id)
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), args


def row(conn, table, id):
    if table not in {"agencies", "portfolios", "products", "segments", "goals", "regionals"}:
        raise ValueError(table)
    if table == "agencies":
        result = conn.execute(AGENCY_SQL + " WHERE a.id=?", (id,)).fetchone()
    else:
        result = conn.execute(f"SELECT * FROM {table} WHERE id=?", (id,)).fetchone()
    if result is None:
        raise HTTPException(404, "Registro não encontrado.")
    return dict(result)


def chosen_regional(conn, regional_id, current=None):
    """Regional escolhida no cadastro da agência: precisa existir e estar ativa (a atual da agência é aceita mesmo inativa)."""
    regional = conn.execute("SELECT * FROM regionals WHERE id=?", (regional_id,)).fetchone()
    if regional is None:
        raise HTTPException(422, "Selecione uma regional cadastrada.")
    if not regional["active"] and regional_id != current:
        raise HTTPException(422, "Selecione uma regional ativa.")
    return dict(regional)


def audit_scope(agency_id=None, regional_id=None):
    """Condição SQL e argumentos para limitar o histórico a uma agência ou a todas as agências de uma regional."""
    clauses, args = [], []
    if agency_id:
        clauses.append("agency_id=?")
        args.append(agency_id)
    if regional_id:
        clauses.append("agency_id IN (SELECT id FROM agencies WHERE regional_id=?)")
        args.append(regional_id)
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), args


def product_label(product):
    return f"{product['sub_product']} ({product['name']})"


def revision(goal, expected):
    if goal["revision"] != expected:
        raise HTTPException(409, "Esta meta foi alterada em outra sessão. Atualize a página antes de salvar.")


def scale_for(conn, goal):
    return AMOUNT_SCALE


def distribution_step(conn, goal):
    """Menor valor que um mês recebe ao dividir o total: reais (ou unidades) cheios; percentuais mantêm as 3 casas."""
    unit = conn.execute("SELECT unit FROM products WHERE id=?", (goal["product_id"],)).fetchone()["unit"]
    return 1 if unit == "PCT" else AMOUNT_SCALE


def portfolios_for(conn, agency_id, active=True):
    return [dict(r) | {"suggested_percent": r["suggested_bps"] / 100} for r in conn.execute("SELECT p.*,s.name segment_name,s.code segment_code,s.color FROM portfolios p JOIN segments s ON s.id=p.segment_id WHERE p.agency_id=?" + (" AND p.active=1" if active else "") + " ORDER BY p.id", (agency_id,))]


def plan_for(conn, agency_id, year):
    agency = row(conn, "agencies", agency_id)
    locked = closed_months(conn, year)
    result = []
    for item in conn.execute("SELECT g.*,p.name product_name,p.sub_product,p.unit,p.active product_active FROM goals g JOIN products p ON p.id=g.product_id WHERE g.agency_id=? AND g.year=? ORDER BY p.id", (agency_id, year)):
        goal = dict(item)
        scale = AMOUNT_SCALE
        months = [dict(r) for r in conn.execute("SELECT month,amount,manual FROM months WHERE goal_id=? ORDER BY month", (goal["id"],))]
        goal["annual_amount"] = (goal["annual_target"] if goal["annual_target"] is not None else sum(m["amount"] for m in months)) / scale
        goal["annual_pending"] = goal["planning_method"] in {"annual", "annual_imported"}
        goal["source_annual"] = goal["source_annual"] / scale if goal["source_annual"] is not None else None
        goal["missing_months"] = json.loads(goal["missing_months"])
        goal["seasonal_weights"] = [v / 100 for v in json.loads(goal["seasonal_weights"])]
        goal["manual_months"] = sum(m["manual"] for m in months)
        goal["months"] = [{**m, "amount": m["amount"] / scale, "closed": m["month"] in locked} for m in months]
        result.append(goal)
    return {"agency": agency, "year": year, "portfolios": portfolios_for(conn, agency_id), "goals": result}


def allocation_for(conn, goal_id, month):
    goal = row(conn, "goals", goal_id)
    product = row(conn, "products", goal["product_id"])
    scale = AMOUNT_SCALE
    m = conn.execute("SELECT * FROM months WHERE goal_id=? AND month=?", (goal_id, month)).fetchone()
    if not m:
        raise HTTPException(404, "Mês não encontrado.")
    entries = [dict(r) for r in conn.execute("SELECT a.portfolio_id,a.bps,a.amount FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND a.month=? AND p.active=1 ORDER BY p.id", (goal_id, month))]
    return {"goal_id": goal_id, "revision": goal["revision"], "month": month, "closed": month in closed_months(conn, goal["year"]), "unit": product["unit"], "total": m["amount"]/scale, "entries": [{"portfolio_id": e["portfolio_id"], "percent": e["bps"]/100, "amount": e["amount"]/scale} for e in entries], "portfolios": portfolios_for(conn, goal["agency_id"])}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0", "service": "sicredi-distribuidor-metas"}


@app.get("/api/bootstrap")
def bootstrap():
    with db.connect() as conn:
        report = conn.execute("SELECT value FROM metadata WHERE key='import_report'").fetchone()
        return {"closures": [dict(r) for r in conn.execute("SELECT * FROM month_closures ORDER BY year,month")], "agencies": [dict(r) for r in conn.execute(AGENCY_SQL + AGENCY_ORDER)], "regionals": [dict(r) for r in conn.execute("SELECT * FROM regionals ORDER BY name COLLATE NOCASE")], "products": [dict(r) for r in conn.execute("SELECT * FROM products ORDER BY id")], "segments": [dict(r) for r in conn.execute("SELECT * FROM segments ORDER BY id")], "templates": [dict(r) | {"suggested_percent": r["suggested_bps"]/100} for r in conn.execute("SELECT * FROM templates WHERE active=1 ORDER BY id")], "years": [r[0] for r in conn.execute("SELECT year FROM goals UNION SELECT year FROM month_closures ORDER BY year")], "goal_years": [r[0] for r in conn.execute("SELECT DISTINCT year FROM goals ORDER BY year")], "import_report": json.loads(report[0]) if report else None}


@app.get("/api/dashboard")
def dashboard(year: int = Query(2026, ge=2020, le=2100), agency_id: int | None = None, regional_id: int | None = None):
    with db.connect() as conn:
        where, args = agency_filters(agency_id, regional_id, active=True)
        agencies = [dict(r) for r in conn.execute(AGENCY_SQL + where + AGENCY_ORDER, args)]
        audit_where, audit_args = audit_scope(agency_id, regional_id)
        plans = [plan_for(conn, a["id"], year) for a in agencies]
        goals = [g for p in plans for g in p["goals"]]
        products = []
        for p in conn.execute("SELECT * FROM products ORDER BY id"):
            related = [g for g in goals if g["product_id"] == p["id"]]
            products.append({**dict(p), "total": round(sum(g["annual_amount"] for g in related), 3), "monthly": [round(sum(g["months"][i]["amount"] for g in related), 3) for i in range(12)], "loaded": sum(g["annual_amount"] != 0 for g in related), "goals": len(related)})
        summaries = [{**p["agency"], "portfolios": len(p["portfolios"]), "goals": len(p["goals"]), "loaded": sum(g["annual_amount"] != 0 for g in p["goals"]), "currency_total": round(sum(g["annual_amount"] for g in p["goals"] if g["unit"] == "BRL"), 3), "missing": sum(bool(g["missing_months"]) for g in p["goals"])} for p in plans]
        return {"year": year, "agencies": summaries, "products": products, "total_goals": len(goals), "loaded_goals": sum(g["annual_amount"] != 0 for g in goals), "currency_total": round(sum(g["annual_amount"] for g in goals if g["unit"] == "BRL"), 3), "portfolio_count": sum(len(p["portfolios"]) for p in plans), "audit": [dict(r) for r in conn.execute("SELECT * FROM audit" + audit_where + " ORDER BY id DESC LIMIT 5", audit_args)]}


@app.post("/api/agencies", status_code=201)
def create_agency(body: AgencyInput):
    with db.connect() as conn:
        require_open(conn, body.year)
        if conn.execute("SELECT 1 FROM agencies WHERE code=?", (body.code,)).fetchone():
            raise HTTPException(409, "Já existe uma agência com este código.")
        templates = list(conn.execute("SELECT * FROM templates WHERE active=1 ORDER BY id"))
        if not templates or sum(t["suggested_bps"] for t in templates) != 10000:
            raise HTTPException(422, "Configure carteiras padrão que somem 100% antes de criar a agência.")
        chosen_regional(conn, body.regional_id)
        id = conn.execute("INSERT INTO agencies(code,name,regional_id,city,state,manager,active) VALUES(?,?,?,?,?,?,?)", (body.code, body.name, body.regional_id, body.city, body.state, body.manager, body.active)).lastrowid
        for i,t in enumerate(templates):
            conn.execute("INSERT INTO portfolios(agency_id,code,name,segment_id,suggested_bps) VALUES(?,?,?,?,?)", (id, str(i+1), t["name"], t["segment_id"], t["suggested_bps"]))
        for p in conn.execute("SELECT id FROM products WHERE active=1").fetchall():
            create_goal(conn, id, p["id"], body.year)
        db.audit(conn, "create", "agency", id, f"Agência {body.name} criada com produtos, 12 meses e {len(templates)} carteiras padrão.", id, after=body.model_dump())
        return plan_for(conn, id, body.year)


@app.put("/api/agencies/{id}")
def update_agency(id: int, body: AgencyInput):
    with db.connect() as conn:
        protect_catalog(conn, "g.agency_id=?", (id,))
        before = row(conn, "agencies", id)
        if conn.execute("SELECT 1 FROM agencies WHERE code=? AND id<>?", (body.code,id)).fetchone():
            raise HTTPException(409, "Código de agência já cadastrado.")
        regional = chosen_regional(conn, body.regional_id, before["regional_id"])
        conn.execute("UPDATE agencies SET code=?,name=?,regional_id=?,city=?,state=?,manager=?,active=? WHERE id=?", (body.code,body.name,body.regional_id,body.city,body.state,body.manager,body.active,id))
        moved = f" Regional: {before['regional_name']} → {regional['name']}." if regional["id"] != before["regional_id"] else ""
        db.audit(conn, "update", "agency", id, f"Cadastro da agência {body.name} atualizado.{moved}", id, before, body.model_dump())
        return row(conn,"agencies",id)


@app.post("/api/regionals", status_code=201)
def create_regional(body: RegionalInput):
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM regionals WHERE name=? COLLATE NOCASE", (body.name,)).fetchone():
            raise HTTPException(409, "Já existe uma regional com este nome.")
        id = conn.execute("INSERT INTO regionals(name,active) VALUES(?,?)", (body.name, body.active)).lastrowid
        db.audit(conn, "create", "regional", id, f"Regional \"{body.name}\" criada.", after=body.model_dump())
        return row(conn, "regionals", id)


@app.put("/api/regionals/{id}")
def update_regional(id: int, body: RegionalInput):
    with db.connect() as conn:
        protect_catalog(conn, "g.agency_id IN (SELECT id FROM agencies WHERE regional_id=?)", (id,))
        before = row(conn, "regionals", id)
        if conn.execute("SELECT 1 FROM regionals WHERE name=? COLLATE NOCASE AND id<>?", (body.name, id)).fetchone():
            raise HTTPException(409, "Já existe uma regional com este nome.")
        if not body.active and conn.execute("SELECT 1 FROM agencies WHERE regional_id=? AND active=1", (id,)).fetchone():
            raise HTTPException(422, "Mova as agências ativas desta regional para outra antes de inativá-la.")
        conn.execute("UPDATE regionals SET name=?,active=? WHERE id=?", (body.name, body.active, id))
        db.audit(conn, "update", "regional", id, f"Regional \"{body.name}\" atualizada.", before=before, after=body.model_dump())
        return row(conn, "regionals", id)


@app.post("/api/agencies/{id}/years", status_code=201)
def create_year(id: int, body: YearInput):
    with db.connect() as conn:
        require_open(conn, body.year)
        row(conn,"agencies",id)
        products = conn.execute("SELECT id FROM products WHERE active=1 AND id NOT IN (SELECT product_id FROM goals WHERE agency_id=? AND year=?)", (id, body.year)).fetchall()
        if not products:
            raise HTTPException(409, "Esta agência já tem metas para o ano informado.")
        if body.copy_from and not conn.execute("SELECT 1 FROM goals WHERE agency_id=? AND year=?", (id,body.copy_from)).fetchone():
            raise HTTPException(422, "Ano de origem não encontrado para esta agência.")
        for p in products:
            old = conn.execute("SELECT id FROM goals WHERE agency_id=? AND year=? AND product_id=?", (id,body.copy_from,p["id"])).fetchone() if body.copy_from else None
            amounts = [m[0] for m in conn.execute("SELECT amount FROM months WHERE goal_id=? ORDER BY month",(old[0],))] if old else None
            create_goal(conn,id,p["id"],body.year,amounts)
        db.audit(conn,"create","year",body.year,f"Metas de {body.year} criadas" + (f" com os valores de {body.copy_from}." if body.copy_from else "."),id)
        return plan_for(conn,id,body.year)


def copy_percentages(conn, source_goal_id, goal_id):
    """Leva as participações (%) das carteiras de um ano para outro, mês a mês. Os valores continuam zerados."""
    goal = conn.execute("SELECT agency_id FROM goals WHERE id=?", (goal_id,)).fetchone()
    ids = [r[0] for r in conn.execute("SELECT id FROM portfolios WHERE agency_id=? AND active=1 ORDER BY id", (goal["agency_id"],))]
    source = {(r["month"], r["portfolio_id"]): r["bps"] for r in conn.execute("SELECT month,portfolio_id,bps FROM allocations WHERE goal_id=?", (source_goal_id,))}
    copied = 0
    for month in range(1, 13):
        weights = [source.get((month, pid)) for pid in ids]
        # Carteira nova ou desativada desde o ano de origem: o mês mantém a participação sugerida do cadastro.
        if not ids or any(w is None for w in weights) or sum(weights) != 10000:
            continue
        for pid, bps in zip(ids, weights):
            conn.execute("UPDATE allocations SET bps=? WHERE goal_id=? AND month=? AND portfolio_id=?", (bps, goal_id, month, pid))
        copied += 1
    return copied


def restrict_segments(conn, goal_id, segment_ids):
    """Carteiras de segmentos que não entram no ano ficam com 0%; as demais dividem os 100% na proporção que já tinham."""
    goal = conn.execute("SELECT agency_id FROM goals WHERE id=?", (goal_id,)).fetchone()
    portfolios = conn.execute("SELECT id,segment_id FROM portfolios WHERE agency_id=? AND active=1 ORDER BY id", (goal["agency_id"],)).fetchall()
    if all(p["segment_id"] in segment_ids for p in portfolios) or not any(p["segment_id"] in segment_ids for p in portfolios):
        return
    for month in range(1, 13):
        current = {r["portfolio_id"]: r["bps"] for r in conn.execute("SELECT portfolio_id,bps FROM allocations WHERE goal_id=? AND month=?", (goal_id, month))}
        weights = [current.get(p["id"], 0) if p["segment_id"] in segment_ids else 0 for p in portfolios]
        if not sum(weights):
            weights = [1 if p["segment_id"] in segment_ids else 0 for p in portfolios]
        for p, bps in zip(portfolios, apportion(10000, weights)):
            conn.execute("UPDATE allocations SET bps=? WHERE goal_id=? AND month=? AND portfolio_id=?", (bps, goal_id, month, p["id"]))


def rebalance_allocations(conn, goal_id):
    """Refaz os valores das carteiras de cada mês a partir da meta do mês e das participações gravadas (reais cheios)."""
    goal = conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone()
    step = distribution_step(conn, goal)
    for month in conn.execute("SELECT month,amount FROM months WHERE goal_id=?", (goal_id,)).fetchall():
        entries = conn.execute("SELECT a.portfolio_id,a.bps FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND a.month=? AND p.active=1 ORDER BY p.id", (goal_id, month["month"])).fetchall()
        for entry, part in zip(entries, apportion_whole(month["amount"], [e["bps"] for e in entries], step)):
            conn.execute("UPDATE allocations SET amount=? WHERE goal_id=? AND month=? AND portfolio_id=?", (part, goal_id, month["month"], entry["portfolio_id"]))


@app.get("/api/years")
def years_overview():
    """Situação de cada ano: quantas metas existem, quantas já têm valor e quantos meses estão fechados."""
    with db.connect() as conn:
        expected = conn.execute("SELECT (SELECT COUNT(*) FROM agencies WHERE active=1)*(SELECT COUNT(*) FROM products WHERE active=1)").fetchone()[0]
        goals = {r["year"]: dict(r) for r in conn.execute("""SELECT g.year,COUNT(*) goals,COUNT(DISTINCT g.agency_id) agencies,
            SUM(CASE WHEN COALESCE(g.annual_target,(SELECT COALESCE(SUM(amount),0) FROM months WHERE goal_id=g.id))!=0 THEN 1 ELSE 0 END) loaded
            FROM goals g GROUP BY g.year""")}
        closed = {r[0]: r[1] for r in conn.execute("SELECT year,COUNT(*) FROM month_closures WHERE closed=1 GROUP BY year")}
        years = sorted({*goals, *closed, *(r[0] for r in conn.execute("SELECT DISTINCT year FROM month_closures"))})
        return {"expected": expected, "years": [{"year": y, "goals": goals.get(y, {}).get("goals", 0), "agencies": goals.get(y, {}).get("agencies", 0), "loaded": goals.get(y, {}).get("loaded", 0), "closed_months": closed.get(y, 0)} for y in years]}


@app.post("/api/years", status_code=201)
def start_year(body: YearStartInput):
    """Cria as metas do ano para todas as agências ativas e todos os subprodutos ativos que ainda não as têm."""
    with db.connect() as conn:
        require_open(conn, body.year)
        if body.copy_from is not None:
            if body.copy_from == body.year:
                raise HTTPException(422, "O ano de origem precisa ser diferente do ano novo.")
            if not conn.execute("SELECT 1 FROM goals WHERE year=?", (body.copy_from,)).fetchone():
                raise HTTPException(422, f"Não há metas em {body.copy_from} para copiar.")
        products = conn.execute("SELECT id FROM products WHERE active=1 ORDER BY id").fetchall()
        agencies = conn.execute("SELECT id,regional_id FROM agencies WHERE active=1 ORDER BY id").fetchall()
        reused = []
        if body.copy_from is not None:
            if body.reuse_products:
                used = {r[0] for r in conn.execute("SELECT DISTINCT product_id FROM goals WHERE year=?", (body.copy_from,))}
                products = [p for p in products if p["id"] in used]
                reused.append("produtos de metas")
            if body.reuse_regionals:
                used = {r[0] for r in conn.execute("SELECT DISTINCT a.regional_id FROM goals g JOIN agencies a ON a.id=g.agency_id WHERE g.year=?", (body.copy_from,))}
                agencies = [a for a in agencies if a["regional_id"] in used]
                reused.append("regionais")
            if body.reuse_segments:
                reused.append("segmentos")
            if body.keep_percentages:
                reused.append("carteiras padrão")
            if not products or not agencies:
                raise HTTPException(422, f"{body.copy_from} não tem subprodutos ou regionais ativos para reaproveitar.")
        created, touched = 0, {}
        for agency in agencies:
            for product in products:
                if conn.execute("SELECT 1 FROM goals WHERE agency_id=? AND product_id=? AND year=?", (agency["id"], product["id"], body.year)).fetchone():
                    continue
                source = conn.execute("SELECT * FROM goals WHERE agency_id=? AND product_id=? AND year=?", (agency["id"], product["id"], body.copy_from)).fetchone() if body.copy_from is not None else None
                amounts = [m[0] for m in conn.execute("SELECT amount FROM months WHERE goal_id=? ORDER BY month", (source["id"],))] if source and body.keep_values else None
                goal_id = create_goal(conn, agency["id"], product["id"], body.year, amounts)
                created += 1
                touched[agency["id"]] = touched.get(agency["id"], 0) + 1
                if amounts is not None:
                    conn.execute("UPDATE goals SET annual_target=? WHERE id=?", (source["annual_target"] if source["annual_target"] is not None else sum(amounts), goal_id))
                if source and body.keep_percentages:
                    copy_percentages(conn, source["id"], goal_id)
                if source and body.reuse_segments and not body.keep_percentages:
                    in_source = {r[0] for r in conn.execute("SELECT DISTINCT p.segment_id FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND a.bps>0 AND p.active=1", (source["id"],))}
                    if in_source:
                        restrict_segments(conn, goal_id, in_source)
                if amounts is not None:
                    rebalance_allocations(conn, goal_id)
        if not created:
            raise HTTPException(409, f"{body.year} já tem metas para todas as agências e subprodutos ativos.")
        seasonality = 0
        if body.copy_from is not None and body.keep_seasonality:
            for profile in conn.execute("SELECT product_id,weights FROM seasonality_profiles WHERE year=?", (body.copy_from,)).fetchall():
                if conn.execute("SELECT 1 FROM seasonality_profiles WHERE product_id=? AND year=?", (profile["product_id"], body.year)).fetchone():
                    continue
                conn.execute("INSERT INTO seasonality_profiles(product_id,year,weights,revision) VALUES(?,?,?,1)", (profile["product_id"], body.year, profile["weights"]))
                seasonality += 1
        origin = f" com a estrutura de {body.copy_from}" if body.copy_from is not None else " a partir do cadastro"
        if reused:
            origin += f" (reaproveitando {', '.join(reused)})"
        kept = body.copy_from is not None and body.keep_values
        for agency_id, count in touched.items():
            db.audit(conn, "create", "year", body.year, f"Metas de {body.year} criadas{origin}: {count} {'subproduto' if count == 1 else 'subprodutos'}, {'com os valores de ' + str(body.copy_from) if kept else 'valores zerados'}.", agency_id)
        return {"year": body.year, "agencies": len(touched), "goals": created, "copied_from": body.copy_from, "percentages": bool(body.copy_from is not None and body.keep_percentages), "seasonality": seasonality, "values": bool(kept)}


@app.get("/api/agencies/{id}/goals")
def agency_goals(id: int, year: int = Query(2026, ge=2020, le=2100)):
    with db.connect() as conn:
        return plan_for(conn,id,year)


@app.get("/api/portfolios")
def portfolios(agency_id: int | None = None, regional_id: int | None = None):
    with db.connect() as conn:
        where, args = agency_filters(agency_id, regional_id)
        agencies = [dict(r) for r in conn.execute(AGENCY_SQL + where + AGENCY_ORDER, args)]
        return [{**p,"agency_name":a["name"],"agency_code":a["code"],"regional_id":a["regional_id"],"regional_name":a["regional_name"]} for a in agencies for p in portfolios_for(conn,a["id"],False)]


@app.get("/api/goals")
def goals_matrix(year: int = Query(2026, ge=2020, le=2100), agency_id: int | None = Query(None, ge=1), product_id: int | None = Query(None, ge=1), regional_id: int | None = Query(None, ge=1)):
    """Matriz anual: valores persistidos, incluindo ajustes por valor e arredondamentos."""
    with db.connect() as conn:
        clauses = ["ag.active=1", "g.year=?"]
        args = [year]
        if agency_id is not None:
            clauses.append("g.agency_id=?")
            args.append(agency_id)
        if regional_id is not None:
            clauses.append("ag.regional_id=?")
            args.append(regional_id)
        if product_id is not None:
            clauses.append("g.product_id=?")
            args.append(product_id)
        selected = conn.execute("SELECT g.id,g.agency_id FROM goals g JOIN agencies ag ON ag.id=g.agency_id LEFT JOIN regionals rg ON rg.id=ag.regional_id WHERE " + " AND ".join(clauses) + " ORDER BY rg.name COLLATE NOCASE,ag.code,g.product_id", args).fetchall()
        plans = {a: plan_for(conn, a, year) for a in dict.fromkeys(r["agency_id"] for r in selected)}
        result = []
        for selected_goal in selected:
            plan = plans[selected_goal["agency_id"]]
            goal = next(g for g in plan["goals"] if g["id"] == selected_goal["id"])
            scale = AMOUNT_SCALE
            allocations = {}
            for item in conn.execute("SELECT a.portfolio_id,a.month,a.amount,a.bps FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND p.active=1 ORDER BY p.id,a.month", (goal["id"],)):
                allocations.setdefault(item["portfolio_id"], []).append({"month": item["month"], "amount": item["amount"]/scale, "percent": item["bps"]/100})
            result.append({"agency": plan["agency"], "goal": goal, "portfolios": [{**p, "months": allocations.get(p["id"], [])} for p in plan["portfolios"]]})
        return {"year": year, "rows": result, "goals_without_portfolios": sum(not r["portfolios"] for r in result)}


@app.post("/api/agencies/{id}/portfolios", status_code=201)
def create_portfolio(id: int, body: PortfolioInput):
    with db.connect() as conn:
        protect_catalog(conn, "g.agency_id=?", (id,))
        row(conn,"agencies",id)
        segment = row(conn,"segments",body.segment_id)
        if not segment["active"]:
            raise HTTPException(422,"Selecione um segmento ativo.")
        if conn.execute("SELECT 1 FROM portfolios WHERE agency_id=? AND code=?", (id,body.code)).fetchone():
            raise HTTPException(409,"Código de carteira já utilizado nesta agência.")
        pid = conn.execute("INSERT INTO portfolios(agency_id,code,name,segment_id,manager,suggested_bps,active) VALUES(?,?,?,?,?,?,?)",(id,body.code,body.name,body.segment_id,body.manager,numeric(body.suggested_percent),body.active)).lastrowid
        if body.active:
            conn.execute("INSERT INTO allocations SELECT m.goal_id,m.month,?,0,0 FROM months m JOIN goals g ON g.id=m.goal_id WHERE g.agency_id=?",(pid,id))
            conn.execute("UPDATE goals SET revision=revision+1 WHERE agency_id=?",(id,))
        db.audit(conn,"create","portfolio",pid,f"Carteira {body.name} adicionada com 0% em todas as metas da agência.",id,after=body.model_dump())
        return row(conn,"portfolios",pid)


@app.put("/api/portfolios/{id}")
def update_portfolio(id: int, body: PortfolioInput):
    with db.connect() as conn:
        before = row(conn,"portfolios",id)
        protect_catalog(conn, "g.agency_id=?", (before["agency_id"],))
        row(conn,"segments",body.segment_id)
        if conn.execute("SELECT 1 FROM portfolios WHERE agency_id=? AND code=? AND id<>?",(before["agency_id"],body.code,id)).fetchone():
            raise HTTPException(409,"Código de carteira já utilizado nesta agência.")
        active_change = bool(before["active"]) != body.active
        if active_change:
            if not body.active and conn.execute("SELECT 1 FROM allocations WHERE portfolio_id=? AND (amount>0 OR bps>0)",(id,)).fetchone():
                raise HTTPException(422,"Redistribua a participação desta carteira para 0% em todos os meses antes de inativá-la.")
            if body.active:
                conn.execute("INSERT OR IGNORE INTO allocations SELECT m.goal_id,m.month,?,0,0 FROM months m JOIN goals g ON g.id=m.goal_id WHERE g.agency_id=?",(id,before["agency_id"]))
            conn.execute("UPDATE goals SET revision=revision+1 WHERE agency_id=?",(before["agency_id"],))
        conn.execute("UPDATE portfolios SET code=?,name=?,segment_id=?,manager=?,suggested_bps=?,active=? WHERE id=?",(body.code,body.name,body.segment_id,body.manager,numeric(body.suggested_percent),body.active,id))
        db.audit(conn,"update","portfolio",id,f"Carteira {body.name} atualizada.",before["agency_id"],before,body.model_dump())
        return row(conn,"portfolios",id)


@app.post("/api/products", status_code=201)
def create_product(body: ProductInput):
    with db.connect() as conn:
        if body.active:
            protect_catalog(conn)
        if conn.execute("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND sub_product=? COLLATE NOCASE",(body.name,body.sub_product)).fetchone():
            raise HTTPException(409,"Este subproduto já está cadastrado para o produto informado.")
        id = conn.execute("INSERT INTO products(name,unit,sub_product,active) VALUES(?,?,?,?)",(body.name,body.unit,body.sub_product,body.active)).lastrowid
        if body.active:
            for a in conn.execute("SELECT id FROM agencies WHERE active=1").fetchall():
                years = [y[0] for y in conn.execute("SELECT DISTINCT year FROM goals WHERE agency_id=?",(a[0],))] or [2026]
                for year in years:
                    create_goal(conn,a[0],id,year)
        db.audit(conn,"create","product",id,f"Subproduto {product_label(body.model_dump())} criado e adicionado às agências ativas.",after=body.model_dump())
        return row(conn,"products",id)


@app.put("/api/products/{id}")
def update_product(id: int, body: ProductInput):
    with db.connect() as conn:
        before = row(conn,"products",id)
        protect_catalog(conn, "g.product_id=?", (id,))
        if body.unit != before["unit"] and conn.execute("SELECT 1 FROM months m JOIN goals g ON g.id=m.goal_id WHERE g.product_id=? AND (m.amount>0 OR g.annual_target>0)",(id,)).fetchone():
            raise HTTPException(422,"Não é possível mudar a unidade de um subproduto com metas preenchidas.")
        if conn.execute("SELECT 1 FROM products WHERE name=? COLLATE NOCASE AND sub_product=? COLLATE NOCASE AND id<>?",(body.name,body.sub_product,id)).fetchone():
            raise HTTPException(409,"Este subproduto já está cadastrado para o produto informado.")
        conn.execute("UPDATE products SET name=?,unit=?,sub_product=?,active=? WHERE id=?",(body.name,body.unit,body.sub_product,body.active,id))
        if body.active and not before["active"]:
            for a in conn.execute("SELECT id FROM agencies WHERE active=1").fetchall():
                years = [y[0] for y in conn.execute("SELECT DISTINCT year FROM goals WHERE agency_id=?",(a[0],))] or [2026]
                for year in years:
                    if not conn.execute("SELECT 1 FROM goals WHERE agency_id=? AND product_id=? AND year=?",(a[0],id,year)).fetchone():
                        create_goal(conn,a[0],id,year)
        db.audit(conn,"update","product",id,f"Subproduto {product_label(body.model_dump())} atualizado.",before=before,after=body.model_dump())
        return row(conn,"products",id)


@app.post("/api/segments", status_code=201)
def create_segment(body: SegmentInput):
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM segments WHERE code=?",(body.code,)).fetchone():
            raise HTTPException(409,"Sigla de segmento já cadastrada.")
        id = conn.execute("INSERT INTO segments(code,name,color,active) VALUES(?,?,?,?)",(body.code,body.name,body.color,body.active)).lastrowid
        db.audit(conn,"create","segment",id,f"Segmento {body.name} criado.",after=body.model_dump())
        return row(conn,"segments",id)


@app.put("/api/segments/{id}")
def update_segment(id: int, body: SegmentInput):
    with db.connect() as conn:
        protect_catalog(conn, "g.agency_id IN (SELECT agency_id FROM portfolios WHERE segment_id=?)", (id,))
        before = row(conn,"segments",id)
        if conn.execute("SELECT 1 FROM segments WHERE code=? AND id<>?",(body.code,id)).fetchone():
            raise HTTPException(409,"Sigla já cadastrada.")
        if not body.active and (conn.execute("SELECT 1 FROM portfolios WHERE segment_id=? AND active=1",(id,)).fetchone() or conn.execute("SELECT 1 FROM templates WHERE segment_id=? AND active=1",(id,)).fetchone()):
            raise HTTPException(422,"O segmento está associado a carteiras ativas ou ao modelo padrão.")
        conn.execute("UPDATE segments SET code=?,name=?,color=?,active=? WHERE id=?",(body.code,body.name,body.color,body.active,id))
        db.audit(conn,"update","segment",id,f"Segmento {body.name} atualizado.",before=before,after=body.model_dump())
        return row(conn,"segments",id)


@app.put("/api/templates")
def update_templates(body: TemplatesInput):
    weights = percentages([e.suggested_percent for e in body.entries])
    with db.connect() as conn:
        for e in body.entries:
            if not row(conn,"segments",e.segment_id)["active"]:
                raise HTTPException(422,"O modelo precisa usar segmentos ativos.")
        before = [dict(r) for r in conn.execute("SELECT * FROM templates WHERE active=1")]
        conn.execute("UPDATE templates SET active=0")
        for e,bps in zip(body.entries,weights):
            conn.execute("INSERT INTO templates(name,segment_id,suggested_bps) VALUES(?,?,?)",(e.name,e.segment_id,bps))
        db.audit(conn,"update","templates",None,"Modelo de carteiras padrão atualizado para novas agências.",before=before,after=body.model_dump())
        return {"ok":True}


@app.put("/api/goals/{id}")
def update_goal(id: int, body: GoalInput):
    with db.connect() as conn:
        return write_goal_plan(conn, id, body)


def annual_change_note(conn, goal, new_total, reason):
    """O total anual informado é travado: só muda com um motivo, que vai para o histórico.

    Devolve o texto para o log quando o total muda e None quando não há mudança (ou ainda não havia total).
    """
    current = goal["annual_target"] if goal["annual_target"] is not None else conn.execute("SELECT COALESCE(SUM(amount),0) FROM months WHERE goal_id=?", (goal["id"],)).fetchone()[0]
    if current == 0 or current == new_total:
        return None
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(409, "Total anual travado. Para alterá-lo, destrave o total e informe o motivo (mínimo de 5 letras); ele fica registrado no histórico.")
    scale = scale_for(conn, goal)
    show = lambda v: f"{v / scale:.3f}".rstrip("0").rstrip(".")
    return f" Total anual destravado: {show(current)} → {show(new_total)}. Motivo: {reason}."


def write_goal_plan(conn, id, body, seasonal_total=None, note=""):
    goal = row(conn,"goals",id)
    revision(goal,body.revision)
    scale = scale_for(conn,goal)
    locked = closed_months(conn, goal["year"])
    if len(locked) == 12:
        require_open(conn, goal["year"])
    original = {m["month"]: m for m in conn.execute("SELECT month,amount,manual FROM months WHERE goal_id=?", (id,))}
    annual_target = goal["annual_target"] if goal["annual_target"] is not None else sum(m["amount"] for m in original.values())
    if body.mode == "monthly":
        if len(body.amounts) != 12:
            raise HTTPException(422,"Informe os 12 meses, incluindo abril.")
        amounts = [to_amount(v) for v in body.amounts]
        for month in locked:
            if amounts[month - 1] != original[month]["amount"]:
                require_open(conn, goal["year"], [month])
        require_annual_limit(sum(amounts), annual_target)
    else:
        if body.mode != "equal" and len(body.weights) != 12:
            raise HTTPException(422,"Informe os pesos dos 12 meses.")
        total = to_amount(body.annual_amount) if seasonal_total is None else seasonal_total
        if seasonal_total is None:
            note += annual_change_note(conn, goal, total, body.unlock_reason) or ""
        amounts = distribute_open(total, [1]*12 if body.mode == "equal" else percentages(body.weights), [original[i]["amount"] for i in range(1, 13)], locked, step=distribution_step(conn, goal))
    before = plan_for(conn,goal["agency_id"],goal["year"])
    step = distribution_step(conn, goal)
    missing = json.loads(goal["missing_months"])
    for i,amount in enumerate(amounts,1):
        if i in locked:
            continue
        manual = int(body.mode == "monthly" and (original[i]["manual"] or original[i]["amount"] != amount or i in missing))
        conn.execute("UPDATE months SET amount=?,manual=? WHERE goal_id=? AND month=?",(amount,manual,id,i))
        entries = conn.execute("SELECT a.portfolio_id,a.bps FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND a.month=? AND p.active=1 ORDER BY p.id",(id,i)).fetchall()
        for e,part in zip(entries,apportion_whole(amount,[e["bps"] for e in entries],step)):
            conn.execute("UPDATE allocations SET amount=? WHERE goal_id=? AND month=? AND portfolio_id=?",(part,id,i,e["portfolio_id"]))
    weights = json.dumps(apportion(10000, [1]*12) if body.mode == "equal" else percentages(body.weights)) if body.mode != "monthly" else goal["seasonal_weights"]
    if locked and body.mode != "monthly":
        saved_weights = json.loads(goal["seasonal_weights"])
        if len(saved_weights) != 12:
            saved_weights = [round(v * 100) for v in seasonality_profile(conn, goal["product_id"], goal["year"])["weights"]]
        weights = json.dumps(distribute_open(10000, json.loads(weights), saved_weights, locked))
    missing = [m for m in missing if m in locked]
    conn.execute("UPDATE goals SET revision=revision+1,missing_months=?,planning_method=?,seasonal_weights=?,annual_target=? WHERE id=?",(json.dumps(missing),body.mode,weights,annual_target if body.mode == "monthly" else sum(amounts),id))
    db.audit(conn,"update","goal",id,("Metas dos meses abertos atualizadas; meses fechados preservados." if locked else "Metas mensais atualizadas.")+note,goal["agency_id"],before,{"amounts":amounts,"mode":body.mode,**({"unlock_reason":body.unlock_reason.strip()} if note and body.unlock_reason.strip() else {})})
    return plan_for(conn,goal["agency_id"],goal["year"])


def seasonality_profile(conn, product_id, year):
    saved = conn.execute("SELECT * FROM seasonality_profiles WHERE product_id=? AND year=?", (product_id, year)).fetchone()
    return {"product_id": product_id, "year": year, "revision": saved["revision"] if saved else 0,
            "weights": [w / 100 for w in (json.loads(saved["weights"]) if saved else apportion(10000, [1]*12))]}


@app.get("/api/seasonality")
def seasonality(year: int = Query(2026, ge=2020, le=2100)):
    with db.connect() as conn:
        return {"year": year, "profiles": [seasonality_profile(conn, p["id"], year) for p in conn.execute("SELECT id FROM products ORDER BY id")]}


@app.put("/api/seasonality/{product_id}/{year}")
def save_seasonality(product_id: int, year: int, body: SeasonalityInput):
    with db.connect() as conn:
        return write_seasonality_profile(conn, product_id, year, body)


def write_seasonality_profile(conn, product_id, year, body):
    if not 2020 <= year <= 2100:
        raise HTTPException(422, "Informe um ano entre 2020 e 2100.")
    weights = percentages(body.weights)
    product = row(conn, "products", product_id)
    before = seasonality_profile(conn, product_id, year)
    for month in closed_months(conn, year):
        if weights[month - 1] != round(before["weights"][month - 1] * 100):
            require_open(conn, year, [month])
    if len(closed_months(conn, year)) == 12:
        require_open(conn, year)
    if before["revision"] != body.revision:
        raise HTTPException(409, "A sazonalidade foi alterada em outra sessão. Atualize a página antes de salvar.")
    conn.execute("INSERT INTO seasonality_profiles(product_id,year,weights,revision) VALUES(?,?,?,1) ON CONFLICT(product_id,year) DO UPDATE SET weights=excluded.weights,revision=seasonality_profiles.revision+1", (product_id, year, json.dumps(weights)))
    after = seasonality_profile(conn, product_id, year)
    db.audit(conn, "update", "seasonality", product_id, f"Sazonalidade de {product_label(product)} para {year} salva.", before=before, after=after)
    return after


@app.post("/api/seasonality/{product_id}/{year}/apply")
def apply_seasonality(product_id: int, year: int, body: SeasonalityApplyInput):
    with db.connect() as conn:
        return apply_seasonality_targets(conn, product_id, year, body.revision, body.goals)


def apply_seasonality_targets(conn, product_id, year, profile_revision, targets):
    product = row(conn, "products", product_id)
    profile = seasonality_profile(conn, product_id, year)
    if profile["revision"] != profile_revision:
        raise HTTPException(409, "A sazonalidade foi alterada em outra sessão. Atualize a página antes de aplicar.")
    if not targets:
        raise HTTPException(422, "Selecione pelo menos uma agência para aplicar.")
    if len({g.goal_id for g in targets}) != len(targets):
        raise HTTPException(422, "Informe cada meta apenas uma vez.")
    for target in targets:
        goal = row(conn, "goals", target.goal_id)
        revision(goal, target.revision)
        if goal["product_id"] != product_id or goal["year"] != year or not product["active"] or not row(conn, "agencies", goal["agency_id"])["active"]:
            raise HTTPException(422, "Selecione metas ativas do subproduto e do ano informados.")
    # A mesma transação protege todo o lote e conserva os totais em inteiros.
    for target in targets:
        saved_goal = row(conn, "goals", target.goal_id)
        total = saved_goal["annual_target"] if saved_goal["annual_target"] is not None else conn.execute("SELECT SUM(amount) FROM months WHERE goal_id=?", (target.goal_id,)).fetchone()[0]
        write_goal_plan(conn, target.goal_id, GoalInput(revision=target.revision, mode="seasonal", weights=profile["weights"]), seasonal_total=total)
    return {"applied": len(targets)}


@app.post("/api/seasonality/{product_id}/{year}/save")
def confirm_seasonality_save(product_id: int, year: int, body: SeasonalitySaveInput):
    expected = "APLICAR" if body.action == "apply" else "SALVAR"
    if body.confirmation != expected:
        raise HTTPException(422, f"Digite {expected} para confirmar esta operação.")
    if body.action == "save" and body.goals:
        raise HTTPException(422, "Salvar somente os percentuais não deve incluir agências.")
    # Salvar e aplicar formam uma única operação: qualquer conflito desfaz tudo.
    with db.connect() as conn:
        profile = write_seasonality_profile(conn, product_id, year, body)
        result = apply_seasonality_targets(conn, product_id, year, profile["revision"], body.goals) if body.action == "apply" else {"applied": 0}
        return {"profile": profile, **result}


def require_annual_limit(total, annual_target):
    # Meta negativa: os meses não podem ser mais negativos que o planejado (limite em módulo).
    if (total > annual_target) if annual_target >= 0 else (total < annual_target):
        raise HTTPException(422, "A soma dos meses não pode ultrapassar a meta anual planejada. Reduza a meta de outros meses antes de salvar.")


@app.put("/api/goals/{id}/months/{month}")
def update_goal_month(id: int, month: int, body: MonthGoalInput):
    if month < 1 or month > 12:
        raise HTTPException(422, "Informe um mês entre 1 e 12.")
    with db.connect() as conn:
        goal = row(conn,"goals",id)
        require_open(conn, goal["year"], [month])
        revision(goal,body.revision)
        if goal["planning_method"] in {"annual", "annual_imported"}:
            raise HTTPException(422, "Distribua o total anual nos 12 meses antes de ajustar um mês.")
        scale = scale_for(conn,goal)
        amount = to_amount(body.amount)
        original ={m["month"]: m["amount"] for m in conn.execute("SELECT month,amount FROM months WHERE goal_id=?", (id,))}
        annual_target = goal["annual_target"] if goal["annual_target"] is not None else sum(original.values())
        require_annual_limit(sum(original.values()) - original[month] + amount, annual_target)
        before = allocation_for(conn,id,month)
        conn.execute("UPDATE months SET amount=?,manual=1 WHERE goal_id=? AND month=?",(amount,id,month))
        entries = list(conn.execute("SELECT a.portfolio_id,a.bps FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND a.month=? AND p.active=1 ORDER BY p.id",(id,month)))
        for entry, part in zip(entries,apportion_whole(amount,[e["bps"] for e in entries],distribution_step(conn, goal))):
            conn.execute("UPDATE allocations SET amount=? WHERE goal_id=? AND month=? AND portfolio_id=?",(part,id,month,entry["portfolio_id"]))
        missing = [m for m in json.loads(goal["missing_months"]) if m != month]
        conn.execute("UPDATE goals SET revision=revision+1,planning_method='monthly',missing_months=?,annual_target=? WHERE id=?",(json.dumps(missing),annual_target,id))
        db.audit(conn,"update","goal",id,f"Meta do mês {month:02d} ajustada manualmente.",goal["agency_id"],before,{"mode":"monthly","month":month,"amount":body.amount})
        return plan_for(conn,goal["agency_id"],goal["year"])


@app.get("/api/goals/{id}/allocations")
def get_allocation(id: int, month: int = Query(1,ge=1,le=12)):
    with db.connect() as conn:
        return allocation_for(conn,id,month)


@app.put("/api/goals/{id}/allocations")
def save_allocation(id: int, body: AllocationInput):
    with db.connect() as conn:
        goal = row(conn,"goals",id)
        require_open(conn, goal["year"], [body.month])
        revision(goal,body.revision)
        active = portfolios_for(conn,goal["agency_id"])
        ids = [e.portfolio_id for e in body.entries]
        if not active or len(set(ids)) != len(ids) or set(ids) != {p["id"] for p in active}:
            raise HTTPException(422,"Informe cada carteira ativa da agência exatamente uma vez.")
        entries = sorted(body.entries,key=lambda e:e.portfolio_id)
        step = distribution_step(conn, goal)
        total = conn.execute("SELECT amount FROM months WHERE goal_id=? AND month=?",(id,body.month)).fetchone()[0]
        if body.mode == "percent":
            weights = percentages([e.value for e in entries])
            values = apportion_whole(total,weights,step)
        else:
            values = [to_amount(e.value) for e in entries]
            if sum(values) != total:
                raise HTTPException(422,"A soma dos valores das carteiras deve ser igual à meta do mês.")
            if total == 0:
                raise HTTPException(422,"Para uma meta zero, distribua por percentual.")
            if any(v * total < 0 for v in values):
                raise HTTPException(422,"Os valores das carteiras devem ter o mesmo sinal da meta do mês.")
            weights = apportion(10000,values)
        before = allocation_for(conn,id,body.month)
        locked = closed_months(conn, goal["year"])
        months = [m for m in range(1,13) if m not in locked] if body.apply_to_all else [body.month]
        for month in months:
            monthly_total = conn.execute("SELECT amount FROM months WHERE goal_id=? AND month=?",(id,month)).fetchone()[0]
            parts = values if month == body.month else apportion_whole(monthly_total,weights,step)
            for e,bps,part in zip(entries,weights,parts):
                conn.execute("UPDATE allocations SET bps=?,amount=? WHERE goal_id=? AND month=? AND portfolio_id=?",(bps,part,id,month,e.portfolio_id))
        conn.execute("UPDATE goals SET revision=revision+1 WHERE id=?",(id,))
        db.audit(conn,"distribute","goal",id,f"Distribuição salva: {str(len(months)) + ' meses abertos' if body.apply_to_all else f'mês {body.month:02d}'} com 100% atribuídos.",goal["agency_id"],before,body.model_dump())
        return allocation_for(conn,id,body.month)


@app.get("/api/versions")
def goal_versions(year: int | None = Query(None, ge=2020, le=2100), agency_id: int | None = None, product_id: int | None = None, regional_id: int | None = None,
                  date_from: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), date_to: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
                  actor: str | None = None, action: str | None = None, kind: Literal["", "unlock", "import"] = "",
                  limit: int = Query(30, ge=1, le=200), offset: int = Query(0, ge=0)):
    """Todas as versões gravadas das metas, da mais recente para a mais antiga, com o que mudou em relação à versão anterior.

    As datas valem no horário de Brasília. `kind` separa os totais destravados (com motivo) e as importações de planilha.
    """
    scope, args = [], []
    for column, value in (("g.year=?", year), ("g.agency_id=?", agency_id), ("g.product_id=?", product_id), ("a.regional_id=?", regional_id),
                          ("date(v.timestamp,'-3 hours')>=?", date_from), ("date(v.timestamp,'-3 hours')<=?", date_to)):
        if value is not None:
            scope.append(column)
            args.append(value)
    picked, picked_args = [], []
    if actor:
        picked.append("v.actor IS NULL" if actor == "__sem_autor__" else "v.actor=?")
        picked_args += [] if actor == "__sem_autor__" else [actor]
    if action:
        picked.append("v.action=?")
        picked_args.append(action)
    kinds = {"unlock": "v.detail LIKE '%Total anual destravado%'", "import": "(v.action='import' OR v.detail LIKE '%Importação alterou%')"}
    join = " FROM goal_versions v JOIN goals g ON g.id=v.goal_id JOIN agencies a ON a.id=g.agency_id JOIN products p ON p.id=g.product_id"
    where = lambda *groups: " WHERE " + " AND ".join(c for group in groups for c in group) if any(groups) else ""
    base = join + where(scope, picked, [kinds[kind]] if kind else [])
    all_args = [*args, *picked_args]
    scale = AMOUNT_SCALE
    with db.connect() as conn:
        total = conn.execute("SELECT count(*)" + base, all_args).fetchone()[0]
        counts = {"all": conn.execute("SELECT count(*)" + join + where(scope, picked), all_args).fetchone()[0]}
        for name, clause in kinds.items():
            counts[name] = conn.execute("SELECT count(*)" + join + where(scope, picked, [clause]), all_args).fetchone()[0]
        actors = [r[0] for r in conn.execute("SELECT DISTINCT v.actor" + join + where(scope) + " ORDER BY v.actor", args)]
        actions = [r[0] for r in conn.execute("SELECT DISTINCT v.action" + join + where(scope) + " ORDER BY v.action", args)]
        rows = conn.execute("SELECT v.*,g.year,g.agency_id,g.product_id,a.code agency_code,a.name agency_name,a.regional_id,p.name product_name,p.sub_product,p.unit" + base + " ORDER BY v.id DESC LIMIT ? OFFSET ?", (*all_args, limit, offset)).fetchall()
        entries = []
        for r in rows:
            previous = conn.execute("SELECT * FROM goal_versions WHERE goal_id=? AND version<? ORDER BY version DESC LIMIT 1", (r["goal_id"], r["version"])).fetchone()
            changes = []
            if previous:
                if previous["annual_amount"] != r["annual_amount"]:
                    changes.append({"kind": "annual", "label": "Total do ano", "before": previous["annual_amount"] / scale, "after": r["annual_amount"] / scale})
                old_months, new_months = json.loads(previous["months_json"]), json.loads(r["months_json"])
                for i, (before, after) in enumerate(zip(old_months, new_months)):
                    if before != after:
                        changes.append({"kind": "month", "label": MONTHS[i], "before": before / scale, "after": after / scale})
                old_portfolios, new_portfolios = json.loads(previous["portfolios_json"]), json.loads(r["portfolios_json"])
                for key in sorted({*old_portfolios, *new_portfolios}, key=int):
                    name = (new_portfolios.get(key) or old_portfolios[key])["name"]
                    old_amounts = (old_portfolios.get(key) or {"amounts": [0] * 12})["amounts"]
                    new_amounts = (new_portfolios.get(key) or {"amounts": [0] * 12})["amounts"]
                    for i, (before, after) in enumerate(zip(old_amounts, new_amounts)):
                        if before != after:
                            changes.append({"kind": "portfolio", "label": f"{name} · {MONTHS[i]}", "before": before / scale, "after": after / scale})
            entries.append({"id": r["id"], "goal_id": r["goal_id"], "version": r["version"], "timestamp": r["timestamp"], "actor": r["actor"], "action": r["action"], "detail": r["detail"],
                            "year": r["year"], "agency": {"id": r["agency_id"], "code": r["agency_code"], "name": r["agency_name"], "regional_id": r["regional_id"]},
                            "product": {"id": r["product_id"], "name": r["product_name"], "sub_product": r["sub_product"], "unit": r["unit"]},
                            "annual_amount": r["annual_amount"] / scale, "changes": changes})
        return {"total": total, "entries": entries, "counts": counts, "actors": actors, "actions": actions}


@app.get("/api/goals/{id}/versions")
def goal_version_history(id: int):
    """Todas as versões de uma meta com os valores completos (total, 12 meses e carteiras), para comparar duas versões."""
    with db.connect() as conn:
        goal = row(conn, "goals", id)
        agency = row(conn, "agencies", goal["agency_id"])
        product = row(conn, "products", goal["product_id"])
        scale = AMOUNT_SCALE
        versions = []
        for r in conn.execute("SELECT * FROM goal_versions WHERE goal_id=? ORDER BY version DESC", (id,)):
            portfolios = json.loads(r["portfolios_json"])
            versions.append({"version": r["version"], "timestamp": r["timestamp"], "actor": r["actor"], "action": r["action"], "detail": r["detail"],
                             "annual_amount": r["annual_amount"] / scale, "months": [m / scale for m in json.loads(r["months_json"])],
                             "portfolios": [{"id": int(key), "name": value["name"], "amounts": [a / scale for a in value["amounts"]]} for key, value in sorted(portfolios.items(), key=lambda item: int(item[0]))]})
        return {"goal": {"id": id, "year": goal["year"], "agency": {"id": agency["id"], "code": agency["code"], "name": agency["name"]},
                         "product": {"id": product["id"], "name": product["name"], "sub_product": product["sub_product"], "unit": product["unit"]}}, "versions": versions}


@app.get("/api/audit")
def audit_log(agency_id: int | None = None, regional_id: int | None = None, limit: int = Query(50,ge=1,le=200), offset: int = Query(0,ge=0)):
    with db.connect() as conn:
        where, args = audit_scope(agency_id, regional_id)
        return {"total": conn.execute("SELECT count(*) FROM audit"+where,args).fetchone()[0], "entries":[dict(r) for r in conn.execute("SELECT * FROM audit"+where+" ORDER BY id DESC LIMIT ? OFFSET ?",(*args,limit,offset))]}


@app.get("/api/export")
def export_csv(year: int = Query(2026,ge=2020,le=2100), agency_id: list[int] = Query([]), product_id: list[int] = Query([]), active_only: bool = False, regional_id: list[int] = Query([])):
    with db.connect() as conn:
        stream = StringIO()
        writer = csv.writer(stream,delimiter=";")
        writer.writerow(["Ano","Regional","Agência","Código agência","Produto","Subproduto","Mês","Carteira","Segmento","Responsável","Meta agência","Percentual","Meta carteira"])
        sql = """SELECT g.year,COALESCE(rg.name,'""" + db.DEFAULT_REGIONAL + """') regional_name,ag.name agency_name,ag.code,p.name product_name,p.sub_product,p.unit,m.month,po.name portfolio_name,s.code segment,po.manager,m.amount goal_amount,a.bps,a.amount FROM allocations a JOIN goals g ON g.id=a.goal_id JOIN months m ON m.goal_id=a.goal_id AND m.month=a.month JOIN agencies ag ON ag.id=g.agency_id LEFT JOIN regionals rg ON rg.id=ag.regional_id JOIN products p ON p.id=g.product_id JOIN portfolios po ON po.id=a.portfolio_id JOIN segments s ON s.id=po.segment_id WHERE g.year=?""" + (f" AND ag.id IN ({','.join('?' * len(agency_id))})" if agency_id else "") + (f" AND ag.regional_id IN ({','.join('?' * len(regional_id))})" if regional_id else "") + (f" AND p.id IN ({','.join('?' * len(product_id))})" if product_id else "") + (" AND ag.active=1 AND po.active=1" if active_only else "") + " ORDER BY regional_name COLLATE NOCASE,ag.code,p.id,m.month,po.id"
        args = [year, *agency_id, *regional_id, *product_id]
        for r in conn.execute(sql,args):
            scale = AMOUNT_SCALE
            def safe(v):
                s = str(v)
                return "'"+s if s.startswith(("=","+","-","@","\t","\r")) else s
            writer.writerow([r["year"],safe(r["regional_name"]),safe(r["agency_name"]),r["code"],safe(r["product_name"]),safe(r["sub_product"]),r["month"],safe(r["portfolio_name"]),r["segment"],safe(r["manager"]),str(r["goal_amount"]/scale).replace(".",","),str(r["bps"]/100).replace(".",","),str(r["amount"]/scale).replace(".",",")])
        return Response(content="\ufeff"+stream.getvalue(),media_type="text/csv; charset=utf-8",headers={"Content-Disposition":f'attachment; filename="metas-{year}.csv"'})


# A produção pode servir o build React no mesmo processo da API.
@app.post("/api/annual-goals")
def save_annual_goals(body: AnnualBatch):
    with db.connect() as conn:
        # Salvar só o anual/importar zera os meses abertos; os fechados nunca são tocados.
        locked = closed_months(conn, body.year)
        if body.method == "annual" and len(locked) == 12:
            require_open(conn, body.year)
        targets = []
        seen = set()
        if body.method != "annual" and body.product_id is None:
            raise HTTPException(422, "Selecione o subproduto que deseja distribuir.")
        profile = None
        if body.method == "seasonal":
            profile = seasonality_profile(conn, body.product_id, body.year)
            if profile["revision"] == 0:
                raise HTTPException(422, "Cadastre a sazonalidade deste subproduto e ano antes de aplicar.")
            if profile["revision"] != body.profile_revision:
                raise HTTPException(409, "A sazonalidade mudou. Atualize a prévia antes de distribuir.")
        if body.method == "percent":
            if len(body.weights) != 12:
                raise HTTPException(422, "Informe os percentuais dos 12 meses.")
            percentages(body.weights)
        for entry in body.entries:
            if entry.goal_id is None:
                require_open(conn, body.year)
                agency = row(conn, "agencies", entry.agency_id)
                product = row(conn, "products", entry.product_id)
                if not agency["active"] or not product["active"]:
                    raise HTTPException(422, "Selecione agências e subprodutos ativos.")
                if entry.revision != 0 or conn.execute("SELECT 1 FROM goals WHERE agency_id=? AND product_id=? AND year=?", (entry.agency_id, entry.product_id, body.year)).fetchone():
                    raise HTTPException(409, "A meta mudou desde a importação. Carregue a planilha novamente.")
                goal = row(conn, "goals", create_goal(conn, entry.agency_id, entry.product_id, body.year))
            else:
                goal = row(conn, "goals", entry.goal_id)
                revision(goal, entry.revision)
            key = (goal["agency_id"], goal["product_id"])
            if key in seen:
                raise HTTPException(422, "Informe cada agência e subproduto apenas uma vez.")
            seen.add(key)
            if goal["year"] != body.year or (body.product_id is not None and goal["product_id"] != body.product_id):
                raise HTTPException(422, "Selecione metas do subproduto e ano informados.")
            if not row(conn, "agencies", goal["agency_id"])["active"] or not row(conn, "products", goal["product_id"])["active"]:
                raise HTTPException(422, "Selecione agências e subprodutos ativos.")
            total = to_amount(entry.annual_amount)
            targets.append((goal, total, entry.annual_amount, entry.months))
        for goal, total, amount, months in targets:
            id = goal["id"]
            if body.method == "annual" and months is not None:
                current = [m["amount"] for m in conn.execute("SELECT amount FROM months WHERE goal_id=? ORDER BY month", (id,))]
                if total != goal["annual_target"] or [to_amount(v) for v in months] != current:
                    note = annual_change_note(conn, goal, total, body.unlock_reason) or ""
                    # Cada mês que a planilha altera entra no log com o valor de antes e de depois.
                    show = lambda v: f"{v / AMOUNT_SCALE:.3f}".rstrip("0").rstrip(".")
                    diffs = [f"{MONTHS[i]} {show(before)} → {show(to_amount(after))}" for i, (before, after) in enumerate(zip(current, months)) if before != to_amount(after)]
                    if diffs:
                        note += " Importação alterou: " + "; ".join(diffs) + "."
                    conn.execute("UPDATE goals SET annual_target=? WHERE id=?", (total, id))
                    write_goal_plan(conn, id, GoalInput(revision=goal["revision"], mode="monthly", amounts=months, unlock_reason=body.unlock_reason), note=note)
            elif body.method == "annual":
                note = annual_change_note(conn, goal, total, body.unlock_reason) or ""
                before = plan_for(conn, goal["agency_id"], body.year)
                kept = {m["month"]: m["amount"] for m in conn.execute("SELECT month,amount FROM months WHERE goal_id=?", (id,)) if m["month"] in locked}
                if kept and (total < sum(kept.values()) if total >= 0 else total > sum(kept.values())):
                    raise HTTPException(422, "O total anual não pode ser menor que a soma das metas dos meses fechados.")
                open_months = [m for m in range(1, 13) if m not in locked]
                marks = ",".join("?" * len(open_months))
                conn.execute(f"UPDATE months SET amount=0,manual=0 WHERE goal_id=? AND month IN ({marks})", (id, *open_months))
                conn.execute(f"UPDATE allocations SET amount=0 WHERE goal_id=? AND month IN ({marks})", (id, *open_months))
                method = "annual_imported" if body.source == "excel" else "annual"
                missing = [m for m in json.loads(goal["missing_months"]) if m in locked]
                conn.execute("UPDATE goals SET annual_target=?,planning_method=?,seasonal_weights='[]',missing_months=?,revision=revision+1 WHERE id=?", (total, method, json.dumps(missing), id))
                detail = "Total anual salvo. Distribuição mensal a definir." + (" Meses fechados preservados." if locked else "") + note
                db.audit(conn, "import" if body.source == "excel" else "update", "goal", id, detail, goal["agency_id"], before, {"annual_amount": amount, "source": body.source, **({"unlock_reason": body.unlock_reason.strip()} if note else {})})
            else:
                weights = profile["weights"] if profile else body.weights
                write_goal_plan(conn, id, GoalInput(revision=goal["revision"], mode=body.method, annual_amount=amount, weights=weights, unlock_reason=body.unlock_reason))
        return {"saved": len(targets), "method": body.method}


@app.get("/api/annual-goals/template")
def annual_template(year: int = Query(2026, ge=2020, le=2100)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Metas anuais"
    # Regional é só uma referência para quem preenche; a importação identifica a linha pelo código da agência.
    sheet.append(["Regional", "Agência", "Produto", "Subproduto", "Ano", "Total anual"])
    with db.connect() as conn:
        for agency in conn.execute(AGENCY_SQL + " WHERE a.active=1" + AGENCY_ORDER):
            for product in conn.execute("SELECT * FROM products WHERE active=1 ORDER BY id"):
                sheet.append([agency["regional_name"], agency["code"], product["name"], product["sub_product"], year, None])
    for cell in sheet[1]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = PatternFill("solid", fgColor="105C2C")
    for column, width in [("A", 24), ("B", 20), ("C", 28), ("D", 28), ("E", 12), ("F", 22)]:
        sheet.column_dimensions[column].width = width
    sheet.freeze_panes = "A2"
    stream = BytesIO()
    workbook.save(stream)
    return Response(stream.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="modelo-metas-anuais-{year}.xlsx"'})


@app.post("/api/annual-goals/preview")
async def preview_annual_goals(year: int = Query(2026, ge=2020, le=2100), file: UploadFile = File(...)):
    from .annual_import import read_annual_workbook
    filename = (file.filename or "").lower()
    if not filename.endswith((".xlsx", ".csv")):
        raise HTTPException(422, "Envie um arquivo Excel .xlsx ou .csv usando o modelo disponível.")
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(422, "O arquivo deve ter no máximo 5 MB.")
    with db.connect() as conn:
        return read_annual_workbook(content, conn, year, csv_file=filename.endswith(".csv"))


DIST = Path(__file__).resolve().parent.parent / "dist"
if DIST.exists():
    app.mount("/assets",StaticFiles(directory=DIST / "assets"),name="assets")

    @app.get("/{path:path}",include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404,"Endpoint não encontrado.")
        candidate = (DIST / path).resolve()
        if candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
