// Punto de entrada de las "islas" React: se montan dentro de la app actual, sin reescribirla de golpe.
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ResumenCharts } from './ResumenCharts';
import { BudgetKpis, BudgetCategories } from './Budget';
import { Transactions } from './Transactions';
import { MonthComparison, AntExpenses, FinancialCalendar } from './AnalysisInsights';
import { IncomeExpenseChart, SavingsRateChart, CategoryDonutChart, TrmChart, TrmInsight } from './AnalysisCharts';

/** Crea un contenedor justo antes de un elemento de la app actual (que queda oculto por CSS cuando React ya dibuja esa parte). */
function rootBefore(id: string, refSelector: string): HTMLElement | null {
  if (document.getElementById(id)) return null;
  const ref = document.querySelector(refSelector);
  if (!ref || !ref.parentNode) return null;
  const el = document.createElement('div');
  el.id = id;
  ref.parentNode.insertBefore(el, ref);
  return el;
}

function mount() {
  const charts = document.getElementById('react-resumen-charts');
  if (charts && !charts.dataset.mounted) {
    charts.dataset.mounted = '1';
    createRoot(charts).render(<ResumenCharts />);
  }
  // Presupuesto: KPIs y categorías. El código anterior sigue calculando (oculto) mientras se termina la migración.
  const kpis = rootBefore('react-budget-kpis', '#budget-summary');
  const cats = rootBefore('react-budget-categories', '#budget-quick-summary');
  if (kpis) createRoot(kpis).render(<BudgetKpis />);
  if (cats) createRoot(cats).render(<BudgetCategories />);
  if (kpis && cats) document.documentElement.classList.add('fp-react-budget');
  // Presupuesto: lista de movimientos (búsqueda, filtros, chips, paginación)
  const tx = rootBefore('react-tx', '#subsection-movimientos .tx-header');
  if (tx) { createRoot(tx).render(<Transactions />); document.documentElement.classList.add('fp-react-tx'); }
  // Análisis y Conversor: las gráficas dibujadas antes con Chart.js (que ya no se carga)
  const swap = (canvasId: string, node: ReactElement) => {
    const canvas = document.getElementById(canvasId);
    const wrap = canvas && canvas.parentElement;
    if (!wrap || wrap.dataset.react) return;
    wrap.dataset.react = '1'; wrap.style.height = 'auto'; wrap.innerHTML = '';
    createRoot(wrap).render(node);
  };
  swap('chart-income-expense', <IncomeExpenseChart />);
  swap('chart-savings-rate', <SavingsRateChart />);
  swap('chart-category-pie', <CategoryDonutChart />);
  swap('trm-history-chart', <TrmChart />);

  // Análisis: comparativa con el mes anterior, gastos hormiga y calendario (el código anterior sigue calculando, oculto)
  const cmp = rootBefore('react-month-comparison', '#month-comparison-content');
  const ant = rootBefore('react-ant-expenses', '#ant-expenses-content');
  const cal = rootBefore('react-fin-calendar', '#financial-calendar');
  if (cmp) createRoot(cmp).render(<MonthComparison />);
  if (ant) createRoot(ant).render(<AntExpenses />);
  if (cal) createRoot(cal).render(<FinancialCalendar />);
  if (cmp && ant && cal) document.documentElement.classList.add('fp-react-insights');
  const insight = document.getElementById('trm-history-insight');
  if (insight && !insight.dataset.react) { insight.dataset.react = '1'; insight.innerHTML = ''; createRoot(insight).render(<TrmInsight />); }

}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
