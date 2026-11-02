"""Leitura e conferência do Excel anual, sem gravar dados na prévia."""
import csv
from io import BytesIO, StringIO
import re
import unicodedata
from zipfile import ZipFile

from fastapi import HTTPException
from openpyxl import load_workbook
from .database import AGENCY_SQL
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from .closures import MONTHS, closed_months
from .domain import AMOUNT_SCALE, amount as to_amount


def normalized(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(value or "")) if not unicodedata.combining(c)).lower().strip().split())


def agency_code(value):
    code = str(value or "").strip()
    # O CSV exportado pela tela traz "código nome" na mesma célula.
    named = re.match(r"(\d+)\s+\S", code)
    if named:
        code = named.group(1)
    return str(int(code.split(".")[0])) if re.fullmatch(r"\d+(?:\.0)?", code) else code.lower()


MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
# O arquivo exportado traz o nome completo do mês; a planilha modelo usa a abreviação.
MONTH_NAMES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def parse_amount(raw):
    """Valor da planilha em pt-BR ou número: aceita negativos e arredonda para 3 casas decimais."""
    if isinstance(raw, bool):
        raise ValueError("Informe um valor numérico.")
    if isinstance(raw, str):
        raw = raw.strip().replace("R$", "").replace(" ", "").replace("−", "-")
        if "," in raw:
            raw = raw.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+", raw):
            raw = raw.replace(".", "")
    try:
        value = Decimal(str(raw))
        if not value.is_finite():
            raise InvalidOperation()
        rounded = value.quantize(Decimal(1) / AMOUNT_SCALE, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Informe um número com até 3 casas decimais.")
    return to_amount(rounded) / AMOUNT_SCALE


def csv_rows(content):
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252")
    first_line = text.split("\n", 1)[0]
    return csv.reader(StringIO(text), delimiter=max(";,\t", key=first_line.count))


def read_annual_workbook(content, conn, year, csv_file=False):
    workbook = None
    try:
        if csv_file:
            rows = csv_rows(content)
        else:
            with ZipFile(BytesIO(content)) as archive:
                if sum(i.file_size for i in archive.infolist()) > 25 * 1024 * 1024:
                    raise ValueError()
            workbook = load_workbook(BytesIO(content), read_only=True, data_only=False)
            sheet = workbook.active
            rows = sheet.iter_rows(values_only=True)
        header = [normalized(v) for v in next(rows, ())]
        # O subproduto é o nível da meta. A coluna Produto é opcional e só desambigua nomes repetidos.
        # No CSV exportado pela tela não há coluna Ano (vale o ano selecionado) e a coluna Distribuição
        # identifica as linhas de regional ("3 agências"), que são somas e não entram na importação.
        aliases = {"agency": ["agencia", "codigo agencia", "codigo da agencia"], "subproduct": ["subproduto", "sub produto", "sub_produto", "tipo"], "year": ["ano"], "total": ["total anual", "total ano", "total do ano", "meta anual"], "product": ["produto"], "distribution": ["distribuicao"], "revision": ["versao da meta"]}
        optional = {"product", "distribution", "revision"} | ({"year"} if csv_file else set())
        indexes = {}
        for key, names in aliases.items():
            matches = [i for i, label in enumerate(header) if label in names]
            if len(matches) > 1 or (len(matches) == 0 and key not in optional):
                raise HTTPException(422, "Use uma única coluna para Agência, Subproduto, Ano e Total anual, conforme o modelo. A coluna Produto é opcional.")
            if matches:
                indexes[key] = matches[0]
        # Jan–Dez só valem juntos: com os 12 meses na planilha, os valores mensais também são importados.
        month_columns = [[i for i, label in enumerate(header) if label in (name, full)] for name, full in zip(MONTH_LABELS, MONTH_NAMES)]
        month_indexes = [m[0] for m in month_columns] if all(len(m) == 1 for m in month_columns) else None
        agencies = {}
        for a in conn.execute(AGENCY_SQL + " WHERE a.active=1"):
            agencies.setdefault(agency_code(a["code"]), []).append(dict(a))
        subproducts = {}
        for p in conn.execute("SELECT * FROM products WHERE active=1"):
            subproducts.setdefault(normalized(p["sub_product"]), []).append(dict(p))
        closed = closed_months(conn, year)
        entries, errors, seen = [], [], set()
        for line, values in enumerate(rows, 2):
            if line > 5001:
                raise HTTPException(422, "A planilha pode conter no máximo 5.000 linhas de dados.")
            if not any(v is not None for v in values):
                continue
            value = lambda key: values[indexes[key]] if key in indexes and indexes[key] < len(values) else None
            # Linhas sem total são deixadas em branco no modelo e ignoradas; zero é uma meta explícita.
            if value("total") is None or str(value("total")).strip() in {"", "—"}:
                continue
            if re.match(r"\d+ agencias?\b", normalized(value("distribution"))):
                continue
            try:
                if any(isinstance(value(k), str) and value(k).startswith("=") for k in indexes):  # inclui Produto, se houver
                    raise ValueError("Substitua fórmulas por valores antes de importar.")
                if "year" in indexes and str(value("year")) not in {str(year), f"{year}.0"}:
                    raise ValueError(f"O ano precisa ser {year}, selecionado na tela.")
                matches = agencies.get(agency_code(value("agency")), [])
                if len(matches) != 1:
                    raise ValueError("Código de agência inexistente, inativo ou ambíguo.")
                agency = matches[0]
                candidates = subproducts.get(normalized(value("subproduct")), [])
                if normalized(value("product")):
                    candidates = [p for p in candidates if normalized(p["name"]) == normalized(value("product"))]
                if not candidates:
                    raise ValueError("Subproduto inexistente ou inativo. Use os nomes do cadastro.")
                if len(candidates) > 1:
                    raise ValueError("Este subproduto existe em mais de um produto. Preencha também a coluna Produto.")
                product = candidates[0]
                key = (agency["id"], product["id"])
                if key in seen:
                    raise ValueError("Agência e subproduto repetidos na planilha.")
                seen.add(key)
                scale = AMOUNT_SCALE
                total = parse_amount(value("total"))
                goal = conn.execute("SELECT * FROM goals WHERE agency_id=? AND product_id=? AND year=?", (*key, year)).fetchone()
                months, changed, month_changes = None, [], []
                # Total já informado é travado: trocá-lo exige motivo, que a tela pede antes de importar.
                current_total = (goal["annual_target"] if goal["annual_target"] is not None else conn.execute("SELECT COALESCE(SUM(amount),0) FROM months WHERE goal_id=?", (goal["id"],)).fetchone()[0]) if goal else 0
                locked_change = current_total != 0 and current_total != round(total * scale)
                if month_indexes:
                    cells = [values[i] if i < len(values) else None for i in month_indexes]
                    if any(isinstance(c, str) and c.startswith("=") for c in cells):
                        raise ValueError("Substitua fórmulas por valores antes de importar.")
                    blank = [c is None or str(c).strip() in {"", "—"} for c in cells]
                    # Meses em branco ou "—" (meta ainda a distribuir) mantêm só o total anual, como no modelo.
                    if not all(blank):
                        if any(blank):
                            raise ValueError("Preencha os 12 meses ou deixe todos em branco.")
                        months = [parse_amount(c) for c in cells]
                        months_sum, planned = round(sum(months) * scale), round(total * scale)
                        # Total negativo: os meses não podem ser mais negativos que o planejado.
                        if months_sum > planned if planned >= 0 else months_sum < planned:
                            raise ValueError("A soma dos meses ultrapassa o total anual.")
                        current = {m["month"]: m["amount"] for m in conn.execute("SELECT month,amount FROM months WHERE goal_id=?", (goal["id"],))} if goal else {}
                        changed = [i for i, amount in enumerate(months, 1) if round(amount * scale) != current.get(i, 0)]
                        month_changes = [{"month": i, "before": current.get(i, 0) / scale, "after": months[i - 1]} for i in changed]
                        blocked = [MONTHS[i - 1] for i in changed if i in closed]
                        if blocked:
                            raise ValueError(f"{', '.join(blocked)}: período fechado, mas a planilha altera o valor. Volte ao valor do sistema ou reabra o mês em Parametrizações > Fechamentos.")
                # Exportações da tela trazem a versão da meta. Se a meta mudou no sistema depois da exportação,
                # aplicar a planilha sobrescreveria um ajuste mais novo, então a linha é travada.
                raw_revision = value("revision") if "revision" in indexes else None
                if goal and raw_revision is not None and str(raw_revision).strip() not in {"", "—"}:
                    try:
                        file_revision = int(float(str(raw_revision).strip()))
                    except ValueError:
                        raise ValueError("A coluna Versão da meta precisa ser um número. Exporte o arquivo novamente.")
                    if file_revision != goal["revision"] and (changed or locked_change or current_total != round(total * scale)):
                        raise ValueError("A meta mudou no sistema depois que este arquivo foi exportado (versão " + str(file_revision) + ", agora " + str(goal["revision"]) + "). Exporte novamente e refaça a alteração para não sobrescrever o ajuste mais novo.")
                entries.append({"line": line, "goal_id": goal["id"] if goal else None, "revision": goal["revision"] if goal else 0, "agency_id": agency["id"], "product_id": product["id"], "agency_code": agency["code"], "agency_name": agency["name"], "regional_name": agency["regional_name"], "product_name": product["name"], "sub_product": product["sub_product"], "unit": product["unit"], "annual_amount": total, "months": months, "changed_months": changed, "month_changes": month_changes, "locked_change": locked_change})
            except (ValueError, HTTPException) as error:
                errors.append(f"Linha {line}: {error.detail if isinstance(error, HTTPException) else error}")
        if not entries and not errors:
            errors.append("Preencha pelo menos um total anual na planilha.")
        return {"year": year, "entries": entries, "errors": errors}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "Não foi possível ler o arquivo. Use um .xlsx ou .csv válido com as colunas do modelo.")
    finally:
        if workbook is not None:
            workbook.close()
