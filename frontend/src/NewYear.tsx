import { useState, type ChangeEvent } from 'react';
import { Badge, Button, Card, Checkbox, Field, Input, Select, toast } from 'broto-ui';
import { CalendarPlus } from 'lucide-react';
import { api, errorText, number } from './api';
import { useApp, useRemote } from './context';

type Started = { year: number; agencies: number; goals: number; copied_from: number | null; percentages: boolean; seasonality: number; values: boolean };
type Overview = { expected: number; years: { year: number; goals: number; agencies: number; loaded: number; closed_months: number }[] };

/** Parametrizações › Anos: situação de cada ano e o formulário para iniciar um novo, escolhendo o que reaproveitar do ano anterior. */
export default function YearsSettings({ initialYear = 0 }: { initialYear?: number }) {
  const { tick, refresh } = useApp();
  const remote = useRemote<Overview>('/years', tick);
  const [target, setTarget] = useState<number | null>(initialYear || null);
  const listed = remote.data?.years ?? [];
  const started = listed.filter(y => y.goals > 0).map(y => y.year);
  // O ano seguinte ao último iniciado aparece sempre, para iniciar com um clique.
  const next = started.length ? Math.max(...started) + 1 : 0;
  const years = next && !listed.some(y => y.year === next) ? [...listed, { year: next, goals: 0, agencies: 0, loaded: 0, closed_months: 0 }] : listed;
  const suggested = target ?? (started.length ? Math.max(...started) + 1 : new Date().getFullYear());
  const expected = remote.data?.expected ?? 0;

  return <div className="years-settings">
    <Card title="Anos das metas" subtitle="Cada ano tem as suas metas. Inicie o ano seguinte reaproveitando só o que você escolher do anterior." flush>
      <div className="table-scroll"><table className="app-table"><caption className="sr-only">Situação de cada ano</caption>
        <thead><tr><th>Ano</th><th>Situação</th><th className="numeric">Metas</th><th className="numeric">Com valor</th><th className="numeric">Meses fechados</th><th /></tr></thead>
        <tbody>{years.map(y => {
          const missing = Math.max(0, expected - y.goals);
          const tone = y.goals === 0 ? 'neutral' : missing ? 'pending' : 'success';
          return <tr key={y.year}>
            <th scope="row">{y.year}</th>
            <td><Badge tone={tone}>{y.goals === 0 ? 'Não iniciado' : missing ? `Faltam ${missing} ${missing === 1 ? 'meta' : 'metas'}` : 'Completo'}</Badge></td>
            <td className="numeric">{y.goals ? `${number(y.goals)} de ${number(expected)}` : '—'}</td>
            <td className="numeric">{y.goals ? number(y.loaded) : '—'}</td>
            <td className="numeric">{y.closed_months} de 12</td>
            <td className="numeric">{(y.goals === 0 || missing > 0) && <Button size="sm" onClick={() => setTarget(y.year)}>{y.goals === 0 ? 'Iniciar' : 'Completar'}</Button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </Card>
    <NewYearCard key={suggested} initialYear={suggested} started={started} onDone={() => { setTarget(null); refresh(); }} />
  </div>;
}

function NewYearCard({ initialYear, started, onDone }: { initialYear: number; started: number[]; onDone: () => void }) {
  const { data, refresh, setYear } = useApp();
  const [year, setYearText] = useState(String(initialYear));
  const target = Number(year);
  const valid = Number.isInteger(target) && target >= 2020 && target <= 2100;
  const sources = started.filter(y => y !== target).sort((a, b) => b - a);
  const best = sources.find(y => y < target) ?? sources[0] ?? 0;
  const [chosen, setChosen] = useState<number | null>(null);
  const copyFrom = chosen !== null && (chosen === 0 || sources.includes(chosen)) ? chosen : best;
  // Marcado: repete o que o ano de origem tinha. Desmarcado: parte do cadastro atual.
  const [reuse, setReuse] = useState({ products: true, segments: true, portfolios: true, regionals: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exists = started.includes(target);
  const toggle = (key: keyof typeof reuse) => (e: ChangeEvent<HTMLInputElement>) => setReuse(r => ({ ...r, [key]: e.target.checked }));

  const create = async () => {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<Started>('/years', {
        year: target, copy_from: copyFrom || null,
        reuse_products: reuse.products, reuse_segments: reuse.segments, keep_percentages: reuse.portfolios, reuse_regionals: reuse.regionals,
        // A sazonalidade acompanha o ano de origem; só os valores de meta começam zerados.
        keep_seasonality: true, keep_values: false,
      }, 'POST');
      toast.success(`Metas de ${result.year} criadas`, `${result.goals} ${result.goals === 1 ? 'meta' : 'metas'} em ${result.agencies} ${result.agencies === 1 ? 'agência' : 'agências'}, com os valores zerados.`);
      refresh(); setYear(result.year); onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const box = (key: keyof typeof reuse, title: string, count: number) => <Checkbox key={key} checked={reuse[key] && !!copyFrom} disabled={!copyFrom || busy} onChange={toggle(key)} label={`${title} (${count})`} />;

  return <Card title="Iniciar um ano" subtitle="Os valores de meta por agência e por carteira começam zerados. O resto você escolhe se repete o ano de origem.">
    <form className="new-year-form" onSubmit={e => { e.preventDefault(); void create(); }}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="new-year-row">
        <Field label="Ano a iniciar" required hint={valid ? undefined : 'Informe um ano entre 2020 e 2100.'}><Input type="number" min={2020} max={2100} step={1} value={year} disabled={busy} onChange={e => { setYearText(e.target.value); setChosen(null); }} /></Field>
        <Field label="Reaproveitar do ano">
          <Select aria-label="Ano de origem" value={copyFrom} disabled={busy || !sources.length} onChange={e => setChosen(Number(e.target.value))}>
            {sources.map(y => <option key={y} value={y}>{y}</option>)}
            <option value={0}>Nenhum · começar do cadastro</option>
          </Select>
        </Field>
      </div>
      {exists && <p className="form-hint">{target} já tem metas. Só serão criadas as que faltam (agências ou subprodutos novos).</p>}
      <fieldset className="new-year-options" disabled={busy}>
        <legend>Reaproveitar{copyFrom ? ` de ${copyFrom}` : ''}</legend>
        {box('products', 'Produtos de metas', data.products.length)}
        {box('segments', 'Segmentos', data.segments.length)}
        {box('portfolios', 'Carteiras padrão', data.templates.length)}
        {box('regionals', 'Regionais', data.regionals.length)}
      </fieldset>
      <div className="new-year-actions"><Button type="submit" variant="primary" icon={<CalendarPlus size={16} />} loading={busy} disabled={!valid}>Criar {valid ? target : 'ano'}</Button></div>
    </form>
  </Card>;
}
