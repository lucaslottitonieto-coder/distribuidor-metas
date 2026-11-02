"""Regras de negócio. Percentuais em pontos-base; valores em milésimos (3 casas) para qualquer unidade."""
from decimal import Decimal, InvalidOperation
from fastapi import HTTPException

# Metas (R$, quantidade e %) são guardadas como inteiros em milésimos; podem ser negativas.
AMOUNT_SCALE = 1000


def numeric(value, scale=100, signed=False):
    """Converte para inteiro na escala. Percentuais de distribuição (scale 100) nunca são negativos."""
    digits = len(str(scale)) - 1
    try:
        d = Decimal(str(value))
        if not d.is_finite() or (d < 0 and not signed) or d * scale != (d * scale).to_integral_value():
            raise ValueError()
        result = int(d * scale)
        if abs(result) > 9_000_000_000_000_000:
            raise ValueError()
        return result
    except (ValueError, InvalidOperation, TypeError):
        raise HTTPException(422, f"Informe um número {'' if signed else 'positivo ou zero '}com até {digits} casas decimais.")


def amount(value):
    """Valor de meta: aceita negativos e até 3 casas decimais."""
    return numeric(value, AMOUNT_SCALE, signed=True)


def percentages(values):
    bps = [numeric(v) for v in values]
    if any(v > 10000 for v in bps) or sum(bps) != 10000:
        total = sum(bps) / 100
        raise HTTPException(422, f"A distribuição deve fechar em 100%. Total informado: {total:g}%. Diferença: {(10000 - sum(bps)) / 100:g}%.")
    return bps


def apportion(total, weights):
    """Maiores restos: conserva o total sem perder milésimos. Totais negativos são distribuídos pelo valor absoluto."""
    if not weights:
        return []
    if total < 0:
        return [-v for v in apportion(-total, weights)]
    denominator = sum(weights)
    if denominator == 0:
        return [0] * len(weights)
    if denominator < 0:
        weights, denominator = [-w for w in weights], -denominator
    result = [total * w // denominator for w in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(total * weights[i] % denominator), i))
    for i in order[:total - sum(result)]:
        result[i] += 1
    return result


def apportion_whole(total, weights, step=AMOUNT_SCALE):
    """Como apportion, mas em múltiplos inteiros de `step` (reais cheios). O que sobra do passo vai para o maior peso."""
    if step <= 1 or not weights:
        return apportion(total, weights)
    if total < 0:
        return [-v for v in apportion_whole(-total, weights, step)]
    units, leftover = divmod(total, step)
    parts = [v * step for v in apportion(units, weights)]
    if leftover and sum(weights) > 0:
        parts[weights.index(max(weights))] += leftover
    return parts


def equal_weights(n):
    return apportion(10000, [1] * n)
