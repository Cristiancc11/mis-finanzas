// Núcleo de cálculos de FinanzasPro: funciones PURAS (sin DOM, sin estado global) y con pruebas automáticas
// (src/core/finance.test.ts). La app antigua las usa a través de window.FPCore y las islas React las importan directo.
// Así cada fórmula vive en UN solo lugar y se puede verificar sin abrir un navegador.

type Rec = Record<string, unknown>;
export interface AmountItem { amount?: number | string; frequency?: string; [k: string]: unknown }
export interface TxLike { amount?: number | string | null; cashback?: number | string | null; category?: string; payCardId?: unknown; date?: string; desc?: string; [k: string]: unknown }
export interface CoreState {
  incomes?: AmountItem[];
  monthlyIncomes?: Record<string, AmountItem[]>;
  extraIncomes?: Record<string, AmountItem[]>;
  transactions?: Record<string, TxLike[]>;
  budgets?: Record<string, Record<string, number | string>>;
  customCategories?: { id: string; isPagoTarjeta?: boolean }[];
  pockets?: { id?: unknown; name?: string; amount?: number | string }[];
  debts?: { id?: unknown; name?: string; balance?: number | string; payment?: number | string; cutoffDay?: number | string; rate?: number | string; cashbackPercent?: number | string }[];
  goals?: { id?: unknown; name?: string; target?: number | string; current?: number | string }[];
  [k: string]: unknown;
}

/** Número seguro: texto numérico → número; NaN/Infinity/null → 0. */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}
const sum = (items: AmountItem[] | undefined, key = 'amount'): number => (items || []).reduce((s, i) => s + num(i[key]), 0);

export const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Últimos n meses (YYYY-MM) terminando en el mes de `now`. */
export function lastNMonths(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}
/** Los n meses anteriores a `month`, del más reciente al más antiguo. */
export function previousMonths(month: string, n: number): string[] {
  const [y, m] = month.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(monthKey(new Date(y, m - 1 - i, 1)));
  return out;
}

// ---------------------------------------------------------------- gastos e ingresos por mes
/** ¿La transacción es un pago de tarjeta? (transferencia interna: NO es un gasto real) */
export function isCardPayment(state: CoreState, t: TxLike): boolean {
  if (!t) return false;
  if (t.payCardId) return true;
  if (t.category === 'pago_tarjeta') return true;
  const cat = (state.customCategories || []).find((c) => c.id === t.category);
  return !!(cat && cat.isPagoTarjeta);
}
/** Gasto real de un mes (excluye pagos de tarjeta). */
export function monthExpense(state: CoreState, month: string): number {
  return ((state.transactions || {})[month] || []).filter((t) => !isCardPayment(state, t)).reduce((s, t) => s + num(t.amount), 0);
}
export function monthCashback(state: CoreState, month: string): number {
  return ((state.transactions || {})[month] || []).reduce((s, t) => s + num(t.cashback), 0);
}
export function monthExtraIncome(state: CoreState, month: string): number { return sum((state.extraIncomes || {})[month]); }

/** ¿El mes tiene algún movimiento registrado (gastos, ingresos extra o foto de ingresos)? */
export function monthHasActivity(state: CoreState, month: string): boolean {
  return ((state.transactions || {})[month] || []).length > 0
    || ((state.extraIncomes || {})[month] || []).length > 0
    || !!(state.monthlyIncomes || {})[month];
}
const monthlyTemplates = (state: CoreState): number => (state.incomes || []).filter((i) => i.frequency === 'monthly').reduce((s, i) => s + num(i.amount), 0);

/** Ingresos recurrentes de un mes. Un mes PASADO sin registros vale 0 (antes se rellenaba con las plantillas y
 *  aparecían ingresos "fantasma" —y 100 % de ahorro— en meses anteriores a usar la app). */
export function monthRecurringIncome(state: CoreState, month: string, now: Date = new Date()): number {
  const snap = (state.monthlyIncomes || {})[month];
  if (snap) return sum(snap);
  if (month >= monthKey(now) || monthHasActivity(state, month)) return monthlyTemplates(state);
  return 0;
}
/** Ingreso total de un mes: recurrentes + extras + cashback. */
export function monthIncome(state: CoreState, month: string, now: Date = new Date()): number {
  return monthRecurringIncome(state, month, now) + monthExtraIncome(state, month) + monthCashback(state, month);
}
export const budgetTotal = (state: CoreState, month: string): number =>
  Object.values((state.budgets || {})[month] || {}).reduce<number>((s, v) => s + num(v), 0);

// ---------------------------------------------------------------- base de gasto y proyecciones
/** Gasto mensual "típico" para mirar hacia el futuro. El gasto del mes en curso hasta hoy es parcial y a principios de
 *  mes casi no existe, lo que inflaba "cuántos meses cubre tu fondo", el ahorro anual y el puntaje de salud.
 *  Con historial: el mayor entre lo gastado y el promedio de hasta 3 meses anteriores con gasto.
 *  Sin historial: el mayor entre lo gastado y el presupuesto. */
export function expenseBaseline(state: CoreState, month: string): number {
  const spent = monthExpense(state, month);
  const prev = previousMonths(month, 3).map((m) => monthExpense(state, m)).filter((v) => v > 0);
  if (prev.length > 0) return Math.max(spent, prev.reduce((a, b) => a + b, 0) / prev.length);
  return Math.max(spent, budgetTotal(state, month));
}
/** Ingreso mensual "típico" para mirar hacia el futuro. Si hay ingresos recurrentes: recurrentes + cashback (los extras
 *  de una sola vez no se proyectan). Si todo es ocasional (p. ej. freelance): promedio de hasta 3 meses anteriores con
 *  ingresos; y si tampoco hay historial, lo que haya entrado este mes. `recurring` lo calcula la app para el mes que se ve. */
export function incomeBaseline(state: CoreState, month: string, recurring: number, now: Date = new Date()): number {
  if (recurring > 0) return recurring + monthCashback(state, month);
  const prev = previousMonths(month, 3).map((m) => monthIncome(state, m, now)).filter((v) => v > 0);
  if (prev.length > 0) return prev.reduce((a, b) => a + b, 0) / prev.length;
  return monthIncome(state, month, now);
}
export const coverageMonths = (savings: number, monthlyExpense: number): number | null => (monthlyExpense > 0 ? savings / monthlyExpense : null);

export interface Annual { income: number; expense: number; savings: number; netWorthIn12: number }
/** Proyección anual. El ingreso anual NO multiplica por 12 los extras de una sola vez. */
export function annualProjection(recurringIncome: number, monthlyExpense: number, netWorth: number): Annual {
  const savings = (recurringIncome - monthlyExpense) * 12;
  return { income: recurringIncome * 12, expense: monthlyExpense * 12, savings, netWorthIn12: netWorth + savings };
}

/** Puntaje de salud financiera 0–100 (misma rúbrica de siempre; ahora recibe el gasto típico en lugar del parcial). */
export function healthScore(i: { savings: number; income: number; monthlyExpense: number; debt: number; balance: number; pocketCount: number }): number {
  let s = 50;
  if (i.monthlyExpense > 0) {
    const m = i.savings / i.monthlyExpense;
    if (m >= 6) s += 25; else if (m >= 3) s += 18; else if (m >= 1) s += 8; else s -= 5;
  } else if (i.savings > 0) s += 10;
  if (i.income > 0) {
    const r = (i.balance / i.income) * 100;
    if (r >= 20) s += 15; else if (r >= 10) s += 10; else if (r >= 0) s += 3; else s -= 15;
  }
  if (i.savings > i.debt) s += 10;
  if (i.debt === 0 || (i.income > 0 && i.debt / i.income < 0.5)) s += 5;
  if (i.pocketCount >= 3) s += 5;
  return Math.max(0, Math.min(100, s));
}

// ---------------------------------------------------------------- tarjetas y fechas
export const daysInMonth = (year: number, month0: number): number => new Date(year, month0 + 1, 0).getDate();
/** Fecha con el día ajustado al último día del mes (corte día 31 en abril → 30; día 30 en febrero → 28/29). */
export function clampedDate(year: number, month0: number, day: number): Date {
  const y = new Date(year, month0, 1); // normaliza month0 fuera de 0..11
  const d = Math.min(Math.max(1, Math.floor(num(day)) || 1), daysInMonth(y.getFullYear(), y.getMonth()));
  return new Date(y.getFullYear(), y.getMonth(), d);
}
/** Próxima fecha de corte (hoy cuenta si el corte es hoy) y días calendario que faltan. */
export function nextCutoff(cutoffDay: number, now: Date = new Date()): { date: Date; daysLeft: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let date = clampedDate(now.getFullYear(), now.getMonth(), cutoffDay);
  if (today > date) date = clampedDate(now.getFullYear(), now.getMonth() + 1, cutoffDay);
  return { date, daysLeft: Math.round((date.getTime() - today.getTime()) / 86400000) };
}
export const utilization = (balance: number, limit: number): number => (limit > 0 ? (balance / limit) * 100 : 0);

/** Reparte `total` en `n` partes enteras que suman EXACTAMENTE `total` (el redondeo ya no pierde ni regala pesos). */
export function splitEqual(total: number, n: number): number[] {
  if (n <= 0) return [];
  const t = Math.round(total);
  const base = Math.floor(t / n);
  const rem = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

// ---------------------------------------------------------------- rendimientos
export const UVT_2026 = 52374;
export interface Returns {
  dailyGross: number; annualGross: number; monthlyGross: number; monthlyTax: number; annualTax: number;
  monthlyNet: number; annualNet: number; withholding: boolean; netAnnualRate: number; project: (months: number) => number;
}
/** Rendimiento de ahorros a tasa E.A. con retención del 7 % (sobre el total) si el rendimiento diario supera 0,055 UVT.
 *  `monthlyContribution`: aporte mensual (al final de cada mes) usado por `project`. */
export function returnsProjection(principal: number, annualRatePct: number, monthlyContribution = 0, uvt = UVT_2026): Returns | null {
  const r = num(annualRatePct) / 100;
  const p = num(principal);
  if (r === 0 || p === 0) return null;
  const annualGross = p * r;
  const dailyGross = annualGross / 365;
  const withholding = dailyGross > uvt * 0.055;
  const monthlyTax = withholding ? dailyGross * 30 * 0.07 : 0;
  const annualTax = withholding ? dailyGross * 365 * 0.07 : 0;
  const monthlyGross = p * (Math.pow(1 + r, 1 / 12) - 1);
  const annualNet = annualGross - annualTax;
  const netAnnualRate = annualNet / p;
  const eM = Math.pow(1 + netAnnualRate, 1 / 12) - 1;
  const project = (months: number): number => { let b = p; for (let i = 0; i < months; i++) b = b * (1 + eM) + monthlyContribution; return b; };
  return { dailyGross, annualGross, monthlyGross, monthlyTax, annualTax, monthlyNet: monthlyGross - monthlyTax, annualNet, withholding, netAnnualRate, project };
}

// ---------------------------------------------------------------- presupuesto del mes nuevo
/** Presupuesto para un mes que aún no tiene: copia el del mes anterior más reciente con valores (antes arrancaba en cero
 *  y había que reescribirlo completo cada mes). Si no hay ninguno, usa `defaults`. Solo para el mes actual o futuros. */
export function budgetForNewMonth(state: CoreState, month: string, defaults: Record<string, number>): Record<string, number | string> {
  const budgets = state.budgets || {};
  const earlier = Object.keys(budgets).filter((m) => m < month && Object.values(budgets[m] || {}).reduce<number>((s, v) => s + num(v), 0) > 0).sort();
  const src = earlier.length ? budgets[earlier[earlier.length - 1]] : defaults;
  return { ...src };
}

// ---------------------------------------------------------------- calidad de datos
const numFields = (obj: Rec | undefined, keys: string[]): number => {
  let fixes = 0;
  if (!obj) return 0;
  for (const k of keys) {
    if (k in obj && typeof obj[k] !== 'number') {
      const fixed = num(obj[k]);
      if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') fixes++;
      obj[k] = fixed;
    } else if (typeof obj[k] === 'number' && !Number.isFinite(obj[k] as number)) { obj[k] = 0; fixes++; }
  }
  return fixes;
};
/** Corrige datos mal guardados: números como texto ("1500"), NaN/Infinity, colecciones ausentes. Modifica el objeto y
 *  devuelve cuántos valores corrigió (0 = los datos ya estaban bien). */
export function sanitizeState(state: CoreState): { fixes: number } {
  let fixes = 0;
  const s = state as Rec & CoreState;
  for (const k of ['pockets', 'debts', 'goals', 'incomes'] as const) if (!Array.isArray(s[k])) { s[k] = []; }
  for (const k of ['budgets', 'transactions', 'extraIncomes', 'monthlyIncomes'] as const) if (!s[k] || typeof s[k] !== 'object') { (s as Rec)[k] = {}; }
  (s.pockets || []).forEach((p) => { fixes += numFields(p as Rec, ['amount']); });
  (s.debts || []).forEach((d) => { fixes += numFields(d as Rec, ['balance', 'payment', 'rate', 'cutoffDay', 'cashbackPercent']); });
  (s.goals || []).forEach((g) => { fixes += numFields(g as Rec, ['target', 'current']); });
  (s.incomes || []).forEach((i) => { fixes += numFields(i as Rec, ['amount']); });
  for (const m of Object.keys(s.monthlyIncomes || {})) (s.monthlyIncomes![m] || []).forEach((i) => { fixes += numFields(i as Rec, ['amount']); });
  for (const m of Object.keys(s.extraIncomes || {})) (s.extraIncomes![m] || []).forEach((i) => { fixes += numFields(i as Rec, ['amount']); });
  for (const m of Object.keys(s.transactions || {})) (s.transactions![m] || []).forEach((t) => { fixes += numFields(t as Rec, ['amount', 'cashback', 'totalAmount']); });
  for (const m of Object.keys(s.budgets || {})) fixes += numFields(s.budgets![m] as Rec, Object.keys(s.budgets![m] || {}));
  return { fixes };
}

export interface DataIssue { code: string; level: 'warn' | 'info'; message: string }
/** Revisión de calidad de los datos para mostrar avisos útiles (no modifica nada). */
export function auditState(state: CoreState, month: string, now: Date = new Date()): DataIssue[] {
  const issues: DataIssue[] = [];
  const neg = (state.pockets || []).filter((p) => num(p.amount) < 0);
  if (neg.length) issues.push({ code: 'pocket-negative', level: 'warn', message: `El bolsillo "${neg[0].name}"${neg.length > 1 ? ` y ${neg.length - 1} más están` : ' está'} en negativo. Revisa si falta registrar un ingreso o un traslado.` });
  const over = (state.debts || []).filter((d) => num(d.payment) > 0 && num(d.balance) > num(d.payment));
  if (over.length) issues.push({ code: 'card-over-limit', level: 'warn', message: `La tarjeta "${over[0].name}" muestra un saldo mayor a su cupo. Revisa el saldo o el cupo configurado.` });
  if (month >= monthKey(now) && budgetTotal(state, month) === 0 && monthExpense(state, month) > 0) {
    issues.push({ code: 'no-budget', level: 'info', message: 'Ya registras gastos este mes pero no definiste presupuesto. Ve a Presupuesto → Configurar para ver tu avance por categoría.' });
  }
  const seen = new Map<string, number>();
  let dups = 0;
  for (const t of (state.transactions || {})[month] || []) {
    if (isCardPayment(state, t)) continue;
    const k = `${t.date}|${String(t.desc || '').trim().toLowerCase()}|${num(t.amount)}`;
    seen.set(k, (seen.get(k) || 0) + 1);
    if (seen.get(k) === 2) dups++;
  }
  if (dups) issues.push({ code: 'possible-duplicates', level: 'info', message: `Hay ${dups} ${dups === 1 ? 'movimiento repetido' : 'movimientos repetidos'} este mes (misma fecha, descripción y monto). Si no es a propósito, elimina el duplicado.` });
  return issues;
}
