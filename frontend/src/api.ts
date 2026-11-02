import { formatGoal, compactGoal, type Unit } from './units';
// Cada agência pertence a uma regional; `regional_name` vem junto para exibir a hierarquia Regional > Agência.
export type Regional = { id: number; name: string; active: number };
export type Agency = { id: number; code: string; name: string; regional_id: number; regional_name: string; city: string; state: string; manager: string; active: number };
// Cada registro é um subproduto: recebe a meta e é distribuído nas carteiras. `name` é o produto que o agrupa.
export type Product = { id: number; name: string; sub_product: string; unit: Unit; active: number };
export type Segment = { id: number; code: string; name: string; color: string; active: number };
export type Template = { id?: number; name: string; segment_id: number; suggested_percent: number };
export type Portfolio = { id: number; agency_id: number; code: string; name: string; manager: string; segment_id: number; segment_name: string; segment_code: string; color: string; suggested_percent: number; active: number; agency_name?: string; agency_code?: string; regional_id?: number; regional_name?: string };
export type MonthClosure = { year: number; month: number; closed: number; revision: number; closed_at: string | null; closed_by: string | null; updated_at: string | null; updated_by: string | null; reason: string };
export type ClosureData = { year: number; months: MonthClosure[]; total: number; entries: Audit[] };
export type Bootstrap = { closures: MonthClosure[]; regionals: Regional[]; agencies: Agency[]; products: Product[]; segments: Segment[]; templates: Template[]; years: number[]; goal_years?: number[]; import_report: { source: string; warnings: string[]; agencies: number; goals: number; portfolios: number } | null };
export type Goal = { id: number; product_id: number; product_name: string; sub_product: string; unit: Unit; revision: number; annual_amount: number; annual_pending: boolean; source_annual: number | null; missing_months: number[]; planning_method: string; seasonal_weights: number[]; manual_months: number; months: { month: number; amount: number; manual: number; closed: boolean }[] };
export type PortfolioPlan = Portfolio & { months: { month: number; amount: number; percent: number }[] };
export type MatrixRow = { agency: Agency; goal: Goal; portfolios: PortfolioPlan[] };
export type PlanningMatrix = { year: number; rows: MatrixRow[]; goals_without_portfolios: number };
export type SeasonalityProfile = { product_id: number; year: number; revision: number; weights: number[] };
export type SeasonalityData = { year: number; profiles: SeasonalityProfile[] };
export type Plan = { agency: Agency; year: number; portfolios: Portfolio[]; goals: Goal[] };
export type Allocation = { goal_id: number; revision: number; month: number; closed: boolean; unit: Unit; total: number; entries: { portfolio_id: number; percent: number; amount: number }[]; portfolios: Portfolio[] };
export type Audit = { id: number; timestamp: string; action: string; entity: string; entity_id: number; detail: string; actor: string | null; before_json: string | null; after_json: string | null };
export type AgencySummary = Agency & { portfolios: number; goals: number; loaded: number; currency_total: number; missing: number };
export type Dashboard = { year: number; agencies: AgencySummary[]; products: (Product & { total: number; monthly: number[]; loaded: number; goals: number })[]; total_goals: number; loaded_goals: number; currency_total: number; portfolio_count: number; audit: Audit[] };

const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const apiUrl = (path: string) => `${API}${path}`;
export async function api<T>(path: string, data?: unknown, method = 'GET'): Promise<T> {
  const response = await fetch(apiUrl(path), { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined });
  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail)) message = 'Revise os campos obrigatórios e os formatos informados.';
    } catch { /* Mantém a mensagem legível em erros de rede/proxy. */ }
    throw new Error(message);
  }
  return response.json();
}

export const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const shortMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const number = (v: number, digits = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const money = formatGoal;
export const compact = compactGoal;
export const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro. Tente novamente.';
export { apportion } from './math';
