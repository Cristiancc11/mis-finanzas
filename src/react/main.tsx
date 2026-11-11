// Punto de entrada de las "islas" React: se montan dentro de la app actual, sin reescribirla de golpe.
import { createRoot } from 'react-dom/client';
import { ResumenCharts } from './ResumenCharts';
import { BudgetKpis, BudgetCategories } from './Budget';
import { Transactions } from './Transactions';

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
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
