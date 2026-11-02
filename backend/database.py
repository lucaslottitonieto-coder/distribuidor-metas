import json
import os
import sqlite3
from datetime import datetime, timezone
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

# Quem está fazendo a requisição atual (e-mail informado pelo portal); gravado em toda alteração.
current_actor: ContextVar[str | None] = ContextVar("current_actor", default=None)

DB_PATH = Path(os.environ.get("METAS_DB_PATH", Path(__file__).parent / "data" / "metas.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#33820d', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('BRL','UN','PCT')), sub_product TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(name COLLATE NOCASE, sub_product COLLATE NOCASE));
CREATE TABLE IF NOT EXISTS templates(id INTEGER PRIMARY KEY, name TEXT NOT NULL, segment_id INTEGER NOT NULL REFERENCES segments(id), suggested_bps INTEGER NOT NULL CHECK(suggested_bps BETWEEN 0 AND 10000), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS regionals(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS agencies(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, manager TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, regional_id INTEGER REFERENCES regionals(id));
CREATE TABLE IF NOT EXISTS portfolios(id INTEGER PRIMARY KEY, agency_id INTEGER NOT NULL REFERENCES agencies(id), code TEXT NOT NULL, name TEXT NOT NULL, segment_id INTEGER NOT NULL REFERENCES segments(id), manager TEXT NOT NULL DEFAULT '', suggested_bps INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, UNIQUE(agency_id,code));
CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY, agency_id INTEGER NOT NULL REFERENCES agencies(id), product_id INTEGER NOT NULL REFERENCES products(id), year INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, source_annual INTEGER, missing_months TEXT NOT NULL DEFAULT '[]', planning_method TEXT NOT NULL DEFAULT 'imported', seasonal_weights TEXT NOT NULL DEFAULT '[]', annual_target INTEGER, UNIQUE(agency_id,product_id,year));
CREATE TABLE IF NOT EXISTS months(goal_id INTEGER NOT NULL REFERENCES goals(id), month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12), amount INTEGER NOT NULL, manual INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(goal_id,month));
CREATE TABLE IF NOT EXISTS allocations(goal_id INTEGER NOT NULL, month INTEGER NOT NULL, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), bps INTEGER NOT NULL CHECK(bps BETWEEN 0 AND 10000), amount INTEGER NOT NULL, PRIMARY KEY(goal_id,month,portfolio_id), FOREIGN KEY(goal_id,month) REFERENCES months(goal_id,month));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, agency_id INTEGER, detail TEXT NOT NULL, before_json TEXT, after_json TEXT, actor TEXT);
CREATE TABLE IF NOT EXISTS goal_versions(id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL REFERENCES goals(id), version INTEGER NOT NULL, timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), action TEXT NOT NULL, detail TEXT NOT NULL, actor TEXT, annual_amount INTEGER NOT NULL, months_json TEXT NOT NULL, portfolios_json TEXT NOT NULL, UNIQUE(goal_id,version));
CREATE INDEX IF NOT EXISTS idx_goal_versions_goal ON goal_versions(goal_id,version);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seasonality_profiles(product_id INTEGER NOT NULL REFERENCES products(id), year INTEGER NOT NULL CHECK(year BETWEEN 2020 AND 2100), weights TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(product_id,year));
CREATE TABLE IF NOT EXISTS month_closures(year INTEGER NOT NULL CHECK(year BETWEEN 2020 AND 2100), month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12), closed INTEGER NOT NULL CHECK(closed IN (0,1)), revision INTEGER NOT NULL, closed_at TEXT, closed_by TEXT, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(year,month));
"""


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        # Reserve the writer before validation, preventing concurrent stale writes.
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def audit(conn, action, entity, entity_id, detail, agency_id=None, before=None, after=None, actor=None):
    actor = actor or current_actor.get()
    conn.execute("INSERT INTO audit(action,entity,entity_id,agency_id,detail,before_json,after_json,actor) VALUES(?,?,?,?,?,?,?,?)", (action, entity, entity_id, agency_id, detail, json.dumps(before, ensure_ascii=False) if before is not None else None, json.dumps(after, ensure_ascii=False) if after is not None else None, actor))
    # Toda alteração de meta guarda também uma versão completa (total, 12 meses e carteiras).
    if entity == "goal" and entity_id:
        snapshot_goal(conn, entity_id, action, detail, actor)


def snapshot_goal(conn, goal_id, action, detail, actor=None):
    """Grava uma nova versão da meta com os valores atuais; as versões nunca são alteradas nem apagadas."""
    goal = conn.execute("SELECT annual_target FROM goals WHERE id=?", (goal_id,)).fetchone()
    if goal is None:
        return
    months = [r[0] for r in conn.execute("SELECT amount FROM months WHERE goal_id=? ORDER BY month", (goal_id,))]
    portfolios = {}
    for r in conn.execute("SELECT a.portfolio_id,p.name,a.month,a.amount FROM allocations a JOIN portfolios p ON p.id=a.portfolio_id WHERE a.goal_id=? AND p.active=1 ORDER BY a.portfolio_id,a.month", (goal_id,)):
        portfolios.setdefault(str(r["portfolio_id"]), {"name": r["name"], "amounts": [0] * 12})["amounts"][r["month"] - 1] = r["amount"]
    annual = goal["annual_target"] if goal["annual_target"] is not None else sum(months)
    version = conn.execute("SELECT COALESCE(MAX(version),0)+1 FROM goal_versions WHERE goal_id=?", (goal_id,)).fetchone()[0]
    conn.execute("INSERT INTO goal_versions(goal_id,version,action,detail,actor,annual_amount,months_json,portfolios_json) VALUES(?,?,?,?,?,?,?,?)",
                 (goal_id, version, action, detail, actor or current_actor.get(), annual, json.dumps(months), json.dumps(portfolios, ensure_ascii=False)))


def ensure_goal_versions(conn):
    """Metas que já existiam antes do controle de versões ganham uma versão inicial."""
    for goal in conn.execute("SELECT id FROM goals WHERE id NOT IN (SELECT goal_id FROM goal_versions)").fetchall():
        snapshot_goal(conn, goal["id"], "baseline", "Situação anterior ao controle de versões.")



def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    additions = {"goals": {"planning_method": "TEXT NOT NULL DEFAULT 'imported'", "seasonal_weights": "TEXT NOT NULL DEFAULT '[]'", "annual_target": "INTEGER"}, "months": {"manual": "INTEGER NOT NULL DEFAULT 0"}, "audit": {"actor": "TEXT"}}
    missing = [(table, column, definition) for table, columns in additions.items() for column, definition in columns.items() if column not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}]
    if missing:
        backup_dir = DB_PATH.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f"metas-before-matrix-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db"
        backup = sqlite3.connect(backup_path)
        conn.backup(backup)
        backup.close()
        for table, column, definition in missing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        if any(table == "goals" and column == "planning_method" for table, column, _ in missing):
            conn.execute("UPDATE goals SET planning_method='unconfigured' WHERE source_annual IS NULL")
        # Recupera a origem de edições feitas antes da inclusão dessas colunas.
        for goal_id, after_json in (conn.execute("SELECT entity_id,after_json FROM audit WHERE entity='goal' AND action='update' ORDER BY id").fetchall() if any(column == 'planning_method' for _, column, _ in missing) else []):
            try:
                after = json.loads(after_json or "{}")
            except (ValueError, TypeError):
                continue
            if not isinstance(after, dict):
                continue
            if after.get("mode") in {"monthly", "seasonal"}:
                conn.execute("UPDATE goals SET planning_method=? WHERE id=?", (after["mode"], goal_id))
        conn.commit()
    drop_publication_columns(conn)
    migrate_products(conn)
    migrate_regionals(conn)
    migrate_amount_scale(conn)
    # Segunda barreira: nenhuma rotina que grave meses/carteiras pode contornar
    # um fechamento, mesmo que seja adicionada à API no futuro.
    for table in ("months", "allocations"):
        for operation, ref in (("INSERT", "NEW"), ("UPDATE", "NEW"), ("DELETE", "OLD")):
            checks = [f"EXISTS(SELECT 1 FROM goals g JOIN month_closures c ON c.year=g.year WHERE g.id={ref}.goal_id AND c.month={ref}.month AND c.closed=1)"]
            if operation == "UPDATE":
                checks.append("EXISTS(SELECT 1 FROM goals g JOIN month_closures c ON c.year=g.year WHERE g.id=OLD.goal_id AND c.month=OLD.month AND c.closed=1)")
            conn.execute(f"CREATE TRIGGER IF NOT EXISTS freeze_{table}_{operation.lower()} BEFORE {operation} ON {table} WHEN {' OR '.join(checks)} BEGIN SELECT RAISE(ABORT, 'Período fechado: meses e distribuições protegidos.'); END")
    conn.commit()
    conn.close()
    from .seed import seed
    with connect() as conn:
        if conn.execute("SELECT count(*) FROM products").fetchone()[0] == 0:
            seed(conn)
        ensure_goal_versions(conn)


DEFAULT_REGIONAL = "Sem regional"
# Consulta base das agências: traz o nome da regional a que pertencem (regional_name).
AGENCY_SQL = f"SELECT a.*,COALESCE(r.name,'{DEFAULT_REGIONAL}') regional_name FROM agencies a LEFT JOIN regionals r ON r.id=a.regional_id"


def default_regional(conn):
    """Id da regional que recebe as agências ainda não classificadas; é criada quando não existe."""
    found = conn.execute("SELECT id FROM regionals WHERE name=?", (DEFAULT_REGIONAL,)).fetchone()
    return found[0] if found else conn.execute("INSERT INTO regionals(name) VALUES(?)", (DEFAULT_REGIONAL,)).lastrowid


def migrate_regionals(conn):
    """Leva bancos anteriores às regionais ao formato atual: toda agência pertence a uma regional.

    As agências existentes ficam na regional padrão ("Sem regional") até serem reclassificadas em
    Agências. Metas, carteiras e histórico não são alterados.
    """
    has_column = "regional_id" in {r[1] for r in conn.execute("PRAGMA table_info(agencies)")}
    if has_column and not conn.execute("SELECT 1 FROM agencies WHERE regional_id IS NULL").fetchone():
        return
    try:
        if not has_column:
            backup_dir = DB_PATH.parent / "backups"
            backup_dir.mkdir(exist_ok=True)
            backup = sqlite3.connect(backup_dir / f"metas-before-regional-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db")
            try:
                conn.backup(backup)
            finally:
                backup.close()
            conn.execute("ALTER TABLE agencies ADD COLUMN regional_id INTEGER REFERENCES regionals(id)")
        moved = conn.execute("UPDATE agencies SET regional_id=? WHERE regional_id IS NULL", (default_regional(conn),)).rowcount
        if moved:
            audit(conn, "update", "regional", None, f"Regionais habilitadas: {moved} {'agência foi associada' if moved == 1 else 'agências foram associadas'} à regional \"{DEFAULT_REGIONAL}\". Informe a regional de cada agência em Agências.")
        conn.commit()
    except Exception:
        conn.rollback()
        raise


AMOUNT_SCALE_VERSION = 1


def migrate_amount_scale(conn):
    """Passa os valores das metas para milésimos (3 casas) e libera valores negativos.

    Antes: reais e percentual em centavos (x100), quantidade em inteiros (x1). Agora todas as
    unidades usam x1000, então os valores existentes são multiplicados por 10 (R$ e %) ou por
    1000 (quantidade) e o resultado exibido não muda. As restrições "valor >= 0" fazem parte da
    definição das tabelas, que são recriadas. Roda uma única vez (PRAGMA user_version), com cópia
    em backups/ quando já há metas.
    """
    if conn.execute("PRAGMA user_version").fetchone()[0] >= AMOUNT_SCALE_VERSION:
        return
    if conn.execute("SELECT 1 FROM goals LIMIT 1").fetchone():
        backup_dir = DB_PATH.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup = sqlite3.connect(backup_dir / f"metas-before-3-decimais-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db")
        try:
            conn.backup(backup)
        finally:
            backup.close()
    factor = "CASE p.unit WHEN 'UN' THEN 1000 ELSE 10 END"
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("CREATE TABLE goals_new(id INTEGER PRIMARY KEY, agency_id INTEGER NOT NULL REFERENCES agencies(id), product_id INTEGER NOT NULL REFERENCES products(id), year INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, source_annual INTEGER, missing_months TEXT NOT NULL DEFAULT '[]', planning_method TEXT NOT NULL DEFAULT 'imported', seasonal_weights TEXT NOT NULL DEFAULT '[]', annual_target INTEGER, UNIQUE(agency_id,product_id,year))")
        conn.execute(f"INSERT INTO goals_new(id,agency_id,product_id,year,revision,source_annual,missing_months,planning_method,seasonal_weights,annual_target) SELECT g.id,g.agency_id,g.product_id,g.year,g.revision,g.source_annual*({factor}),g.missing_months,g.planning_method,g.seasonal_weights,g.annual_target*({factor}) FROM goals g JOIN products p ON p.id=g.product_id")
        conn.execute("CREATE TABLE months_new(goal_id INTEGER NOT NULL REFERENCES goals(id), month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12), amount INTEGER NOT NULL, manual INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(goal_id,month))")
        conn.execute(f"INSERT INTO months_new(goal_id,month,amount,manual) SELECT m.goal_id,m.month,m.amount*({factor}),m.manual FROM months m JOIN goals g ON g.id=m.goal_id JOIN products p ON p.id=g.product_id")
        conn.execute("CREATE TABLE allocations_new(goal_id INTEGER NOT NULL, month INTEGER NOT NULL, portfolio_id INTEGER NOT NULL REFERENCES portfolios(id), bps INTEGER NOT NULL CHECK(bps BETWEEN 0 AND 10000), amount INTEGER NOT NULL, PRIMARY KEY(goal_id,month,portfolio_id), FOREIGN KEY(goal_id,month) REFERENCES months(goal_id,month))")
        conn.execute(f"INSERT INTO allocations_new(goal_id,month,portfolio_id,bps,amount) SELECT a.goal_id,a.month,a.portfolio_id,a.bps,a.amount*({factor}) FROM allocations a JOIN goals g ON g.id=a.goal_id JOIN products p ON p.id=g.product_id")
        for table in ("allocations", "months", "goals"):
            conn.execute(f"DROP TABLE {table}")
        for table in ("goals", "months", "allocations"):
            conn.execute(f"ALTER TABLE {table}_new RENAME TO {table}")
        if conn.execute("PRAGMA foreign_key_check").fetchone():
            raise sqlite3.IntegrityError("Referências inválidas após migração dos valores.")
        conn.execute(f"PRAGMA user_version={AMOUNT_SCALE_VERSION}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def drop_publication_columns(conn):
    """Remove goals.status e months.confirmed: a meta não passa mais por rascunho, validação mensal e publicação.

    Bancos criados antes dessa mudança são ajustados uma única vez, com cópia em backups/.
    Valores, percentuais, carteiras e histórico não são alterados.
    """
    legacy = [(table, column) for table, column in (("goals", "status"), ("months", "confirmed")) if column in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}]
    if not legacy:
        return
    backup_dir = DB_PATH.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    backup = sqlite3.connect(backup_dir / f"metas-before-no-plans-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db")
    try:
        conn.backup(backup)
    finally:
        backup.close()
    for table, column in legacy:
        conn.execute(f"ALTER TABLE {table} DROP COLUMN {column}")
    conn.commit()


def migrate_products(conn):
    """Leva bancos antigos ao formato atual: unidade percentual e subproduto (antes "categoria").

    O subproduto é a linha que recebe meta, sazonalidade e distribuição por carteira; o
    produto (name) agrupa os subprodutos. Os ids são preservados, então metas e
    distribuições existentes continuam ligadas ao mesmo registro.
    """
    schema = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").fetchone()[0]
    legacy_label = "sub_product" not in {r[1] for r in conn.execute("PRAGMA table_info(products)")}
    if "'PCT'" in schema and not legacy_label:
        return
    backup_dir = DB_PATH.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    reason = "percent" if "'PCT'" not in schema else "subproduct"
    backup = sqlite3.connect(backup_dir / f"metas-before-{reason}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}.db")
    try:
        conn.backup(backup)
    finally:
        backup.close()
    # SQLite requires rebuilding the CHECK/UNIQUE constraints with foreign keys disabled.
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("CREATE TABLE products_new(id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('BRL','UN','PCT')), sub_product TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(name COLLATE NOCASE, sub_product COLLATE NOCASE))")
        conn.execute(f"INSERT INTO products_new(id,name,unit,sub_product,active) SELECT id,name,unit,{'category' if legacy_label else 'sub_product'},active FROM products")
        conn.execute("DROP TABLE products")
        conn.execute("ALTER TABLE products_new RENAME TO products")
        if conn.execute("PRAGMA foreign_key_check").fetchone():
            raise sqlite3.IntegrityError("Referências inválidas após migração dos produtos.")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")
