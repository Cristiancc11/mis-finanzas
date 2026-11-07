import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from './finance';

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `esperado ≈ ${b}, obtenido ${a}`);
const NOW = new Date(2026, 10, 7, 10, 0, 0); // 7 nov 2026

test('num: texto numérico, NaN e Infinity', () => {
  assert.equal(f.num('1500'), 1500);
  assert.equal(f.num('12.5'), 12.5);
  assert.equal(f.num('abc'), 0);
  assert.equal(f.num(null), 0);
  assert.equal(f.num(undefined), 0);
  assert.equal(f.num(Infinity), 0);
  assert.equal(f.num(NaN), 0);
});

test('meses: lastNMonths y previousMonths (con cambio de año)', () => {
  assert.deepEqual(f.lastNMonths(6, NOW), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(f.previousMonths('2026-01', 3), ['2025-12', '2025-11', '2025-10']);
});

test('monthExpense excluye pagos de tarjeta (payCardId, categoría pago_tarjeta y categorías propias marcadas)', () => {
  const state: f.CoreState = {
    customCategories: [{ id: 'mi_pago', isPagoTarjeta: true }],
    transactions: { '2026-11': [
      { amount: 100, category: 'mercado' },
      { amount: '50', category: 'uber' },
      { amount: 500, category: 'otros', payCardId: 301 },
      { amount: 300, category: 'pago_tarjeta' },
      { amount: 200, category: 'mi_pago' },
    ] },
  };
  assert.equal(f.monthExpense(state, '2026-11'), 150);
  assert.equal(f.monthExpense(state, '2026-10'), 0);
});

test('monthIncome: snapshot, extras y cashback; meses pasados sin registros NO inventan ingresos', () => {
  const state: f.CoreState = {
    incomes: [{ amount: 3000000, frequency: 'monthly' }, { amount: 100, frequency: 'weekly' }],
    monthlyIncomes: { '2026-10': [{ amount: 2800000 }] },
    extraIncomes: { '2026-10': [{ amount: 200000 }], '2026-09': [] },
    transactions: { '2026-10': [{ amount: 10, cashback: 100 }, { amount: 20, cashback: '50' }], '2026-08': [{ amount: 5 }] },
  };
  assert.equal(f.monthIncome(state, '2026-10', NOW), 2800000 + 200000 + 150);   // snapshot + extras + cashback
  assert.equal(f.monthIncome(state, '2026-09', NOW), 0);                         // pasado, sin registros → 0 (antes: 3.000.000 "fantasma")
  assert.equal(f.monthIncome(state, '2026-03', NOW), 0);
  assert.equal(f.monthIncome(state, '2026-08', NOW), 3000000);                   // pasado con gastos y sin foto → plantillas (solo 'monthly')
  assert.equal(f.monthIncome(state, '2026-11', NOW), 3000000);                   // mes actual sin foto → plantillas
  assert.equal(f.monthIncome(state, '2026-12', NOW), 3000000);                   // futuro → plantillas
});

test('expenseBaseline: usa historial real si existe; si no, el presupuesto', () => {
  const withHist: f.CoreState = { transactions: {
    '2026-10': [{ amount: 3000000 }], '2026-09': [], '2026-08': [{ amount: 1000000 }], '2026-11': [{ amount: 1500000 }],
  } };
  assert.equal(f.expenseBaseline(withHist, '2026-11'), 2000000);                 // promedio de meses con gasto (3M y 1M)
  withHist.transactions!['2026-11'] = [{ amount: 2500000 }];
  assert.equal(f.expenseBaseline(withHist, '2026-11'), 2500000);                 // si ya gastó más que el promedio, manda lo gastado
  const noHist: f.CoreState = { budgets: { '2026-11': { a: 1000000, b: 2100000 } }, transactions: { '2026-11': [{ amount: 900000 }] } };
  assert.equal(f.expenseBaseline(noHist, '2026-11'), 3100000);                   // sin historial: presupuesto
  assert.equal(f.expenseBaseline({}, '2026-11'), 0);
});

test('incomeBaseline: recurrentes + cashback; si todo es ocasional, promedia el historial', () => {
  const st: f.CoreState = { transactions: { '2026-11': [{ amount: 1, cashback: 4000 }] } };
  assert.equal(f.incomeBaseline(st, '2026-11', 3000000, NOW), 3004000);          // los extras de una vez NO se proyectan
  const freelance: f.CoreState = { incomes: [], extraIncomes: { '2026-10': [{ amount: 3000000 }], '2026-09': [], '2026-08': [{ amount: 1000000 }] } };
  assert.equal(f.incomeBaseline(freelance, '2026-11', 0, NOW), 2000000);           // promedio de meses con ingreso (3 M y 1 M)
  assert.equal(f.incomeBaseline({ extraIncomes: { '2026-11': [{ amount: 700000 }] } }, '2026-11', 0, NOW), 700000);  // sin historial: lo de este mes
  assert.equal(f.incomeBaseline({}, '2026-11', 0, NOW), 0);
});

test('proyecciones: cobertura en meses y anual (sin multiplicar por 12 los extras)', () => {
  assert.equal(f.coverageMonths(6000000, 2000000), 3);
  assert.equal(f.coverageMonths(6000000, 0), null);
  const a = f.annualProjection(4000000, 3000000, 10000000);
  assert.deepEqual(a, { income: 48000000, expense: 36000000, savings: 12000000, netWorthIn12: 22000000 });
  assert.equal(f.annualProjection(2000000, 3000000, 0).savings, -12000000);
});

test('healthScore: rúbrica con casos conocidos', () => {
  // 50 + 18 (3 meses) + 15 (ahorra 25 %) + 10 (ahorros > deuda) + 5 (deuda baja) + 5 (≥3 bolsillos) = 103 → tope 100
  assert.equal(f.healthScore({ savings: 6000000, income: 4000000, monthlyExpense: 2000000, debt: 1000000, balance: 1000000, pocketCount: 4 }), 100);
  // 50 − 5 (cubre 0,25 meses) − 15 (margen −5 %) + 0 + 0 + 0 = 30
  assert.equal(f.healthScore({ savings: 500000, income: 2000000, monthlyExpense: 2000000, debt: 3000000, balance: -100000, pocketCount: 1 }), 30);
  // 50 + 8 + 10 + 10 + 5 + 0 = 83
  assert.equal(f.healthScore({ savings: 4000000, income: 3000000, monthlyExpense: 2000000, debt: 1000000, balance: 400000, pocketCount: 2 }), 83);
});

test('clampedDate: el corte día 29/30/31 no salta al mes siguiente', () => {
  const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.equal(ymd(f.clampedDate(2026, 3, 31)), '2026-4-30');   // abril tiene 30 días
  assert.equal(ymd(f.clampedDate(2026, 1, 30)), '2026-2-28');   // febrero 2026
  assert.equal(ymd(f.clampedDate(2028, 1, 30)), '2028-2-29');   // bisiesto
  assert.equal(ymd(f.clampedDate(2026, 0, 31)), '2026-1-31');
  assert.equal(ymd(f.clampedDate(2026, 12, 31)), '2027-1-31');  // mes 12 → enero siguiente
  assert.equal(ymd(f.clampedDate(2026, 5, 0)), '2026-6-1');     // día inválido → 1
});

test('nextCutoff: días calendario hasta el corte', () => {
  const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let r = f.nextCutoff(28, NOW);                                   // 7 nov, corte 28
  assert.equal(ymd(r.date), '2026-11-28'); assert.equal(r.daysLeft, 21);
  r = f.nextCutoff(5, NOW);                                        // corte 5 ya pasó → 5 dic
  assert.equal(ymd(r.date), '2026-12-5'); assert.equal(r.daysLeft, 28);
  r = f.nextCutoff(31, new Date(2026, 3, 30, 10));                 // 30 abr, corte 31 → hoy (abril solo tiene 30)
  assert.equal(ymd(r.date), '2026-4-30'); assert.equal(r.daysLeft, 0);
  r = f.nextCutoff(31, new Date(2026, 4, 1));                      // 1 may → 31 may
  assert.equal(ymd(r.date), '2026-5-31'); assert.equal(r.daysLeft, 30);
  r = f.nextCutoff(30, new Date(2026, 1, 27));                     // 27 feb, corte 30 → 28 feb
  assert.equal(ymd(r.date), '2026-2-28'); assert.equal(r.daysLeft, 1);
  r = f.nextCutoff(5, new Date(2026, 11, 31, 22));                 // 31 dic → 5 ene siguiente
  assert.equal(ymd(r.date), '2027-1-5'); assert.equal(r.daysLeft, 5);
  r = f.nextCutoff(7, NOW);                                        // el corte es hoy → daysLeft 0 (no 30)
  assert.equal(r.daysLeft, 0);
});

test('utilization', () => {
  assert.equal(f.utilization(150000, 1000000), 15);
  assert.equal(f.utilization(100, 0), 0);
});

test('splitEqual: las partes suman EXACTAMENTE el total', () => {
  assert.deepEqual(f.splitEqual(100000, 3), [33334, 33333, 33333]);
  assert.deepEqual(f.splitEqual(10, 4), [3, 3, 2, 2]);
  assert.deepEqual(f.splitEqual(0, 3), [0, 0, 0]);
  assert.deepEqual(f.splitEqual(5, 0), []);
  for (let total = 0; total < 2000; total += 37) for (let n = 1; n <= 9; n++) {
    const parts = f.splitEqual(total, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
  }
});

test('returnsProjection: valores conocidos (coinciden con lo que mostraba la app)', () => {
  const r = f.returnsProjection(11900000, 8.2, 0)!;
  near(r.annualGross, 975800);                                     // 11,9 M × 8,2 %
  near(r.dailyGross, 2673.42, 0.01);
  assert.equal(r.withholding, false);                              // 2.673 < 0,055 UVT (2.880,57)
  near(r.project(12), 11900000 * 1.082, 0.5);                      // en 1 año: $ 12.875.800
  near(r.project(60), 11900000 * Math.pow(1.082, 5), 0.5);         // en 5 años: $ 17.647.503
  near(r.monthlyGross, 11900000 * (Math.pow(1.082, 1 / 12) - 1), 0.01);
});

test('returnsProjection: con aportes mensuales coincide con la fórmula de anualidad', () => {
  const p = 5000000, c = 400000;
  const r = f.returnsProjection(p, 9, c)!;
  const eM = Math.pow(1 + r.netAnnualRate, 1 / 12) - 1;
  for (const n of [1, 12, 60, 120]) {
    const expected = p * Math.pow(1 + eM, n) + c * (Math.pow(1 + eM, n) - 1) / eM;
    near(r.project(n), expected, 0.5);
  }
});

test('returnsProjection: retención del 7 % sobre el TOTAL cuando se supera el umbral', () => {
  const r = f.returnsProjection(100000000, 8.2, 0)!;
  assert.equal(r.withholding, true);                               // 22.465/día > 2.880,57
  near(r.annualTax, 574000);                                       // 8,2 M × 7 %
  near(r.annualNet, 8200000 - 574000);
  assert.equal(f.returnsProjection(0, 8, 0), null);
  assert.equal(f.returnsProjection(1000, 0, 0), null);
});

test('budgetForNewMonth: copia el último presupuesto con valores; ignora meses en cero', () => {
  const state: f.CoreState = { budgets: { '2026-09': { a: 100, b: 200 }, '2026-10': { a: 0, b: 0 } } };
  const b = f.budgetForNewMonth(state, '2026-11', { a: 0, b: 0, c: 0 });
  assert.deepEqual(b, { a: 100, b: 200 });
  assert.notEqual(b, state.budgets!['2026-09']);                  // es una copia, no la misma referencia
  assert.deepEqual(f.budgetForNewMonth({ budgets: { '2026-10': { a: 0 } } }, '2026-11', { a: 0, z: 0 }), { a: 0, z: 0 });
  assert.deepEqual(f.budgetForNewMonth({}, '2026-11', { x: 1 }), { x: 1 });
});

test('sanitizeState: corrige números como texto y NaN; es idempotente', () => {
  const state: f.CoreState = {
    pockets: [{ amount: '1500' }, { amount: NaN }],
    debts: [{ balance: '200', payment: '1000', cutoffDay: '28' }],
    transactions: { '2026-11': [{ amount: '12.5', cashback: null }] },
    budgets: { '2026-11': { uber: '50' } },
  };
  const r = f.sanitizeState(state);
  assert.equal(r.fixes, 7);
  assert.equal(state.pockets![0].amount, 1500);
  assert.equal(state.pockets![1].amount, 0);
  assert.equal(state.debts![0].balance, 200);
  assert.equal(state.debts![0].cutoffDay, 28);
  assert.equal(state.transactions!['2026-11'][0].amount, 12.5);
  assert.equal(state.transactions!['2026-11'][0].cashback, 0);
  assert.equal(state.budgets!['2026-11'].uber, 50);
  assert.ok(Array.isArray(state.goals) && Array.isArray(state.incomes));   // colecciones ausentes creadas
  assert.equal(f.sanitizeState(state).fixes, 0);
  const total = (state.pockets || []).reduce((s, p) => s + (p.amount as number), 0);
  assert.equal(total, 1500);                                       // la suma ya no concatena texto ni da NaN
});

test('auditState: avisos de calidad de datos', () => {
  const state: f.CoreState = {
    pockets: [{ name: 'Viajes', amount: -50000 }],
    debts: [{ name: 'Visa', balance: 600000, payment: 500000 }],
    transactions: { '2026-11': [
      { date: '2026-11-03', desc: 'Netflix', amount: 38900, category: 'streaming' },
      { date: '2026-11-03', desc: 'netflix ', amount: 38900, category: 'streaming' },
      { date: '2026-11-04', desc: 'Pago tarjeta', amount: 38900, category: 'pago_tarjeta' },
    ] },
  };
  const codes = f.auditState(state, '2026-11', NOW).map((i) => i.code).sort();
  assert.deepEqual(codes, ['card-over-limit', 'no-budget', 'pocket-negative', 'possible-duplicates']);
  assert.deepEqual(f.auditState({ pockets: [{ name: 'A', amount: 10 }] }, '2026-11', NOW), []);
});
