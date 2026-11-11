// Acceso (solo lectura) a los datos de la app actual. El código antiguo (app.js) expone un "puente" en window.FP
// y avisa con el evento "fp:change" cada vez que cambian los datos. Así React y el código viejo conviven mientras
// se migra pantalla por pantalla.
import { useEffect, useState } from 'react';
import { budgetOverview, type BudgetOverview, type CoreState } from '../core/finance';

export interface Pocket { id: number | string; name: string; amount: number; icon?: string; isCash?: boolean }
export interface Goal { id: number | string; name: string; target: number; current: number }
export interface Tx { id?: number | string; date?: string; desc?: string; amount: number | string; category: string; payCardId?: unknown }
export interface Category { id: string; label: string; icon?: string }
export interface FPState {
  currency?: string;
  pockets?: Pocket[];
  goals?: Goal[];
  budgets?: Record<string, Record<string, number | string>>;
  transactions?: Record<string, Tx[]>;
}
interface Bridge {
  getState(): FPState;
  getMonth(): string;
  getCategories(): Category[];
  isCardPayment(t: Tx): boolean;
  fmt(n: number): string;
  getIncome(): { recurring: number; extras: number; cashback: number };
  getBankInfo(): Record<string, { name: string; logo?: string; cardClass?: string }>;
  getBrandInfo(): Record<string, { name: string; logo?: string }>;
  getCutoffStatus(d: { cutoffDay?: number; balance?: number; payment?: number; id?: unknown }): unknown;
  getPaymentMethods(): Record<string, { icon: string; label: string }>;
  getMonthLabel(m: string): string;
}
declare global {
  interface Window {
    FP?: Partial<Bridge>;
    computeMonthIncome?: (s: FPState, m: string) => number;
    computeMonthExpense?: (s: FPState, m: string) => number;
    getLastNMonths?: (n: number) => string[];
  }
}

export interface MonthPoint { month: string; label: string; income: number; expense: number }
export interface CategoryRow { id: string; label: string; icon: string; spent: number; budget: number }
export interface Snapshot {
  month: string;
  pockets: Pocket[];
  goals: Goal[];
  series: MonthPoint[];
  categories: CategoryRow[];
  income: { recurring: number; extras: number; cashback: number };
  overview: BudgetOverview;
  fmt: (n: number) => string;
}

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };

export const defaultFmt = (n: number): string => '$ ' + Math.round(num(n)).toLocaleString('es-CO');

/** Cifras compactas para ejes: $ 1,5 M · $ 800 mil */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return '$ ' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e3) return '$ ' + Math.round(n / 1e3).toLocaleString('es-CO') + ' mil';
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

export function readSnapshot(): Snapshot {
  const fp = window.FP || {};
  const state: FPState = (fp.getState && fp.getState()) || {};
  const month = (fp.getMonth && fp.getMonth()) || new Date().toISOString().slice(0, 7);
  const months = window.getLastNMonths ? window.getLastNMonths(6) : [month];
  const isCard = fp.isCardPayment || ((t: Tx) => t.category === 'pago_tarjeta' || !!t.payCardId);

  const series: MonthPoint[] = months.map((m) => ({
    month: m,
    label: new Date(m + '-01T12:00:00').toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
    income: Math.round(num(window.computeMonthIncome ? window.computeMonthIncome(state, m) : 0)),
    expense: Math.round(num(window.computeMonthExpense ? window.computeMonthExpense(state, m) : 0)),
  }));

  const txs = (state.transactions && state.transactions[month]) || [];
  const budgets = (state.budgets && state.budgets[month]) || {};
  const spentBy: Record<string, number> = {};
  for (const t of txs) if (!isCard(t)) spentBy[t.category] = (spentBy[t.category] || 0) + num(t.amount);
  const cats = (fp.getCategories ? fp.getCategories() : []) as Category[];
  const known = new Set(cats.map((c) => c.id));
  const rows: CategoryRow[] = cats.map((c) => ({ id: c.id, label: c.label, icon: c.icon || '', spent: spentBy[c.id] || 0, budget: num(budgets[c.id]) }));
  for (const id of Object.keys(spentBy)) if (!known.has(id)) rows.push({ id, label: id, icon: '', spent: spentBy[id], budget: num(budgets[id]) });

  const income = (fp.getIncome && fp.getIncome()) || { recurring: 0, extras: 0, cashback: 0 };
  const overview = budgetOverview(state as unknown as CoreState, month, cats);
  return {
    month,
    pockets: (state.pockets || []).filter((p) => num(p.amount) > 0),
    goals: state.goals || [],
    series,
    categories: rows.filter((r) => r.spent > 0 || r.budget > 0).sort((a, b) => b.spent - a.spent || b.budget - a.budget),
    income,
    overview,
    fmt: fp.fmt || defaultFmt,
  };
}

/** Devuelve los datos actuales y se vuelve a dibujar cuando el código antiguo avisa de un cambio. */
export function useFP(): Snapshot {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => bump((v) => v + 1);
    window.addEventListener('fp:change', h);
    return () => window.removeEventListener('fp:change', h);
  }, []);
  return readSnapshot();
}

export const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
export const monthName = (m: string): string => {
  const t = new Date(m + '-01T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
