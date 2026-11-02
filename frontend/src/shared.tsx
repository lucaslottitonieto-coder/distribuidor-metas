import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Badge, Button, ErrorState, Select, Spinner } from 'broto-ui';
import { ArrowUpRight, ChevronRight, Search } from 'lucide-react';
import { errorText, type Agency, type Product } from './api';
import { useApp } from './context';
import './regional.css';

export function PageHead({ title, description, actions }: { title?: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div>{title&&<h1>{title}</h1>}{description&&<p>{description}</p>}</div><div className="heading-actions">{actions}</div></div>;
}
export function Loading() { return <div className="loading"><Spinner /><span>Carregando as metas...</span></div>; }
export function Failure({ error, retry }: { error: unknown; retry: () => void }) { return <ErrorState error={errorText(error)} onRetry={retry} />; }
/** Opções de um <select> de subprodutos, agrupadas pelo produto a que pertencem. */
export function SubproductOptions({ products, suffix }: { products: Pick<Product, 'id' | 'name' | 'sub_product' | 'unit'>[]; suffix?: (p: Pick<Product, 'unit'>) => string }) {
  const groups = new Map<string, typeof products>();
  products.forEach(p => groups.set(p.name, [...(groups.get(p.name) || []), p]));
  return <>{[...groups].map(([name, list]) => <optgroup key={name} label={name}>{list.map(p => <option key={p.id} value={p.id}>{p.sub_product}{suffix ? suffix(p) : ''}</option>)}</optgroup>)}</>;
}
export type SearchOption = { value: number; label: string; group?: string };
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Lista suspensa com busca: o campo mostra a opção atual e, ao digitar, filtra sem diferenciar acentos nem maiúsculas. O valor 0 é a opção "todas". */
export function SearchSelect({ id, value, onChange, options, allLabel, label, placeholder = 'Digite para pesquisar' }: { id?: string; value: number; onChange: (value: number) => void; options: SearchOption[]; allLabel: string; label?: string; placeholder?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const all: SearchOption[] = [{ value: 0, label: allLabel }, ...options];
  const current = all.find(o => o.value === value) ?? all[0];
  const q = fold((query ?? '').trim());
  const shown = q ? all.filter(o => fold(`${o.group ?? ''} ${o.label}`).includes(q)) : all;
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open, query]);
  const show = () => { if (!open) { setActive(Math.max(0, all.findIndex(o => o.value === current.value))); setOpen(true); } };
  const close = () => { setOpen(false); setQuery(null); };
  const choose = (o: SearchOption) => { onChange(o.value); close(); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(a => Math.min(shown.length - 1, Math.max(0, a + step)));
    } else if (e.key === 'Enter' && open) { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
  };
  return <div className="search-select">
    <Search size={15} className="search-select-icon" aria-hidden />
    <input id={inputId} className="bt-select" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label={label} aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].value}` : undefined}
      autoComplete="off" spellCheck={false} placeholder={placeholder} value={query ?? current.label}
      onFocus={e => { e.currentTarget.select(); show(); }} onClick={show} onBlur={close} onKeyDown={onKey}
      onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} />
    {open && <ul id={listId} ref={list} className="search-select-list" role="listbox" onMouseDown={e => e.preventDefault()}>
      {shown.length === 0 && <li className="search-select-empty" role="presentation">Nenhum resultado</li>}
      {shown.map((o, i) => <li key={o.value} role="presentation">
        {o.group && o.group !== shown[i - 1]?.group && <div className="search-select-group">{o.group}</div>}
        <div id={`${listId}-${o.value}`} role="option" aria-selected={o.value === current.value} data-active={i === active} className="search-select-option" onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>{o.label}</div>
      </li>)}
    </ul>}
  </div>;
}
/** Como o SearchSelect, mas com caixa de seleção em cada opção: a lista fica aberta enquanto se marca. Sem nada marcado vale "todas" (`values` vazio). */
export function SearchMultiSelect({ id, values, onChange, options, allLabel, plural, label, placeholder = 'Digite para pesquisar' }: { id?: string; values: number[]; onChange: (values: number[]) => void; options: SearchOption[]; allLabel: string; plural: string; label?: string; placeholder?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const q = fold((query ?? '').trim());
  // A opção "todas" some durante a busca: ali só aparecem as opções que casam com o texto.
  const shown: SearchOption[] = q ? options.filter(o => fold(`${o.group ?? ''} ${o.label}`).includes(q)) : [{ value: 0, label: allLabel }, ...options];
  const checked = (o: SearchOption) => o.value === 0 ? values.length === 0 : values.includes(o.value);
  const summary = values.length === 0 ? allLabel : values.length === 1 ? options.find(o => o.value === values[0])?.label ?? allLabel : `${values.length} ${plural}`;
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open, query]);
  const show = () => { if (!open) { setActive(0); setOpen(true); } };
  const close = () => { setOpen(false); setQuery(null); };
  const toggle = (o: SearchOption) => onChange(o.value === 0 ? [] : values.includes(o.value) ? values.filter(v => v !== o.value) : [...values, o.value]);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(a => Math.min(shown.length - 1, Math.max(0, a + step)));
    } else if (e.key === 'Enter' && open) { e.preventDefault(); if (shown[active]) toggle(shown[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
  };
  return <div className="search-select">
    <Search size={15} className="search-select-icon" aria-hidden />
    <input id={inputId} className="bt-select" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label={label} aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].value}` : undefined}
      autoComplete="off" spellCheck={false} placeholder={placeholder} value={query ?? summary}
      onFocus={e => { e.currentTarget.select(); show(); }} onClick={show} onBlur={close} onKeyDown={onKey}
      onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} />
    {open && <ul id={listId} ref={list} className="search-select-list" role="listbox" aria-multiselectable="true" onMouseDown={e => e.preventDefault()}>
      {shown.length === 0 && <li className="search-select-empty" role="presentation">Nenhum resultado</li>}
      {shown.map((o, i) => <li key={o.value} role="presentation">
        {o.group && o.group !== shown[i - 1]?.group && <div className="search-select-group">{o.group}</div>}
        <div id={`${listId}-${o.value}`} role="option" aria-selected={checked(o)} data-active={i === active} className="search-select-option search-multi-option" onMouseEnter={() => setActive(i)} onClick={() => toggle(o)}>
          <input type="checkbox" className="bt-checkbox" checked={checked(o)} readOnly tabIndex={-1} aria-hidden />{o.label}
        </div>
      </li>)}
    </ul>}
  </div>;
}
/** Situação das metas de uma agência ou subproduto: sem valor carregado, com mês a revisar ou completas. */
export function GoalBadge({ loaded, missing = false }: { loaded: boolean; missing?: boolean }) {
  return <Badge tone={missing ? 'pending' : loaded ? 'success' : 'neutral'}>{missing ? 'Revisar metas' : loaded ? 'Metas carregadas' : 'A carregar'}</Badge>;
}
export function ArrowLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick} iconRight={<ArrowUpRight size={15} />}>{children}</Button>; }
/** Agências de uma regional (0 = todas), na ordem do cadastro: regional e, dentro dela, código. */
export const agenciesOf = <T extends Pick<Agency, 'regional_id'>>(agencies: T[], regional: number) => regional ? agencies.filter(a => a.regional_id === regional) : agencies;
/** Regionais com ao menos uma agência: as únicas que fazem sentido como filtro. */
export function useRegionals() { const { data } = useApp(); return data.regionals.filter(r => data.agencies.some(a => a.regional_id === r.id)); }
/** Filtros Regional > Agência. Ao trocar de regional, a agência escolhida é limpa se não pertencer a ela. */
export function useRegionalAgency(initialRegional = 0, initialAgency = 0) {
  const { data } = useApp();
  const [regional, setRegionalValue] = useState(initialRegional);
  const [agency, setAgency] = useState(initialAgency);
  const setRegional = (id: number) => { setRegionalValue(id); if (id && agency && data.agencies.find(a => a.id === agency)?.regional_id !== id) setAgency(0); };
  return { regional, agency, setRegional, setAgency };
}
export function RegionalSelect({ id, value, onChange, label = 'Filtrar por regional' }: { id?: string; value: number; onChange: (id: number) => void; label?: string }) {
  const regionals = useRegionals();
  return <Select id={id} aria-label={label} value={value} onChange={e => onChange(Number(e.target.value))}><option value={0}>Todas as regionais</option>{regionals.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>;
}
/** Opções de agência de um <select>, agrupadas pela regional a que pertencem. */
export function AgencyOptions({ agencies, text = a => `${a.code} · ${a.name}` }: { agencies: Agency[]; text?: (a: Agency) => string }) {
  const groups = new Map<string, Agency[]>();
  agencies.forEach(a => groups.set(a.regional_name, [...(groups.get(a.regional_name) || []), a]));
  return <>{[...groups].map(([name, list]) => <optgroup key={name} label={name}>{list.map(a => <option key={a.id} value={a.id}>{text(a)}</option>)}</optgroup>)}</>;
}
/** Regional da agência, em letras pequenas acima do nome dela. */
export function RegionalTag({ name }: { name?: string }) { return name ? <small className="regional-tag">{name}</small> : null; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><div className="empty-symbol"><ChevronRight size={28} /></div><h3>{title}</h3>{children}</div>; }
