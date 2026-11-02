/** Distribui inteiros por maiores restos, com multiplicação exata em BigInt. */
export function apportion(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || weights.some(w=>!Number.isSafeInteger(w)||w<0)) throw new Error('Valores fora da precisão permitida.');
  // Total negativo: distribui o valor absoluto e devolve o sinal (igual à API).
  if (total < 0) return apportion(-total, weights).map(v => v === 0 ? 0 : -v);
  const denominator = weights.reduce((a,b)=>a+BigInt(b),0n);
  if (!denominator) return weights.map(()=>0);
  const products = weights.map(w=>BigInt(total)*BigInt(w));
  const values = products.map(p=>Number(p/denominator));
  const order = products.map((p,i)=>({i,remainder:p%denominator})).sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
  const remainder = total-values.reduce((a,b)=>a+b,0);
  for(let i=0;i<remainder;i++) values[order[i].i]++;
  return values;
}

/** Como `apportion`, mas em múltiplos inteiros do passo (reais cheios); a sobra do passo vai para o maior peso, como na API. */
export function apportionWhole(total: number, weights: number[], step = 1): number[] {
  if (step <= 1 || !weights.length) return apportion(total, weights);
  if (total < 0) return apportionWhole(-total, weights, step).map(value => value === 0 ? 0 : -value);
  const units = Math.floor(total / step), leftover = total - units * step;
  const parts = apportion(units, weights).map(value => value * step);
  if (leftover && weights.some(weight => weight > 0)) parts[weights.indexOf(Math.max(...weights))] += leftover;
  return parts;
}

/**
 * Mesma reserva dos meses fechados usada na API, incluindo o arredondamento. Com `step` > 1 cada mês recebe
 * múltiplos inteiros do passo (reais cheios) e o que sobra do passo vai para o último mês aberto com peso.
 */
export function apportionOpen(total: number, weights: number[], original: number[], closed: Set<number>, step = 1): number[] | null {
  if (!Number.isSafeInteger(total) || weights.length !== 12 || original.length !== 12 || weights.some(w => !Number.isSafeInteger(w) || w < 0)) return null;
  const remaining = total - original.reduce((sum, value, i) => sum + (closed.has(i + 1) ? value : 0), 0);
  const opened = original.map((_, i) => i).filter(i => !closed.has(i + 1));
  const openWeights = opened.map(i => weights[i]);
  // Só um total anual negativo pode deixar saldo negativo para os meses abertos.
  if ((remaining < 0 && total >= 0) || !opened.length || (remaining > 0 && !openWeights.some(Boolean))) return null;
  const result = [...original];
  let parts: number[];
  if (step > 1) {
    const sign = remaining < 0 ? -1 : 1, units = Math.floor(Math.abs(remaining) / step), leftover = Math.abs(remaining) - units * step;
    parts = apportion(units, openWeights).map(value => value * step * sign || 0);
    if (leftover) parts[openWeights.map(Boolean).lastIndexOf(true)] += leftover * sign;
  } else parts = apportion(remaining, openWeights);
  parts.forEach((value, i) => { result[opened[i]] = value; });
  return result;
}

/**
 * Compara em milésimos para não exceder o planejado por arredondamento. Com meta anual negativa os
 * meses não podem ser mais negativos que o planejado; `balance` é sempre o que ainda cabe (>= 0 é válido).
 */
export function monthlyBudget(annual: number, amounts: number[], scale: number) {
  const planned = Math.round(annual * scale);
  const minor = amounts.map(value => Math.round(value * scale));
  const total = minor.reduce((sum, value) => sum + value, 0);
  const balance = planned >= 0 ? planned - total : total - planned;
  const valid = amounts.length === 12 && Number.isSafeInteger(planned) &&
    Number.isSafeInteger(total) && amounts.every((value, i) => Number.isFinite(value) &&
      Number.isSafeInteger(minor[i]) && Math.abs(value * scale - minor[i]) < .00001);
  return { total: total / scale, balance: balance / scale, valid: valid && balance >= 0 };
}
