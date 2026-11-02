"""Lê a referência sem alterá-la e gera dados rastreáveis para a inicialização."""
import json
import sys
from pathlib import Path
import openpyxl

source = Path(sys.argv[1])
wb = openpyxl.load_workbook(source, data_only=True, read_only=True)
month_names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
sheet = wb["meta-agencia"]
rows = list(sheet.values)
headers = rows[0]
data = {"source": source.name, "agencies": [], "goals": [], "portfolios": [], "warnings": []}
agencies = {}
for row in rows[1:]:
    if not row[2]:
        continue
    raw = str(row[2])
    code, name = raw.split(" ", 1)
    if code not in agencies:
        agencies[code] = {"code": code, "name": name.replace(" PR", ""), "city": name.split(" PR")[0], "state": "PR"}
        data["agencies"].append(agencies[code])
    months = [row[headers.index(m)] if m in headers else None for m in month_names]
    total = row[headers.index("Total")]
    data["goals"].append({"agency_code": code, "year": row[1], "product": row[4], "months": months, "source_annual": total, "source_row": f"meta-agencia!B{len(data['goals'])+2}:Q{len(data['goals'])+2}"})
    if abs(sum(v or 0 for v in months) - total) > .05:
        data["warnings"].append(f"{code} · {row[4]}: soma dos meses difere do total declarado. Abril não está presente na origem.")
data["warnings"].insert(0, "A coluna Abril está ausente nas duas abas. O sistema mantém abril em zero e sinaliza revisão, sem presumir valores.")
rows = list(wb["meta-carteira"].values)
for row in rows[2:]:
    if row[4] == "Agencia" or not row[4]:
        continue
    data["portfolios"].append({"agency_code": str(row[2]).split(" ", 1)[0], "code": str(row[4]), "segment": row[5], "suggested_percent": float(row[6])*100, "percent": float(row[8])*100})
data["warnings"].append("Os totais da aba meta-carteira têm diferenças de arredondamento e somas. O sistema recalcula os valores pelas participações mensais e conserva o total da agência.")
target = Path(__file__).resolve().parent.parent / "backend" / "source_data.json"
target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Extraídos: {len(data['agencies'])} agências, {len(data['goals'])} metas, {len(data['portfolios'])} carteiras de referência. {len(data['warnings'])} avisos.")
