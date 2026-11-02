export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** JSON.parse com mensagem de erro em pt-BR (linha e coluna quando o motor informa a posição). */
export function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(msg);
    if (pos) {
      const at = Number(pos[1]);
      const before = text.slice(0, at);
      const line = before.split('\n').length;
      const col = at - before.lastIndexOf('\n');
      return { ok: false, error: `JSON inválido na linha ${line}, coluna ${col}.` };
    }
    return { ok: false, error: 'JSON inválido.' };
  }
}

export function prettyJson(value: unknown): string {
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
