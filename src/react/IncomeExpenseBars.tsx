import { useState } from 'react';
import { compact, monthName, pct, type Snapshot } from './fp';
import { useWidth } from './useWidth';

const H = 250;
const M = { t: 14, r: 8, b: 30, l: 62 };

/** Paso "redondo" para el eje: 1, 1,5, 2, 2,5, 3, 4, 5, 7,5 o 10 por potencia de 10. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nf = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 7.5 ? 7.5 : 10;
  return nf * exp;
}

/** Ingresos vs gastos de los últimos 6 meses, con detalle al pasar el cursor. */
export function IncomeExpenseBars({ snap }: { snap: Snapshot }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = snap.series;
  const top = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0);
  const step4 = niceStep(top / 4);
  const max = Math.max(step4, Math.ceil(top / step4) * step4);
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  const plotW = Math.max(10, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const step = plotW / data.length;
  const barW = Math.min(28, step * 0.3);
  const y = (v: number) => M.t + plotH - (v / max) * plotH;
  const ticks = Array.from({ length: Math.round(max / step4) + 1 }, (_, i) => i * step4);

  const sel = hover !== null ? data[hover] : data[data.length - 1];
  const margin = sel.income - sel.expense;
  const rate = pct(margin, sel.income);

  return (
    <section className="raised-card fp-card" aria-labelledby="fp-flow-title">
      <header className="fp-card-head">
        <h3 id="fp-flow-title" className="card-title">Ingresos vs gastos</h3>
        <span className="fp-sub">Últimos 6 meses</span>
      </header>
      {!hasData ? (
        <p className="fp-empty">Todavía no hay movimientos para comparar. Registra un gasto o un ingreso y aparecerá aquí.</p>
      ) : (
        <>
          <div className="fp-stats">
            <div><span className="fp-stat-label">{monthName(sel.month)}</span></div>
            <div><span className="fp-stat-label"><i className="fp-dot" style={{ background: 'var(--fp-income)' }} /> Ingresos</span><strong>{snap.fmt(sel.income)}</strong></div>
            <div><span className="fp-stat-label"><i className="fp-dot" style={{ background: 'var(--fp-expense)' }} /> Gastos</span><strong>{snap.fmt(sel.expense)}</strong></div>
            <div><span className="fp-stat-label">Ahorro</span><strong className={margin >= 0 ? 'fp-pos' : 'fp-neg'}>{snap.fmt(margin)}{sel.income > 0 ? ` · ${rate.toFixed(0)} %` : ''}</strong></div>
          </div>
          <div ref={ref} className="fp-chart" onMouseLeave={() => setHover(null)}>
            <svg width={width} height={H} role="img" aria-label="Gráfica de barras de ingresos y gastos por mes">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} className="fp-grid" />
                  <text x={M.l - 10} y={y(t) + 4} textAnchor="end" className="fp-axis">{compact(t)}</text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = M.l + step * i + step / 2;
                const isCur = d.month === snap.month;
                return (
                  <g key={d.month} className={hover === i ? 'fp-col is-hover' : 'fp-col'}>
                    <rect x={cx - step / 2} y={M.t} width={step} height={plotH} className="fp-hit" onMouseEnter={() => setHover(i)} />
                    {d.income > 0 && <rect x={cx - barW - 2} y={y(d.income)} width={barW} height={Math.max(2, M.t + plotH - y(d.income))} rx="5" className="fp-bar fp-bar-in" style={{ animationDelay: `${i * 45}ms` }} />}
                    {d.expense > 0 && <rect x={cx + 2} y={y(d.expense)} width={barW} height={Math.max(2, M.t + plotH - y(d.expense))} rx="5" className="fp-bar fp-bar-out" style={{ animationDelay: `${i * 45 + 25}ms` }} />}
                    <text x={cx} y={H - 9} textAnchor="middle" className={isCur ? 'fp-axis fp-axis-cur' : 'fp-axis'}>{d.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}
