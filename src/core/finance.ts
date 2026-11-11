// Núcleo de cálculos de FinanzasPro: funciones PURAS (sin DOM, sin estado global) y con pruebas automáticas
// (src/core/finance.test.ts). La app antigua las usa a través de window.FPCore y las islas React las importan directo.
// Así cada fórmula vive en UN solo lugar y se puede verificar sin abrir un navegador.

type Rec = Record<string, unknown>;
export interface AmountItem { amount?: number | string; frequency?: string; [k: string]: unknown }
export interface InstallmentInfo { groupId?: unknown; total?: number; originalTotal?: number; cuotaAmount?: number; interestRate?: number; hasInterest?: boolean }
export interface TxLike { cardId?: unknown; installment?: InstallmentInfo; amount?: number | string | null; cashback?: number | string | null; category?: string; payCardId?: unknown; date?: string; desc?: string; [k: string]: unknown }
export interface CoreState {
  incomes?: AmountItem[];
  monthlyIncomes?: Record<string, AmountItem[]>;
  extraIncomes?: Record<string, AmountItem[]>;
  transactions?: Record<string, TxLike[]>;
  budgets?: Record<string, Record<string, number | string>>;
  customCategories?: { id: string; isPagoTarjeta?: boolean }[];
  pockets?: { id?: unknown; name?: string; amount?: number | string }[];
  debts?: { id?: unknown; name?: string; canPrepayInstallments?: boolean; balance?: number | string; payment?: number | string; cutoffDay?: number | string; rate?: number | string; cashbackPercent?: number | string }[];
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

// ---------------------------------------------------------------- compras a cuotas
/** Cuota mensual (sistema francés). Con tasa 0 es total ÷ n. `ratePct` es la tasa MENSUAL en %. */
export function installmentPayment(total: number, n: number, ratePct: number): number {
  const r = num(ratePct) / 100;
  if (n <= 0) return 0;
  if (r === 0) return total / n;
  const pow = Math.pow(1 + r, n);
  return (total * r * pow) / (pow - 1);
}
/** Montos de cada cuota (enteros). Antes cada cuota se redondeaba por separado y la suma podía no coincidir con lo
 *  comprado (100.000 en 3 cuotas sumaban 99.999). Ahora la ÚLTIMA absorbe el redondeo: sin interés la suma es EXACTAMENTE
 *  el total; con interés es la cuota exacta × n redondeada. */
export function installmentAmounts(total: number, n: number, ratePct: number): number[] {
  if (n <= 0) return [];
  const exact = installmentPayment(total, n, ratePct);
  const payable = num(ratePct) === 0 ? Math.round(total) : Math.round(exact * n);
  const each = Math.round(exact);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : payable - each * (n - 1)));
}
/** Capital que todavía se debe después de pagar `paid` cuotas (valor presente de las cuotas restantes). Es la parte del
 *  saldo de la tarjeta que sigue "bloqueada" por la compra a cuotas; con interés es MENOR que la suma de las cuotas
 *  pendientes (esa suma incluye intereses que nunca estuvieron en el saldo). */
export function installmentOutstandingPrincipal(total: number, n: number, ratePct: number, paid: number): number {
  if (n <= 0) return 0;
  const k = Math.min(Math.max(0, Math.floor(paid)), n);
  const r = num(ratePct) / 100;
  if (r === 0) return (total * (n - k)) / n;
  const a = Math.pow(1 + r, n);
  return (total * (a - Math.pow(1 + r, k))) / (a - 1);
}

// ---------------------------------------------------------------- cuotas por tarjeta
export interface InstallmentGroup {
  groupId: unknown; desc: string; originalTotal: number; totalCuotas: number; cuotaAmount: number; interestRate: number; hasInterest: boolean;
  cuotasPaid: number; cuotasPending: number; currentIndex: number; currentMonthCuota: number; pendingAmount: number;
  outstandingNow: number; lockedAfterThisMonth: number; finished: boolean;
}
export interface CardInstallments {
  groups: InstallmentGroup[];       // solo las ACTIVAS (con cuotas por pagar)
  finished: InstallmentGroup[];     // compras a cuotas ya cumplidas
  blockedByInstallments: number;    // suma nominal de cuotas pendientes (incluye intereses)
  currentMonthInstallmentSum: number;
  futureLockedPrincipal: number;    // capital que sigue bloqueado DESPUÉS de la cuota de este mes
  outstandingNowTotal: number;      // capital que aún falta, incluida la cuota de este mes
  hasInstallments: boolean;         // hay al menos una compra a cuotas ACTIVA
}
/** Compras a cuotas de una tarjeta. Una cuota cuenta como pagada si su mes ya pasó. Una compra cuyas cuotas ya pasaron todas
 *  está TERMINADA: no se muestra como activa, no bloquea cupo y su contador se limita al total (antes salía "Cuota 5/4"). */
export function cardInstallments(state: CoreState, cardId: unknown, now: Date = new Date()): CardInstallments {
  const cur = monthKey(now);
  const map = new Map<unknown, InstallmentGroup>();
  for (const m of Object.keys(state.transactions || {}).sort()) {
    for (const t of (state.transactions![m] || [])) {
      const ins = t.installment;
      if (t.cardId !== cardId || !ins || !ins.groupId) continue;
      let g = map.get(ins.groupId);
      if (!g) {
        g = { groupId: ins.groupId, desc: String(t.desc || '').replace(/ \(cuota \d+\/\d+\)$/, ''), originalTotal: num(ins.originalTotal), totalCuotas: num(ins.total),
          cuotaAmount: num(ins.cuotaAmount), interestRate: num(ins.interestRate), hasInterest: !!ins.hasInterest, cuotasPaid: 0, cuotasPending: 0,
          currentIndex: 1, currentMonthCuota: 0, pendingAmount: 0, outstandingNow: 0, lockedAfterThisMonth: 0, finished: false };
        map.set(ins.groupId, g);
      }
      const txMonth = String(t.date || '').substring(0, 7);
      if (txMonth < cur) g.cuotasPaid++;
      else {
        g.cuotasPending++;
        const real = num(t.amount) || num(ins.cuotaAmount);   // monto real de ESA cuota (la última puede diferir por redondeo)
        g.pendingAmount += real;
        if (txMonth === cur) g.currentMonthCuota += real;
      }
    }
  }
  const all = [...map.values()];
  for (const g of all) {
    g.finished = g.cuotasPending === 0;
    g.currentIndex = g.totalCuotas > 0 ? Math.min(g.cuotasPaid + 1, g.totalCuotas) : g.cuotasPaid + 1;
    g.outstandingNow = g.finished ? 0 : installmentOutstandingPrincipal(g.originalTotal, g.totalCuotas, g.interestRate, g.cuotasPaid);
    g.lockedAfterThisMonth = g.finished ? 0 : installmentOutstandingPrincipal(g.originalTotal, g.totalCuotas, g.interestRate, g.cuotasPaid + (g.currentMonthCuota > 0 ? 1 : 0));
  }
  const groups = all.filter((g) => !g.finished);
  return {
    groups, finished: all.filter((g) => g.finished),
    blockedByInstallments: groups.reduce((a, g) => a + g.pendingAmount, 0),
    currentMonthInstallmentSum: groups.reduce((a, g) => a + g.currentMonthCuota, 0),
    futureLockedPrincipal: groups.reduce((a, g) => a + g.lockedAfterThisMonth, 0),
    outstandingNowTotal: groups.reduce((a, g) => a + g.outstandingNow, 0),
    hasInstallments: groups.length > 0,
  };
}

export interface CupoBreakdown { used: number; locked: number; optimizable: number; free: number; lockedPct: number; optimizablePct: number; freePct: number; inconsistent: boolean }
/** Capital de las cuotas que YA se pagó por adelantado: lo que el calendario original aún debería y el saldo real ya no tiene.
 *  (Si el saldo del banco es menor que el capital pendiente del calendario, la diferencia son abonos a capital.) */
export const prepaidCapital = (outstandingNowTotal: number, balance: number): number => Math.max(0, num(outstandingNowTotal) - num(balance));

/** Desglose del cupo: usado = saldo; el capital bloqueado por cuotas NUNCA puede pasar de lo usado (antes la barra mostraba
 *  4,09 M "bloqueados" con solo 2,2 M usados). Si el capital pendiente de las cuotas supera el saldo, `inconsistent` avisa:
 *  el saldo registrado no incluye todo el capital de las compras a cuotas. */
export function cupoBreakdown(limit: number, balance: number, lockedRaw: number, canPrepay = false): CupoBreakdown {
  const L = Math.max(0, num(limit));
  const used = Math.max(0, num(balance));
  const locked = canPrepay ? 0 : Math.min(Math.max(0, num(lockedRaw)), used);   // si el banco deja adelantar las cuotas, todo el saldo es pagable
  const optimizable = used - locked;
  const lockedPct = L > 0 ? Math.min(100, (locked / L) * 100) : 0;
  const optimizablePct = L > 0 ? Math.min(100 - lockedPct, (optimizable / L) * 100) : 0;
  return { used, locked, optimizable, free: Math.max(0, L - used), lockedPct, optimizablePct, freePct: Math.max(0, 100 - lockedPct - optimizablePct), inconsistent: !canPrepay && num(lockedRaw) > used + 1 };
}

// ---------------------------------------------------------------- saldos al editar un movimiento
/** Saldo de tarjeta después de revertir un cargo viejo y aplicar uno nuevo. El recorte en cero se hace UNA sola vez, al final:
 *  antes se recortaba al revertir y, si ya habías pagado parte de la tarjeta, editar cualquier compra subía el saldo de más. */
export function cardBalanceAfterEdit(balance: number, oldCharge: number, newCharge: number): number {
  return Math.max(0, num(balance) - num(oldCharge) + num(newCharge));
}

/** Lo que cada persona YA pagó de un gasto compartido: deudas pagadas completas + abonos parciales de las no pagadas. */
export function paidByPerson(debts: { txId?: unknown; name?: string; amount?: number | string; paid?: boolean; payments?: { amount?: number | string }[] }[], txId: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of debts || []) {
    if (d.txId !== txId || !d.name) continue;
    const got = d.paid ? num(d.amount) : (d.payments || []).reduce((s, p) => s + num(p.amount), 0);
    if (got > 0) out[d.name] = (out[d.name] || 0) + got;
  }
  return out;
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

// ---------------------------------------------------------------- presupuesto: categorías y KPIs
export type BudgetTone = 'over' | 'warn' | 'ok' | 'tracking';
export interface BudgetRow {
  id: string; label: string; icon: string; budget: number; spent: number; available: number;
  hasBudget: boolean; pct: number; realPct: number; tone: BudgetTone; barWidth: number;
}
export interface BudgetOverview {
  rows: BudgetRow[];                                  // ordenadas por urgencia
  totalBudget: number; totalSpent: number; available: number;
  counts: { over: number; warn: number; ok: number };
}
/** Presupuesto vs gasto real por categoría de un mes (misma lógica que la pantalla Presupuesto, ahora pura y con pruebas).
 *  Las filas se ordenan por urgencia: excedidas, cerca del límite, bajo control y sin límite; dentro de cada grupo, mayor % primero.
 *  Los pagos de tarjeta no cuentan como gasto. */
export function budgetOverview(state: CoreState, month: string, categories: { id: string; label: string; icon?: string }[]): BudgetOverview {
  const budget = (state.budgets || {})[month] || {};
  const txs = (state.transactions || {})[month] || [];
  const counts = { over: 0, warn: 0, ok: 0 };
  let totalBudget = 0, totalSpent = 0;
  const rows: BudgetRow[] = categories.map((c) => {
    const bg = num(budget[c.id]);
    const sp = txs.filter((t) => t.category === c.id && !isCardPayment(state, t)).reduce((a, t) => a + num(t.amount), 0);
    const hasBudget = bg > 0;
    const realPct = hasBudget ? (sp / bg) * 100 : 0;
    const pct = Math.min(100, realPct);
    totalBudget += bg; totalSpent += sp;
    let tone: BudgetTone = 'tracking';
    if (hasBudget && pct >= 100) { tone = 'over'; counts.over++; }
    else if (hasBudget && pct >= 80) { tone = 'warn'; counts.warn++; }
    else if (hasBudget) { tone = 'ok'; counts.ok++; }
    return { id: c.id, label: c.label, icon: c.icon || '', budget: bg, spent: sp, available: bg - sp, hasBudget, pct, realPct, tone, barWidth: hasBudget ? pct : (sp > 0 ? 100 : 0) };
  });
  const rank: Record<BudgetTone, number> = { over: 0, warn: 1, ok: 2, tracking: 3 };
  rows.sort((a, b) => (rank[a.tone] - rank[b.tone]) || (b.realPct - a.realPct));
  return { rows, totalBudget, totalSpent, available: totalBudget - totalSpent, counts };
}

// ---------------------------------------------------------------- movimientos: búsqueda, filtros, orden y páginas
export interface TxFilters {
  search: string; categories: string[]; cardId: string | number | null; pocketId: string | number | null;
  dateFrom: string; dateTo: string; amountMin: number | string | null; amountMax: number | string | null;
  cashbackOnly: boolean; paymentMethod: string;
}
export const emptyFilters = (): TxFilters => ({ search: '', categories: [], cardId: '', pocketId: '', dateFrom: '', dateTo: '', amountMin: null, amountMax: null, cashbackOnly: false, paymentMethod: '' });
const has = (v: unknown): boolean => v !== '' && v !== null && v !== undefined;

/** Cuántos filtros hay activos (cada grupo cuenta uno: el rango de fechas y el de montos cuentan como uno cada uno). */
export function countActiveFilters(f: Partial<TxFilters>): number {
  let n = 0;
  if (f.search && f.search.trim()) n++;
  if (f.categories && f.categories.length > 0) n++;
  if (has(f.cardId)) n++;
  if (has(f.pocketId)) n++;
  if (f.dateFrom || f.dateTo) n++;
  if (has(f.amountMin) || has(f.amountMax)) n++;
  if (f.cashbackOnly) n++;
  if (f.paymentMethod) n++;
  return n;
}
/** Con rango de fechas la búsqueda abarca TODO el histórico; sin él, solo el mes que se está viendo. */
export const usingDateRange = (f: Partial<TxFilters>): boolean => !!(f.dateFrom || f.dateTo);

export function filterTransactions<T extends TxLike>(txs: T[], f: Partial<TxFilters>): T[] {
  const q = f.search && f.search.trim() ? f.search.trim().toLowerCase() : '';
  return txs.filter((t) => {
    if (q && !String(t.desc || '').toLowerCase().includes(q)) return false;
    if (f.categories && f.categories.length > 0 && !f.categories.includes(String(t.category))) return false;
    if (has(f.cardId) && String(t.cardId || '') !== String(f.cardId)) return false;
    if (has(f.pocketId) && String((t as TxLike & { pocketId?: unknown }).pocketId || '') !== String(f.pocketId)) return false;
    if (f.dateFrom && String(t.date || '') < f.dateFrom) return false;
    if (f.dateTo && String(t.date || '') > f.dateTo) return false;
    const amt = num(t.amount);
    if (has(f.amountMin) && amt < parseFloat(String(f.amountMin))) return false;
    if (has(f.amountMax) && amt > parseFloat(String(f.amountMax))) return false;
    if (f.cashbackOnly && !(num(t.cashback) > 0)) return false;
    if (f.paymentMethod && (t as TxLike & { paymentMethod?: string }).paymentMethod !== f.paymentMethod) return false;
    return true;
  });
}
/** Más recientes primero: fecha descendente y, si empatan, el de creación/id más reciente arriba. */
export function sortTransactions<T extends TxLike>(txs: T[]): T[] {
  const stamp = (t: TxLike) => num((t as TxLike & { createdAt?: unknown }).createdAt) || num(t.id);
  return [...txs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || stamp(b) - stamp(a));
}
/** Los movimientos a mostrar: filtrados y ordenados. */
export function selectTransactions(state: CoreState, month: string, f: Partial<TxFilters>): TxLike[] {
  const all = usingDateRange(f) ? Object.keys(state.transactions || {}).flatMap((m) => (state.transactions || {})[m] || []) : [...((state.transactions || {})[month] || [])];
  return sortTransactions(filterTransactions(all, f));
}
export interface Page<T> { items: T[]; page: number; totalPages: number; start: number; end: number; total: number }
/** Página `page` (empieza en 1) con `size` elementos; la página se ajusta al rango válido. */
export function paginate<T>(items: T[], page: number, size = 10): Page<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(num(page)) || 1), totalPages);
  const start = (p - 1) * size;
  return { items: items.slice(start, start + size), page: p, totalPages, start: start + 1, end: Math.min(start + size, total), total };
}
/** Números de página a mostrar: primera, anterior, actual, siguiente y última; con "…" donde hay saltos. */
export function pageNumbers(current: number, totalPages: number): (number | '…')[] {
  const set = new Set<number>();
  for (const n of [1, current - 1, current, current + 1, totalPages]) if (n >= 1 && n <= totalPages) set.add(n);
  const nums = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let last = 0;
  for (const n of nums) { if (n - last > 1) out.push('…'); out.push(n); last = n; }
  return out;
}
/** Resumen de los movimientos filtrados: cuántos, cuánto suman y cuánto cashback dejan. */
export function filterStats(txs: TxLike[]): { count: number; sum: number; cashback: number } {
  return { count: txs.length, sum: txs.reduce((a, t) => a + num(t.amount), 0), cashback: txs.reduce((a, t) => a + num(t.cashback), 0) };
}

// ---------------------------------------------------------------- análisis y conversor: datos de las gráficas
/** Tasa de ahorro del mes en % (entera). Sin ingresos no hay tasa (null), no 0 %. */
export const savingsRate = (income: number, expense: number): number | null => (num(income) > 0 ? Math.round(((num(income) - num(expense)) / num(income)) * 100) : null);

/** Gasto por categoría de un mes (sin pagos de tarjeta), de mayor a menor y solo lo positivo. */
export function categoryTotals(state: CoreState, month: string): { id: string; value: number }[] {
  const by: Record<string, number> = {};
  for (const t of ((state.transactions || {})[month] || [])) {
    if (isCardPayment(state, t)) continue;
    by[String(t.category)] = (by[String(t.category)] || 0) + num(t.amount);
  }
  return Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ id, value }));
}

/** Paso "redondo" para un eje: 1, 1,5, 2, 2,5, 3, 4, 5, 7,5 o 10 por potencia de 10. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nf = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 7.5 ? 7.5 : 10;
  return nf * exp;
}
/** Escala de un eje que cubre [min, max] con unas `target` divisiones "redondas". */
export function niceScale(min: number, max: number, target = 4): { min: number; max: number; step: number; ticks: number[] } {
  let lo = Math.min(min, max), hi = Math.max(min, max);
  if (hi === lo) { const pad = Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; }
  const step = niceStep((hi - lo) / target);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: a, max: b, step, ticks };
}

/** Puntos del historial de la TRM (fecha ISO → valor) de los últimos `days` días, en orden cronológico. */
export function trmWindow(history: Record<string, number>, days: number, today: Date = new Date()): { dates: string[]; values: number[] } {
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const dates = Object.keys(history || {}).sort().filter((d) => d >= cutoffStr);
  return { dates, values: dates.map((d) => num(history[d])) };
}
export interface TrmInsight { tone: 'buy' | 'sell' | 'flat'; pctVsAvg: number; current: number; avg: number; min: number; max: number }
/** Compara la TRM de hoy (último valor) con el promedio del período: ≥ 1,5 % por debajo → buen momento para comprar; ≥ 1,5 % por encima → para vender. */
export function trmInsight(values: number[]): TrmInsight | null {
  if (!values.length) return null;
  const current = values[values.length - 1];
  const avg = values.reduce((a, v) => a + v, 0) / values.length;
  const pctVsAvg = ((current - avg) / avg) * 100;
  return { tone: pctVsAvg <= -1.5 ? 'buy' : pctVsAvg >= 1.5 ? 'sell' : 'flat', pctVsAvg, current, avg, min: Math.min(...values), max: Math.max(...values) };
}

// ---------------------------------------------------------------- análisis: calendario, comparativa y gastos hormiga
export interface Reminder { title?: string; date?: string; recurring?: string; icon?: string; amount?: number }
export interface CalEvent { icon: string; label: string; type: 'cutoff' | 'reminder'; reminderId?: string; amount?: number }
export interface CalendarMonth { year: number; month: number; daysInMonth: number; startWeekday: number; events: Record<number, CalEvent[]> }

/** Eventos del mes de `today`: cortes de tarjeta y recordatorios. Un día que no existe ese mes (31 en abril, 29 en febrero) cae en el último día. */
export function calendarMonth(state: CoreState & { reminders?: Record<string, Reminder | null> }, today: Date): CalendarMonth {
  const year = today.getFullYear(), month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;      // lunes = 0
  const events: Record<number, CalEvent[]> = {};
  const add = (day: number, e: CalEvent) => { (events[day] = events[day] || []).push(e); };
  for (const d of state.debts || []) {
    const cd = Math.floor(num(d.cutoffDay));
    if (cd >= 1) add(Math.min(cd, daysInMonth), { icon: '💳', label: 'Corte ' + (d.name || ''), type: 'cutoff' });
  }
  for (const [id, r] of Object.entries(state.reminders || {})) {
    if (!r || !/^\d{4}-\d{2}-\d{2}/.test(r.date || '')) continue;
    const [ry, rm, rd] = (r.date as string).split('-').map(Number);
    let day: number | null = null;
    if (r.recurring === 'monthly') { if (ry < year || (ry === year && rm - 1 <= month)) day = Math.min(rd, daysInMonth); }   // desde el mes en que empieza
    else if (r.recurring === 'yearly') { if (rm - 1 === month) day = Math.min(rd, daysInMonth); }
    else if (ry === year && rm - 1 === month) day = Math.min(rd, daysInMonth);
    if (day && day >= 1) add(day, { icon: r.icon || '📌', label: String(r.title ?? ''), type: 'reminder', reminderId: id, amount: r.amount });
  }
  return { year, month, daysInMonth, startWeekday, events };
}

export interface CompareRow { id: string; current: number; previous: number; diff: number; pct: number; trend: 'up' | 'down' | 'flat'; isNew: boolean }
export interface MonthComparison {
  hasData: boolean; currentMonth: string; previousMonth: string; throughDay: number | null;
  currentTotal: number; previousTotal: number; diff: number; pct: number | null; rows: CompareRow[];
}
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
/** Gasto del mes actual contra el anterior por categoría (sin pagos de tarjeta).
 *  'same-period' compara hasta el mismo día del mes (justo a mitad de mes); 'full' compara el mes anterior completo. */
export function monthComparison(state: CoreState, today: Date, mode: 'same-period' | 'full' = 'same-period'): MonthComparison {
  const currentMonth = ym(today);
  const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonth = ym(prevDate);
  const real = (m: string) => ((state.transactions || {})[m] || []).filter((t) => !isCardPayment(state, t));
  const cur = real(currentMonth), prev = real(previousMonth);
  const prevDays = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
  const day = (t: TxLike) => parseInt(String(t.date || '').substring(8, 10), 10);
  const same = mode === 'same-period';
  const within = (txs: TxLike[], max: number) => (same ? txs.filter((t) => !(day(t) > max)) : txs);   // sin fecha válida: cuenta
  const c = within(cur, today.getDate()), p = within(prev, Math.min(today.getDate(), prevDays));
  const byCat = (txs: TxLike[]) => { const m: Record<string, number> = {}; for (const t of txs) m[String(t.category)] = (m[String(t.category)] || 0) + num(t.amount); return m; };
  const cc = byCat(c), pc = byCat(p);
  const currentTotal = c.reduce((a, t) => a + num(t.amount), 0), previousTotal = p.reduce((a, t) => a + num(t.amount), 0);
  const rows: CompareRow[] = [...new Set([...Object.keys(cc), ...Object.keys(pc)])].map((id) => {
    const current = cc[id] || 0, previous = pc[id] || 0, diff = current - previous;
    const pct = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
    return { id, current, previous, diff, pct, trend: Math.abs(pct) > 10 ? (diff > 0 ? 'up' : 'down') : 'flat', isNew: previous === 0 && current > 0 } as CompareRow;
  }).sort((a, b) => (b.current - a.current) || (b.previous - a.previous));
  const diff = currentTotal - previousTotal;
  return { hasData: cur.length + prev.length > 0, currentMonth, previousMonth, throughDay: same ? today.getDate() : null, currentTotal, previousTotal, diff, pct: previousTotal > 0 ? (diff / previousTotal) * 100 : null, rows };
}

export const ANT_MAX_AMOUNT = 50000;
export interface AntPattern { key: string; count: number; total: number; avg: number; monthsSpan: number; projectedYear: number }
/** Gastos pequeños (≤ 50.000) que se repiten: se agrupan por las dos primeras palabras de la descripción. No cuentan los pagos de tarjeta
 *  ni las cuotas de compras a plazos (no son gastos hormiga). La proyección anual = total ÷ meses distintos en que aparece × 12. */
export function antExpenses(state: CoreState): { enough: boolean; patterns: AntPattern[] } {
  const all = Object.values(state.transactions || {}).flatMap((a) => (Array.isArray(a) ? a : [])).filter((t) => !isCardPayment(state, t));
  if (all.length < 5) return { enough: false, patterns: [] };
  const groups: Record<string, { count: number; total: number; months: Set<string> }> = {};
  for (const t of all) {
    const desc = String(t.desc || '').trim();
    if (!desc || num(t.amount) > ANT_MAX_AMOUNT || (t as TxLike & { installment?: unknown }).installment) continue;
    const key = desc.toLowerCase().split(/\s+/).slice(0, 2).join(' ').substring(0, 30);
    const g = (groups[key] = groups[key] || { count: 0, total: 0, months: new Set<string>() });
    g.count++; g.total += num(t.amount);
    if (t.date) g.months.add(String(t.date).substring(0, 7));
  }
  const patterns = Object.entries(groups).filter(([, g]) => g.count >= 2).map(([key, g]) => {
    const monthsSpan = Math.max(1, g.months.size);
    return { key, count: g.count, total: g.total, avg: g.total / g.count, monthsSpan, projectedYear: (g.total / monthsSpan) * 12 };
  }).sort((a, b) => b.total - a.total).slice(0, 10);
  return { enough: true, patterns };
}

// ---------------------------------------------------------------- tarjetas: resumen, consejo y próximos pagos
export interface CardsOverview { count: number; limit: number; debt: number; available: number; util: number; cashbackMonth: number }
/** Resumen de todas las tarjetas: cupo total, saldo, disponible, utilización general y cashback del mes (de las compras con tarjeta). */
export function cardsOverview(state: CoreState, month: string): CardsOverview {
  const debts = state.debts || [];
  const limit = debts.reduce((a, d) => a + num((d as { payment?: unknown }).payment), 0);
  const debt = debts.reduce((a, d) => a + num(d.balance), 0);
  const ids = new Set(debts.map((d) => String(d.id)));
  const cashbackMonth = ((state.transactions || {})[month] || []).filter((t) => t.cardId != null && ids.has(String(t.cardId))).reduce((a, t) => a + num(t.cashback), 0);
  return { count: debts.length, limit, debt, available: limit - debt, util: limit > 0 ? (debt / limit) * 100 : 0, cashbackMonth };
}

export type CardInsightKind = 'urgent' | 'no-limit' | 'clean' | 'ok' | 'warn' | 'high';
/** Qué consejo mostrar: una tarjeta que corta hoy o mañana y aún necesita pago manda sobre todo; después, según la utilización general
 *  (0 = sin saldo, ≤ 30 % saludable, ≤ 50 % atención, > 50 % alta). Con saldo pero sin cupo registrado no se puede calcular. */
export function cardInsightKind(util: number, debt: number, limit: number, hasUrgent: boolean): CardInsightKind {
  if (hasUrgent) return 'urgent';
  if (limit <= 0 && debt > 0) return 'no-limit';
  if (util === 0) return 'clean';
  return util <= 30 ? 'ok' : util <= 50 ? 'warn' : 'high';
}
/** Color de urgencia de un corte según los días que faltan: ≤ 1 rojo, ≤ 3 ámbar, ≤ 7 azul, más de 7 neutro. */
export const urgencyTone = (daysLeft: number): 'danger' | 'warning' | 'info' | 'muted' => (daysLeft <= 1 ? 'danger' : daysLeft <= 3 ? 'warning' : daysLeft <= 7 ? 'info' : 'muted');

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
  for (const d of state.debts || []) {
    const ci = cardInstallments(state, d.id, now);
    if (ci.hasInstallments && !d.canPrepayInstallments && ci.outstandingNowTotal > num(d.balance) + 1000) {
      const money = (n: number) => '$ ' + Math.round(n).toLocaleString('es-CO');
      issues.push({ code: `installments-prepaid-${d.id}`, level: 'info', message: `El saldo de "${d.name}" (${money(num(d.balance))}) es menor que el capital que faltaba según el calendario de tus cuotas (${money(ci.outstandingNowTotal)}): es lo normal si adelantaste pagos a capital. Si tu banco te deja adelantar cuotas, actívalo en Tarjetas para que el pago recomendado lo tenga en cuenta.` });
    }
  }
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
