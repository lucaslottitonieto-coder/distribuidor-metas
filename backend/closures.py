"""Fechamentos globais por ano/mês, sempre validados na transação de escrita."""
from fastapi import HTTPException

from .domain import apportion

MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


def closed_months(conn, year):
    return {r[0] for r in conn.execute("SELECT month FROM month_closures WHERE year=? AND closed=1", (year,))}


def require_open(conn, year, months=range(1, 13)):
    blocked = closed_months(conn, year).intersection(months)
    if blocked:
        names = ", ".join(MONTHS[m - 1] for m in sorted(blocked))
        raise HTTPException(409, f"{names} de {year}: período fechado. Reabra o mês em Parametrizações > Fechamentos para alterá-lo.")


def protect_catalog(conn, condition="1=1", args=()):
    # Cadastros compartilhados também mudariam os rótulos, unidades ou a
    # composição de relatórios históricos. Só podem mudar após a reabertura.
    blocked = conn.execute("SELECT c.year,c.month FROM month_closures c JOIN goals g ON g.year=c.year WHERE c.closed=1 AND " + condition + " LIMIT 1", args).fetchone()
    if blocked:
        require_open(conn, blocked["year"], [blocked["month"]])


def distribute_open(total, weights, original, closed, step=1):
    """Reserva o realizado fechado e distribui o saldo pelos pesos abertos.

    Com `step` > 1 cada mês recebe múltiplos inteiros do passo (ex.: reais cheios, sem centavos quebrados): o saldo é
    dividido em passos pelos maiores restos e o que sobra do passo (só quando o total tem casas decimais) vai para
    o último mês aberto com peso, de modo que a soma continua igual ao total.
    """
    remaining = total - sum(original[i - 1] for i in closed)
    # Só um total anual negativo pode deixar saldo negativo para os meses abertos.
    if remaining < 0 <= total:
        raise HTTPException(422, "O total anual não pode ser menor que a soma das metas dos meses fechados.")
    opened = [i for i in range(1, 13) if i not in closed]
    if not opened:
        raise HTTPException(409, "Todos os meses deste ano estão fechados.")
    open_weights = [weights[i - 1] for i in opened]
    if remaining and not sum(open_weights):
        raise HTTPException(422, "Informe peso maior que zero em pelo menos um mês aberto para distribuir o saldo anual.")
    result = list(original)
    if step > 1:
        sign = -1 if remaining < 0 else 1
        units, leftover = divmod(abs(remaining), step)
        parts = [value * step * sign for value in apportion(units, open_weights)]
        if leftover:
            parts[max(i for i, w in enumerate(open_weights) if w)] += leftover * sign
    else:
        parts = apportion(remaining, open_weights)
    for month, value in zip(opened, parts):
        result[month - 1] = value
    return result


def closure_for(conn, year, month):
    saved = conn.execute("SELECT * FROM month_closures WHERE year=? AND month=?", (year, month)).fetchone()
    return dict(saved) if saved else {"year": year, "month": month, "closed": 0, "revision": 0, "closed_at": None, "closed_by": None, "updated_at": None, "updated_by": None, "reason": ""}
