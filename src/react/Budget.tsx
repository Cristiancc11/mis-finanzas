import { useState } from 'react';
import type { Snapshot } from './fp';
import { useFP } from './fp';
import type { BudgetRow } from '../core/finance';

/** KPIs de Presupuesto: ingreso del mes, presupuesto total, gastado y margen real. */
export function BudgetKpis() {
  const s = useFP();
  const { recurring, extras, cashback } = s.income;
  const income = recurring + extras + cashback;
  const { totalBudget, totalSpent } = s.overview;
  const margin = income - totalSpent;
  const projected = income - totalBudget;
  const parts: string[] = [];
  if (extras > 0 || cashback > 0) {
    if (recurring > 0) parts.push(`Salario ${s.fmt(recurring)}`);
    if (extras > 0) parts.push(`+ Extras ${s.fmt(extras)}`);
    if (cashback > 0) parts.push(`+ Cashback ${s.fmt(cashback)}`);
  }
  return (
    <div className="fin-grid-4">
      <div className="metric-card">
        <div className="metric-label">Ingreso del mes</div>
        <div className="metric-value" style={{ color: 'var(--success-text)' }}>{s.fmt(income)}</div>
        {parts.length > 0 && <div className="metric-sub">{parts.join(' ')}</div>}
      </div>
      <div className="metric-card">
        <div className="metric-label">Presupuesto total</div>
        <div className="metric-value" style={{ color: 'var(--info-text)' }}>{s.fmt(totalBudget)}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Gastado hasta hoy</div>
        <div className="metric-value" style={{ color: 'var(--danger-text)' }}>{s.fmt(totalSpent)}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Margen real</div>
        <div className={`metric-value ${margin >= 0 ? 'balance-positive' : 'balance-negative'}`}>{s.fmt(margin)}</div>
        <div className="metric-sub">Si gastas todo: {s.fmt(projected)}</div>
      </div>
    </div>
  );
}

function statusText(r: BudgetRow, s: Snapshot): string {
  if (!r.hasBudget) return r.spent > 0 ? 'Sin límite (solo seguimiento)' : 'Sin gastos';
  if (r.spent === r.budget) return 'Llegaste al límite';          // antes decía "Excediste $ 0"
  return r.pct >= 100 ? `Excediste ${s.fmt(r.spent - r.budget)}` : `${r.pct.toFixed(0)}% usado`;
}

/** Presupuesto vs gasto real por categoría, ordenado por urgencia. */
export function BudgetCategories() {
  const s = useFP();
  const o = s.overview;
  const any = o.counts.over + o.counts.warn + o.counts.ok > 0;
  // Las categorías sin presupuesto y sin gasto solo hacen ruido: se pliegan detrás de un botón (antes ocupaban casi la mitad de la lista).
  const [showEmpty, setShowEmpty] = useState(false);
  const isEmpty = (r: BudgetRow) => r.tone === 'tracking' && r.spent === 0;
  const emptyCount = o.rows.filter(isEmpty).length;
  const rows = showEmpty ? o.rows : o.rows.filter((r) => !isEmpty(r));
  return (
    <div className="fp-budget">
      {any && (
        <div className="fp-chips">
          {o.counts.over > 0 && <span className="fp-chip fp-chip-over">{`⚠️ ${o.counts.over} excedida${o.counts.over > 1 ? 's' : ''}`}</span>}
          {o.counts.warn > 0 && <span className="fp-chip fp-chip-warn">{`🟡 ${o.counts.warn} cerca del límite`}</span>}
          {o.counts.ok > 0 && <span className="fp-chip fp-chip-ok">{`✅ ${o.counts.ok} bajo control`}</span>}
        </div>
      )}
      <div className="fp-budget-head" aria-hidden="true">
        <span>Categoría</span><span>Presupuesto</span><span>Gastado</span><span>Disponible</span>
      </div>
      <div role="list">
        {rows.map((r) => {
          const fill = r.tone === 'tracking' ? 'neutral' : r.tone;
          return (
            <div role="listitem" key={r.id} className={`fp-budget-row is-${r.tone}`}>
              <div className="fp-bcat">{`${r.icon} ${r.label}`}</div>
              <div className="fp-bbud">{r.hasBudget ? s.fmt(r.budget) : <em>Sin límite</em>}</div>
              <div className="fp-bspent">
                <strong>{s.fmt(r.spent)}</strong>
                <div className="fp-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.barWidth)} aria-label={`${r.label}: ${statusText(r, s)}`}>
                  <div className={`fp-fill fp-${fill}`} style={{ width: `${r.barWidth}%` }} />
                </div>
                <span className={`fp-bstatus is-${r.tone}`}>{statusText(r, s)}</span>
              </div>
              <div className={`fp-bavail ${r.hasBudget ? (r.available < 0 ? 'balance-negative' : 'balance-positive') : ''}`}>{r.hasBudget ? s.fmt(r.available) : '—'}</div>
            </div>
          );
        })}
      </div>
      {emptyCount > 0 && (
        <button type="button" className="fp-link fp-empty-toggle" aria-expanded={showEmpty} onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? 'Ocultar las categorías sin movimiento' : `Mostrar ${emptyCount} ${emptyCount === 1 ? 'categoría' : 'categorías'} sin gasto ni presupuesto`}
        </button>
      )}
      <div className="fp-btotals">
        <div className="summary-row"><span>Total presupuestado</span><span>{s.fmt(o.totalBudget)}</span></div>
        <div className="summary-row"><span>Total gastado</span><span>{s.fmt(o.totalSpent)}</span></div>
        <div className="summary-row"><span>Disponible restante</span><span style={{ color: o.available >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{s.fmt(o.available)}</span></div>
      </div>
    </div>
  );
}
