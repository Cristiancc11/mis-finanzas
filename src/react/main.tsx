// Punto de entrada de las "islas" React: se montan dentro de la app actual, sin reescribirla de golpe.
import { createRoot } from 'react-dom/client';
import { ResumenCharts } from './ResumenCharts';

function mount() {
  const el = document.getElementById('react-resumen-charts');
  if (el && !el.dataset.mounted) {
    el.dataset.mounted = '1';
    createRoot(el).render(<ResumenCharts />);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
