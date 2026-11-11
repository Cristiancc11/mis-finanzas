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

test('cuotas: la suma de las cuotas coincide EXACTO con lo comprado (sin interés)', () => {
  assert.deepEqual(f.installmentAmounts(100000, 3, 0), [33333, 33333, 33334]);
  assert.deepEqual(f.installmentAmounts(1000, 4, 0), [250, 250, 250, 250]);
  for (const [total, n] of [[100000, 3], [999999, 7], [1234567, 12], [50, 6], [1, 2]] as const) {
    const parts = f.installmentAmounts(total, n, 0);
    assert.equal(parts.length, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
});

test('cuotas: con interés usa la fórmula francesa (PMT)', () => {
  const pmt = f.installmentPayment(1200000, 12, 2);
  near(pmt, 113471.52, 0.05);                                          // 1,2 M a 12 cuotas, 2 % mensual
  const parts = f.installmentAmounts(1200000, 12, 2);
  assert.equal(parts.reduce((a, b) => a + b, 0), Math.round(pmt * 12));
  assert.ok(Math.abs(parts[11] - parts[0]) <= 6);                      // la última solo absorbe el redondeo
  // el valor presente de las 12 cuotas a la tasa del crédito vuelve a ser el capital
  let pv = 0; for (let j = 1; j <= 12; j++) pv += pmt / Math.pow(1.02, j);
  near(pv, 1200000, 0.5);
});

test('cuotas: capital pendiente (lo que sigue bloqueado en el cupo)', () => {
  assert.equal(f.installmentOutstandingPrincipal(120000, 12, 0, 0), 120000);
  assert.equal(f.installmentOutstandingPrincipal(120000, 12, 0, 3), 90000);
  assert.equal(f.installmentOutstandingPrincipal(120000, 12, 0, 12), 0);
  assert.equal(f.installmentOutstandingPrincipal(120000, 12, 0, 99), 0);
  near(f.installmentOutstandingPrincipal(1200000, 12, 2, 0), 1200000, 0.01);
  near(f.installmentOutstandingPrincipal(1200000, 12, 2, 12), 0, 0.01);
  // con interés: igual al valor presente de las cuotas que faltan, y MENOR que la suma nominal de esas cuotas
  const pmt = f.installmentPayment(1200000, 12, 2);
  let pv = 0; for (let j = 1; j <= 8; j++) pv += pmt / Math.pow(1.02, j);        // faltan 8 cuotas (se pagaron 4)
  near(f.installmentOutstandingPrincipal(1200000, 12, 2, 4), pv, 0.5);
  assert.ok(f.installmentOutstandingPrincipal(1200000, 12, 2, 4) < pmt * 8);
});

test('cardBalanceAfterEdit: editar no sube el saldo cuando ya pagaste parte de la tarjeta', () => {
  // saldo 1 M incluía una compra de 200.000; pagaste 900.000 → saldo 100.000; editas la compra sin cambiar el monto
  assert.equal(f.cardBalanceAfterEdit(100000, 200000, 200000), 100000);        // antes quedaba en 200.000
  assert.equal(f.cardBalanceAfterEdit(100000, 200000, 250000), 150000);        // subir la compra 50.000 sube el saldo 50.000
  assert.equal(f.cardBalanceAfterEdit(100000, 200000, 50000), 0);              // el saldo nunca queda negativo
  assert.equal(f.cardBalanceAfterEdit(500000, 200000, 200000), 500000);
});

test('paidByPerson: suma pagos completos y abonos parciales por persona', () => {
  const debts = [
    { txId: 1, name: 'Ana', amount: 33334, paid: true },
    { txId: 1, name: 'Luis', amount: 33333, paid: false, payments: [{ amount: 10000 }, { amount: 5000 }] },
    { txId: 2, name: 'Ana', amount: 999, paid: true },
    { txId: 1, name: 'Eva', amount: 100, paid: false },
  ];
  assert.deepEqual(f.paidByPerson(debts, 1), { Ana: 33334, Luis: 15000 });
  assert.deepEqual(f.paidByPerson(debts, 99), {});
});

const mkTx = (id: number, date: string, cardId: number, groupId: number, current: number, total: number, amount: number, extra: Record<string, unknown> = {}): f.TxLike => ({
  id, date, desc: `COMPRA X (cuota ${current}/${total})`, amount, category: 'compras', cardId,
  installment: { groupId, current, total, originalTotal: amount * total, cuotaAmount: amount, hasInterest: false, interestRate: 0, ...extra },
} as f.TxLike);

test('cardInstallments: una compra YA TERMINADA no es activa ni bloquea cupo (antes salía "Cuota 5/4")', () => {
  // 4 cuotas en jun–sep; hoy es noviembre: las 4 ya pasaron
  const txs = [mkTx(1, '2026-06-10', 7, 100, 1, 4, 50000), mkTx(2, '2026-07-10', 7, 100, 2, 4, 50000), mkTx(3, '2026-08-10', 7, 100, 3, 4, 50000), mkTx(4, '2026-09-10', 7, 100, 4, 4, 50000)];
  const state: f.CoreState = { transactions: { '2026-06': [txs[0]], '2026-07': [txs[1]], '2026-08': [txs[2]], '2026-09': [txs[3]] } };
  const ci = f.cardInstallments(state, 7, NOW);
  assert.equal(ci.hasInstallments, false);
  assert.equal(ci.groups.length, 0);
  assert.equal(ci.finished.length, 1);
  assert.equal(ci.finished[0].currentIndex, 4);                                  // nunca 5/4
  assert.equal(ci.finished[0].pendingAmount, 0);
  assert.equal(ci.futureLockedPrincipal, 0);
  assert.equal(ci.blockedByInstallments, 0);
});

test('cardInstallments: compra activa (cuota 6/24) y la cuota del mes', () => {
  const state: f.CoreState = { transactions: {} };
  for (let i = 1; i <= 24; i++) {                                               // 24 cuotas desde junio 2026
    const d = new Date(2026, 5 + (i - 1), 10);
    const m = f.monthKey(d);
    (state.transactions![m] = state.transactions![m] || []).push(mkTx(i, `${m}-10`, 7, 200, i, 24, 100000));
  }
  const ci = f.cardInstallments(state, 7, NOW);                                  // hoy: noviembre = cuota 6
  const g = ci.groups[0];
  assert.equal(ci.groups.length, 1);
  assert.equal(g.cuotasPaid, 5);                                                 // jun–oct
  assert.equal(g.currentIndex, 6);
  assert.equal(g.cuotasPending, 19);
  assert.equal(g.pendingAmount, 1900000);
  assert.equal(g.currentMonthCuota, 100000);
  assert.equal(ci.futureLockedPrincipal, 1800000);                               // sin interés: 18 cuotas siguientes
  assert.equal(ci.outstandingNowTotal, 1900000);
  assert.equal(f.cardInstallments(state, 999, NOW).hasInstallments, false);      // otra tarjeta: nada
});

test('cupoBreakdown: lo bloqueado nunca pasa de lo usado (caso real: 4,09 M bloqueados con 2,2 M usados)', () => {
  const b = f.cupoBreakdown(12200000, 2206335, 4094625);
  assert.equal(b.locked, 2206335);                                               // tope: el saldo
  assert.equal(b.optimizable, 0);
  assert.equal(b.free, 9993665);
  assert.equal(b.inconsistent, true);
  near(b.lockedPct + b.optimizablePct + b.freePct, 100, 1e-9);
  near(b.lockedPct, 18.08, 0.01);                                                // = utilización, ya no 33,6 %
  const ok = f.cupoBreakdown(10000000, 3000000, 1000000);
  assert.deepEqual([ok.locked, ok.optimizable, ok.free, ok.inconsistent], [1000000, 2000000, 7000000, false]);
  near(ok.lockedPct + ok.optimizablePct + ok.freePct, 100, 1e-9);
  const over = f.cupoBreakdown(1000000, 1500000, 200000);                         // saldo sobre el cupo: sin libre y sin pasarse del 100 %
  assert.equal(over.free, 0);
  assert.ok(over.lockedPct + over.optimizablePct + over.freePct <= 100.000001);
  assert.deepEqual(f.cupoBreakdown(0, 0, 0).inconsistent, false);
});

test('auditState: si el saldo es menor que el capital del calendario de cuotas, informa de adelantos a capital (no acusa error)', () => {
  const state: f.CoreState = {
    debts: [{ id: 7, name: 'Lulo', balance: 500000, payment: 5000000 }],
    transactions: { '2026-11': [mkTx(1, '2026-11-10', 7, 300, 1, 12, 100000)] },   // capital pendiente 1,2 M > saldo 500.000
    budgets: { '2026-11': { a: 1 } },
  };
  const issues = f.auditState(state, '2026-11', NOW).filter((i) => i.code.startsWith('installments-prepaid'));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'info');                                            // informativo: NO es un error del saldo
  assert.match(issues[0].message, /adelantaste pagos a capital/);
  state.debts![0].canPrepayInstallments = true;                                     // ya lo declaró: no se repite el aviso
  assert.equal(f.auditState(state, '2026-11', NOW).filter((i) => i.code.startsWith('installments-prepaid')).length, 0);
  state.debts![0].canPrepayInstallments = false; state.debts![0].balance = 1500000; // saldo coherente → sin aviso
  assert.equal(f.auditState(state, '2026-11', NOW).filter((i) => i.code.startsWith('installments-prepaid')).length, 0);
});

test('cupoBreakdown: si el banco deja adelantar las cuotas, TODO el saldo es optimizable', () => {
  const b = f.cupoBreakdown(12200000, 2206335, 4094625, true);
  assert.equal(b.locked, 0);
  assert.equal(b.optimizable, 2206335);
  assert.equal(b.inconsistent, false);
  near(b.lockedPct + b.optimizablePct + b.freePct, 100, 1e-9);
});

test('prepaidCapital: capital que ya se adelantó', () => {
  assert.equal(f.prepaidCapital(4897352, 2206335), 2691017);
  assert.equal(f.prepaidCapital(1000000, 2206335), 0);
});

test('budgetOverview: orden por urgencia, estados, conteos y totales', () => {
  const cats = [{ id: 'mercado', label: 'Mercado' }, { id: 'servicios', label: 'Servicios' }, { id: 'gym', label: 'Gimnasio' }, { id: 'streaming', label: 'Streaming' }, { id: 'rappi', label: 'Rappi' }, { id: 'ocio', label: 'Ocio' }];
  const state: f.CoreState = {
    budgets: { '2026-11': { mercado: 700000, servicios: 450000, gym: 120000, rappi: 0, ocio: 100000 } },
    transactions: { '2026-11': [
      { amount: 560000, category: 'mercado' },                 // 80 % → cerca del límite
      { amount: 600000, category: 'servicios' },               // 133 % → excedida
      { amount: 60000, category: 'gym' },                      // 50 % → bajo control
      { amount: 38900, category: 'streaming' },                // sin presupuesto, con gasto → solo seguimiento
      { amount: 500000, category: 'ocio', payCardId: 7 },      // pago de tarjeta: NO cuenta
    ] },
  };
  const o = f.budgetOverview(state, '2026-11', cats);
  assert.deepEqual(o.rows.map((r) => [r.id, r.tone]), [['servicios', 'over'], ['mercado', 'warn'], ['gym', 'ok'], ['ocio', 'ok'], ['streaming', 'tracking'], ['rappi', 'tracking']]);
  assert.deepEqual(o.counts, { over: 1, warn: 1, ok: 2 });
  assert.equal(o.totalBudget, 1370000);
  assert.equal(o.totalSpent, 560000 + 600000 + 60000 + 38900);
  assert.equal(o.available, 1370000 - 1258900);
  const serv = o.rows[0];
  assert.equal(serv.available, -150000);
  assert.equal(serv.barWidth, 100);                              // la barra nunca pasa de 100 %
  assert.ok(serv.realPct > 133 && serv.realPct < 134);          // pero el % real sí se conserva para ordenar
  assert.equal(o.rows.find((r) => r.id === 'streaming')!.barWidth, 100);   // solo seguimiento con gasto: barra completa neutra
  assert.equal(o.rows.find((r) => r.id === 'rappi')!.barWidth, 0);         // sin presupuesto ni gasto: barra vacía
  assert.equal(o.rows.find((r) => r.id === 'ocio')!.spent, 0);
});

test('budgetOverview: mes sin presupuesto ni gastos y categorías con presupuesto en texto', () => {
  const cats = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const empty = f.budgetOverview({}, '2026-11', cats);
  assert.deepEqual([empty.totalBudget, empty.totalSpent, empty.available, empty.counts.over + empty.counts.warn + empty.counts.ok], [0, 0, 0, 0]);
  const txt = f.budgetOverview({ budgets: { '2026-11': { a: '1000' } }, transactions: { '2026-11': [{ amount: '250', category: 'a' }] } }, '2026-11', cats);
  assert.equal(txt.rows[0].id, 'a'); assert.equal(txt.rows[0].pct, 25); assert.equal(txt.totalBudget, 1000);
  // gastar EXACTAMENTE el presupuesto cuenta como excedida (pct = 100), igual que antes
  assert.equal(f.budgetOverview({ budgets: { '2026-11': { a: 1000 } }, transactions: { '2026-11': [{ amount: 1000, category: 'a' }] } }, '2026-11', cats).rows[0].tone, 'over');
});

const T = (id: number, date: string, desc: string, amount: number, category: string, extra: Record<string, unknown> = {}): f.TxLike => ({ id, date, desc, amount, category, paymentMethod: 'debito', cardId: null, pocketId: 2, cashback: 0, ...extra } as f.TxLike);

test('filtros de movimientos: cada filtro por separado', () => {
  const txs = [
    T(1, '2026-11-01', 'Supermercado Éxito', 100000, 'mercado'),
    T(2, '2026-11-02', 'NETFLIX', 38900, 'streaming', { paymentMethod: 'tarjeta', cardId: 301, pocketId: null, cashback: 389 }),
    T(3, '2026-11-03', 'Uber centro', 18700, 'uber', { paymentMethod: 'tarjeta', cardId: 302, pocketId: null }),
    T(4, '2026-10-20', 'Mercado octubre', 250000, 'mercado', { pocketId: 4 }),
  ];
  const ids = (fl: Partial<f.TxFilters>) => f.filterTransactions(txs, fl).map((t) => t.id);
  assert.deepEqual(ids({}), [1, 2, 3, 4]);
  assert.deepEqual(ids({ search: '  SUPER ' }), [1]);                      // sin importar mayúsculas ni espacios
  assert.deepEqual(ids({ search: 'mercado' }), [1, 4]);                      // 'Supermercado' también contiene 'mercado'
  assert.deepEqual(ids({ search: 'octubre' }), [4]);
  assert.deepEqual(ids({ categories: ['mercado', 'uber'] }), [1, 3, 4]);
  assert.deepEqual(ids({ cardId: '301' }), [2]);                              // el id puede venir como texto
  assert.deepEqual(ids({ cardId: 302 }), [3]);
  assert.deepEqual(ids({ pocketId: 4 }), [4]);
  assert.deepEqual(ids({ dateFrom: '2026-11-02' }), [2, 3]);
  assert.deepEqual(ids({ dateTo: '2026-10-31' }), [4]);
  assert.deepEqual(ids({ amountMin: 50000 }), [1, 4]);
  assert.deepEqual(ids({ amountMax: '40000' }), [2, 3]);
  assert.deepEqual(ids({ amountMin: 20000, amountMax: 100000 }), [1, 2]);
  assert.deepEqual(ids({ cashbackOnly: true }), [2]);
  assert.deepEqual(ids({ paymentMethod: 'tarjeta' }), [2, 3]);
  assert.deepEqual(ids({ categories: ['mercado'], amountMin: 150000, search: 'oct' }), [4]);   // los filtros se combinan (Y)
});

test('filtros de movimientos: conteo de filtros activos y rango de fechas', () => {
  assert.equal(f.countActiveFilters(f.emptyFilters()), 0);
  assert.equal(f.countActiveFilters({ search: '   ' }), 0);                  // solo espacios no es un filtro
  assert.equal(f.countActiveFilters({ dateFrom: '2026-11-01', dateTo: '2026-11-30' }), 1);   // el rango de fechas cuenta uno
  assert.equal(f.countActiveFilters({ amountMin: 0, amountMax: 5 }), 1);     // y el de montos, otro
  assert.equal(f.countActiveFilters({ amountMin: 0 }), 1);                    // 0 sí es un valor
  assert.equal(f.countActiveFilters({ search: 'a', categories: ['x'], cardId: 1, pocketId: 2, dateFrom: 'd', amountMax: 1, cashbackOnly: true, paymentMethod: 'tarjeta' }), 8);
  assert.equal(f.usingDateRange({ dateTo: '2026-11-30' }), true);
  assert.equal(f.usingDateRange({ search: 'x' }), false);
});

test('movimientos: con rango de fechas busca en todo el histórico; sin él, solo el mes', () => {
  const state: f.CoreState = { transactions: {
    '2026-11': [T(1, '2026-11-05', 'A', 10, 'x'), T(2, '2026-11-05', 'B', 20, 'x')],
    '2026-10': [T(3, '2026-10-30', 'C', 30, 'x')],
  } };
  assert.deepEqual(f.selectTransactions(state, '2026-11', {}).map((t) => t.id), [2, 1]);                    // mismo día: el id mayor primero
  assert.deepEqual(f.selectTransactions(state, '2026-11', { dateFrom: '2026-10-01' }).map((t) => t.id), [2, 1, 3]);   // histórico, más reciente arriba
  assert.deepEqual(f.selectTransactions(state, '2026-10', {}).map((t) => t.id), [3]);
  assert.deepEqual(f.selectTransactions({}, '2026-11', {}), []);
  const sorted = f.sortTransactions([{ ...T(1, '2026-11-05', 'a', 1, 'x'), createdAt: 50 }, { ...T(2, '2026-11-05', 'b', 1, 'x'), createdAt: 99 }] as f.TxLike[]);
  assert.deepEqual(sorted.map((t) => t.id), [2, 1]);                          // el desempate usa createdAt antes que el id
});

test('paginación: páginas, rangos y números a mostrar', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  let p = f.paginate(items, 1);
  assert.deepEqual([p.items.length, p.page, p.totalPages, p.start, p.end, p.total], [10, 1, 3, 1, 10, 25]);
  p = f.paginate(items, 3);
  assert.deepEqual([p.items, p.start, p.end], [[21, 22, 23, 24, 25], 21, 25]);
  assert.equal(f.paginate(items, 99).page, 3);                               // se ajusta si la página no existe
  assert.equal(f.paginate(items, 0).page, 1);
  assert.deepEqual([f.paginate([], 1).totalPages, f.paginate([], 1).items.length], [1, 0]);
  assert.deepEqual(f.pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(f.pageNumbers(1, 20), [1, 2, '…', 20]);
  assert.deepEqual(f.pageNumbers(10, 20), [1, '…', 9, 10, 11, '…', 20]);
  assert.deepEqual(f.pageNumbers(20, 20), [1, '…', 19, 20]);
  assert.deepEqual(f.pageNumbers(1, 1), [1]);
});

test('estadísticas de los movimientos filtrados', () => {
  const s = f.filterStats([T(1, '2026-11-01', 'a', 100, 'x', { cashback: 1 }), T(2, '2026-11-01', 'b', '250' as unknown as number, 'x', { cashback: '2' as unknown as number })]);
  assert.deepEqual(s, { count: 2, sum: 350, cashback: 3 });
  assert.deepEqual(f.filterStats([]), { count: 0, sum: 0, cashback: 0 });
});

test('tasa de ahorro: entera y nula si no hay ingresos', () => {
  assert.equal(f.savingsRate(4000000, 3000000), 25);
  assert.equal(f.savingsRate(3000000, 3500000), -17);                          // gastar más de lo que entra da tasa negativa
  assert.equal(f.savingsRate(0, 500000), null);
  assert.equal(f.savingsRate(-5, 1), null);
  assert.equal(f.savingsRate(3, 1), 67);
});

test('gasto por categoría del mes: sin pagos de tarjeta, ordenado', () => {
  const state: f.CoreState = { transactions: { '2026-11': [
    { amount: 100, category: 'a' }, { amount: 300, category: 'b' }, { amount: 50, category: 'a' },
    { amount: 999, category: 'pago_tarjeta' }, { amount: 777, category: 'c', payCardId: 5 }, { amount: 0, category: 'd' },
  ] } };
  assert.deepEqual(f.categoryTotals(state, '2026-11'), [{ id: 'b', value: 300 }, { id: 'a', value: 150 }]);
  assert.deepEqual(f.categoryTotals(state, '2026-10'), []);
});

test('ejes: pasos redondos y escala que cubre los datos', () => {
  assert.equal(f.niceStep(0), 1);
  assert.equal(f.niceStep(0.9), 1); assert.equal(f.niceStep(1.4), 1.5); assert.equal(f.niceStep(230000), 250000);
  const sc = f.niceScale(0, 4650000, 4);
  assert.ok(sc.min <= 0 && sc.max >= 4650000 && sc.ticks[0] === sc.min && sc.ticks[sc.ticks.length - 1] === sc.max);
  assert.deepEqual(f.niceScale(35, 55, 4).ticks, [35, 40, 45, 50, 55]);
  const flat = f.niceScale(4100, 4100);                                         // un solo valor: no se rompe
  assert.ok(flat.max > flat.min && flat.ticks.length >= 2);
  const neg = f.niceScale(-17, 60, 4); assert.ok(neg.min <= -17 && neg.max >= 60);
});

test('historial de la TRM: ventana de días y orden', () => {
  const hist = { '2026-11-10': 4100, '2026-10-12': 4000, '2026-09-01': 3900, '2026-11-01': 4050 };
  const today = new Date('2026-11-11T12:00:00Z');
  assert.deepEqual(f.trmWindow(hist, 7, today), { dates: ['2026-11-10'], values: [4100] });
  assert.deepEqual(f.trmWindow(hist, 30, today).dates, ['2026-10-12', '2026-11-01', '2026-11-10']);
  assert.deepEqual(f.trmWindow(hist, 90, today).dates.length, 4);
  assert.deepEqual(f.trmWindow({}, 30, today), { dates: [], values: [] });
});

test('señal del dólar: ±1,5 % contra el promedio del período', () => {
  assert.equal(f.trmInsight([]), null);
  const buy = f.trmInsight([4200, 4200, 4200, 4100])!;                         // hoy 4100 vs promedio 4175 → -1,8 %
  assert.equal(buy.tone, 'buy'); assert.ok(buy.pctVsAvg < -1.5);
  assert.equal(f.trmInsight([4000, 4000, 4000, 4000, 4040])!.tone, 'flat');    // hoy 4040 vs 4008 → +0,8 %
  assert.equal(f.trmInsight([4000, 4000, 4000, 4100])!.tone, 'sell');          // hoy 4100 vs 4025 → +1,9 %
  assert.equal(f.trmInsight([4000, 4000, 4000, 4150])!.tone, 'sell');          // hoy 4150 vs 4037,5 → +2,8 %
  const edge = f.trmInsight([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 98.5])!;
  assert.equal(edge.min, 98.5); assert.equal(edge.max, 100);
  assert.equal(f.trmInsight([4100])!.tone, 'flat');                              // un solo punto: sin señal
});

test('calendario: cortes y recordatorios; un día inexistente cae en el último del mes', () => {
  const state = { debts: [{ id: 1, name: 'Aurora', cutoffDay: 31, balance: 0 }, { id: 2, name: 'Brisa', cutoffDay: 5, balance: 0 }, { id: 3, name: 'SinCorte', balance: 0 }], reminders: {
    a: { title: 'Arriendo', date: '2026-09-30', recurring: 'monthly', amount: 1100000 },        // mensual desde septiembre, día 30
    b: { title: 'SOAT', date: '2025-11-20', recurring: 'yearly' },                                 // anual: noviembre
    c: { title: 'Cita', date: '2026-11-12' },                                                      // único, este mes
    d: { title: 'Otro mes', date: '2026-12-12' },                                                  // único, otro mes
    e: { title: 'Futuro mensual', date: '2027-01-15', recurring: 'monthly' },                      // todavía no empieza
    f: { title: 'Pago 31', date: '2026-01-31', recurring: 'monthly' },                             // día 31 en un mes de 30 días
    g: null, h: { title: 'Sin fecha' },
  } } as unknown as f.CoreState;
  const nov = f.calendarMonth(state, new Date(2026, 10, 11));                                       // noviembre de 2026: 30 días, empieza en domingo
  assert.deepEqual([nov.daysInMonth, nov.startWeekday], [30, 6]);
  assert.deepEqual(nov.events[30].map((e) => e.label), ['Corte Aurora', 'Arriendo', 'Pago 31']);   // 31 → 30
  assert.deepEqual(nov.events[5].map((e) => e.label), ['Corte Brisa']);
  assert.deepEqual(nov.events[20].map((e) => e.label), ['SOAT']);
  assert.deepEqual(nov.events[12].map((e) => e.label), ['Cita']);
  assert.equal(nov.events[12][0].type, 'reminder'); assert.equal(nov.events[12][0].reminderId, 'c');
  assert.equal(nov.events[30][1].amount, 1100000);
  assert.ok(!Object.values(nov.events).flat().some((e) => ['Otro mes', 'Futuro mensual', 'Sin fecha'].includes(e.label)));
  const feb = f.calendarMonth({ debts: [{ id: 1, name: 'X', cutoffDay: 30, balance: 0 }] } as unknown as f.CoreState, new Date(2027, 1, 10));   // febrero de 2027: 28 días
  assert.deepEqual(Object.keys(feb.events), ['28']);
  assert.equal(f.calendarMonth({}, new Date(2026, 10, 11)).events[1], undefined);
});

test('comparativa: sin pagos de tarjeta y con la opción de comparar el mismo período', () => {
  const tx = (date: string, amount: number, category: string, extra: Record<string, unknown> = {}) => ({ date, amount, category, ...extra });
  const state = { transactions: {
    '2026-11': [tx('2026-11-03', 100, 'a'), tx('2026-11-09', 50, 'b'), tx('2026-11-20', 999, 'a'), tx('2026-11-05', 700, 'pago_tarjeta', { payCardId: 7 })],
    '2026-10': [tx('2026-10-02', 80, 'a'), tx('2026-10-10', 20, 'c'), tx('2026-10-25', 400, 'a'), tx('2026-10-08', 500, 'pago_tarjeta')],
  } } as unknown as f.CoreState;
  const today = new Date(2026, 10, 11);
  const same = f.monthComparison(state, today, 'same-period');
  assert.equal(same.throughDay, 11);
  assert.deepEqual([same.currentTotal, same.previousTotal], [150, 100]);                // hasta el 11: nov 100+50 · oct 80+20; ni pagos de tarjeta ni lo posterior
  assert.equal(same.pct, 50);
  assert.equal(f.monthComparison({ transactions: { '2026-11': [tx('2026-11-03', 105, 'a')], '2026-10': [tx('2026-10-03', 100, 'a')] } } as unknown as f.CoreState, today).rows[0].trend, 'flat');   // +5 %: dentro del margen del 10 %
  assert.deepEqual(same.rows.map((r) => [r.id, r.current, r.previous, r.trend, r.isNew]), [['a', 100, 80, 'up', false], ['b', 50, 0, 'up', true], ['c', 0, 20, 'down', false]]);
  const full = f.monthComparison(state, today, 'full');
  assert.deepEqual([full.currentTotal, full.previousTotal, full.throughDay], [1149, 500, null]);   // mes completo; el pago de tarjeta sigue sin contar
  assert.ok(full.rows.every((r) => r.id !== 'pago_tarjeta'));
  assert.equal(f.monthComparison({}, today).hasData, false);
  assert.equal(f.monthComparison({ transactions: { '2026-11': [tx('2026-11-01', 5, 'pago_tarjeta', { payCardId: 1 })] } } as unknown as f.CoreState, today).hasData, false);   // solo pagos de tarjeta: no hay qué comparar
  assert.equal(f.monthComparison({ transactions: { '2026-11': [tx('2026-11-01', 5, 'a')] } } as unknown as f.CoreState, today).pct, null);             // sin mes anterior no hay %
  // marzo: el mes anterior (febrero) tiene 28 días; el día 31 compara con todo febrero
  const mar = f.monthComparison({ transactions: { '2027-02': [tx('2027-02-28', 10, 'a')], '2027-03': [tx('2027-03-31', 10, 'a')] } } as unknown as f.CoreState, new Date(2027, 2, 31));
  assert.deepEqual([mar.currentTotal, mar.previousTotal], [10, 10]);
});

test('gastos hormiga: pequeños y repetidos; sin pagos de tarjeta ni cuotas', () => {
  const tx = (date: string, desc: string, amount: number, extra: Record<string, unknown> = {}) => ({ date, desc, amount, category: 'x', ...extra });
  const state = { transactions: {
    '2026-10': [tx('2026-10-02', 'Tinto Oxxo', 3000), tx('2026-10-09', 'tinto oxxo centro', 3500), tx('2026-10-20', 'Uber', 18000), tx('2026-10-21', 'PORTATIL (cuota 1/10)', 40000, { installment: { current: 1, total: 10 } })],
    '2026-11': [tx('2026-11-02', 'Tinto  Oxxo', 4000), tx('2026-11-05', 'Uber', 22000), tx('2026-11-06', 'PORTATIL (cuota 2/10)', 40000, { installment: { current: 2, total: 10 } }), tx('2026-11-07', 'PAGO TARJETA', 30000, { payCardId: 3 }), tx('2026-11-08', 'Cena grande', 200000)],
  } } as unknown as f.CoreState;
  const r = f.antExpenses(state);
  assert.equal(r.enough, true);
  assert.deepEqual(r.patterns.map((p) => p.key), ['uber', 'tinto oxxo']);               // ni cuotas, ni pago de tarjeta, ni la cena de 200.000
  const tinto = r.patterns[1];
  assert.deepEqual([tinto.count, tinto.total, tinto.monthsSpan], [3, 10500, 2]);
  assert.equal(tinto.avg, 3500);
  assert.equal(tinto.projectedYear, (10500 / 2) * 12);                                 // 63.000 al año
  assert.equal(r.patterns[0].projectedYear, (40000 / 2) * 12);
  assert.deepEqual(f.antExpenses({ transactions: { '2026-11': [tx('2026-11-01', 'a', 1), tx('2026-11-02', 'a', 1)] } } as unknown as f.CoreState), { enough: false, patterns: [] });
  const solo = f.antExpenses({ transactions: { '2026-11': ['a', 'b', 'c', 'd', 'e'].map((d, i) => tx('2026-11-0' + (i + 1), d, 100)) } } as unknown as f.CoreState);
  assert.deepEqual(solo, { enough: true, patterns: [] });                              // suficientes datos pero ningún patrón repetido
});

test('tarjetas: resumen general (cupo, saldo, utilización y cashback del mes)', () => {
  const state = { debts: [{ id: 301, name: 'A', balance: 1450000, payment: 8000000 }, { id: 302, name: 'B', balance: '820000', payment: '6000000' }], transactions: { '2026-11': [
    { amount: 100, cardId: 301, cashback: 1000 }, { amount: 100, cardId: '302', cashback: '500' }, { amount: 100, cardId: null, cashback: 9999 }, { amount: 100, cardId: 999, cashback: 777 },
  ], '2026-10': [{ amount: 1, cardId: 301, cashback: 5000 }] } } as unknown as f.CoreState;
  const o = f.cardsOverview(state, '2026-11');
  assert.deepEqual([o.count, o.limit, o.debt, o.available, o.cashbackMonth], [2, 14000000, 2270000, 11730000, 1500]);   // el cashback es solo de este mes y de estas tarjetas
  assert.ok(Math.abs(o.util - (2270000 / 14000000) * 100) < 1e-9);
  assert.deepEqual(f.cardsOverview({}, '2026-11'), { count: 0, limit: 0, debt: 0, available: 0, util: 0, cashbackMonth: 0 });
  assert.equal(f.cardsOverview({ debts: [{ id: 1, name: 'x', balance: 500 }] } as unknown as f.CoreState, '2026-11').util, 0);   // sin cupo no hay %, no es infinito
});

test('tarjetas: qué consejo se muestra y color de urgencia', () => {
  assert.equal(f.cardInsightKind(80, 800, 1000, true), 'urgent');              // una tarjeta que corta mañana manda sobre todo
  assert.equal(f.cardInsightKind(0, 0, 1000, false), 'clean');
  assert.equal(f.cardInsightKind(0, 0, 0, false), 'clean');                    // sin tarjetas con saldo
  assert.equal(f.cardInsightKind(0, 500, 0, false), 'no-limit');               // saldo sin cupo registrado: no se puede decir "excelente"
  assert.equal(f.cardInsightKind(0.1, 1, 1000, false), 'ok');
  assert.equal(f.cardInsightKind(30, 300, 1000, false), 'ok');
  assert.equal(f.cardInsightKind(30.01, 300.1, 1000, false), 'warn');
  assert.equal(f.cardInsightKind(50, 500, 1000, false), 'warn');
  assert.equal(f.cardInsightKind(50.01, 500.1, 1000, false), 'high');
  assert.deepEqual([-2, 0, 1, 2, 3, 4, 7, 8, 30].map(f.urgencyTone), ['danger', 'danger', 'danger', 'warning', 'warning', 'info', 'info', 'muted', 'muted']);
});

test('tarjetas: estadísticas del mes de una tarjeta (impacto real, cashback y orden)', () => {
  const state = { transactions: { '2026-11': [
    { id: 1, date: '2026-11-03', amount: 30000, cardId: 301, cashback: 300 },
    { id: 2, date: '2026-11-09', amount: 30000, cardId: '301', cashback: '200', isShared: true, totalAmount: 90000 },        // compartido: la tarjeta cargó 90.000
    { id: 3, date: '2026-11-05', amount: 120000, cardId: 301, isLent: true, totalAmount: 120000, cashback: 1200 },
    { id: 4, date: '2026-11-07', amount: 90000, cardId: 301, installment: { current: 3, total: 10 }, totalAmount: 900000 },      // cuota: pesa la cuota, no el precio completo
    { id: 5, date: '2026-11-08', amount: 5000, cardId: 302 }, { id: 6, date: '2026-11-08', amount: 7000, cardId: null }, { id: 7, date: '2026-11-08', amount: 9, cashback: 99 },
  ], '2026-10': [{ id: 8, date: '2026-10-01', amount: 1, cardId: 301 }] } } as unknown as f.CoreState;
  const s = f.cardMonthStats(state, 301, '2026-11');
  assert.deepEqual([s.txCount, s.totalSpent, s.totalCashback], [4, 30000 + 90000 + 120000 + 90000, 1700]);
  assert.deepEqual(s.transactions.map((t) => t.id), [2, 4, 3, 1]);                       // más reciente primero
  assert.deepEqual(f.cardMonthStats(state, 999, '2026-11'), { txCount: 0, totalSpent: 0, totalCashback: 0, transactions: [] });
  assert.equal(f.cardMonthStats(state, 301, '2026-12').txCount, 0);
  assert.deepEqual([0, 10, 10.1, 30, 30.1, 95].map(f.utilBarTone), ['success', 'success', 'warning', 'warning', 'danger', 'danger']);
});
