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
