import { useState, type ReactNode } from 'react';
import { categoryTotals, niceScale, savingsRate, trmInsight, trmWindow, type CoreState } from '../core/finance';
import { compact, monthName, useFP, type Category } from './fp';
import { useWidth } from './useWidth';

const PALETTE = ['#2f7566', '#c1584f', '#3d6f8f', '#ba7517', '#7a6bab', '#4a8f6b', '#a8505f', '#5f8ab5', '#8c8577'];
const M = { t: 12, r: 12, b: 28, l: 62 };

function Empty({ h, children }: { h: number; children: ReactNode }) {
  return <div className="fp-chart-empty" style={{ height: h }}>{children}</div>;
}

/** Curva suave por los puntos; se corta donde hay huecos (null). Devuelve cada tramo con su primer y último punto (para cerrar el área). */
function smoothSegments(pts: ({ x: number; y: number } | null)[]): { d: string; first: { x: number; y: number }; last: { x: number; y: number } }[] {
  const segs: { x: number; y: number }[][] = []; let cur: { x: number; y: number }[] = [];
  for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  const k = 0.18;
  return segs.map((q) => {
    let d = `M${q[0].x},${q[0].y}`;
    for (let i = 0; i < q.length - 1; i++) {
      const p0 = q[i - 1] || q[i], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2] || p2;
      const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);          // la curva no se sale del rango entre dos puntos (sin "rebotes")
      const c1y = Math.min(hi, Math.max(lo, p1.y + (p2.y - p0.y) * k)), c2y = Math.min(hi, Math.max(lo, p2.y - (p3.y - p1.y) * k));
      d += ` C${p1.x + (p2.x - p0.x) * k},${c1y} ${p2.x - (p3.x - p1.x) * k},${c2y} ${p2.x},${p2.y}`;
    }
    return { d, first: q[0], last: q[q.length - 1] };
  });
}

/** Ingresos vs gastos reales de los últimos 6 meses (barras agrupadas). */
export function IncomeExpenseChart() {
  const snap = useFP();
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220, data = snap.series;
  if (!data.some((d) => d.income > 0 || d.expense > 0)) return <Empty h={H}>Registra ingresos y gastos para ver esta comparación.</Empty>;
  const top = Math.max(...data.map((d) => Math.max(d.income, d.expense)));
  const sc = niceScale(0, top, 4);
  const plotW = Math.max(10, width - M.l - M.r), plotH = H - M.t - M.b - 22, step = plotW / data.length, bw = Math.min(30, step * 0.28);
  const y = (v: number) => M.t + plotH - ((v - sc.min) / (sc.max - sc.min)) * plotH;
  const sel = hover !== null ? data[hover] : null;
  return (
    <div ref={ref} className="fp-chart" onMouseLeave={() => setHover(null)} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label="Ingresos y gastos de los últimos 6 meses" data-income={JSON.stringify(data.map((d) => d.income))} data-expense={JSON.stringify(data.map((d) => d.expense))}>
        {sc.ticks.map((t) => <g key={t}><line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} className="fp-grid" /><text x={M.l - 10} y={y(t) + 4} textAnchor="end" className="fp-axis">{compact(t)}</text></g>)}
        {data.map((d, i) => {
          const cx = M.l + step * i + step / 2;
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthName(d.month)}: ingresos ${snap.fmt(d.income)}, gastos ${snap.fmt(d.expense)}`}>
              <rect x={M.l + step * i} y={M.t} width={step} height={plotH} fill="transparent" />
              <rect x={cx - bw - 2} y={y(d.income)} width={bw} height={Math.max(0, y(0) - y(d.income))} rx={5} fill="var(--fp-income, #2f7566)" opacity={hover === null || hover === i ? 1 : 0.45} />
              <rect x={cx + 2} y={y(d.expense)} width={bw} height={Math.max(0, y(0) - y(d.expense))} rx={5} fill="var(--fp-expense, #c1584f)" opacity={hover === null || hover === i ? 1 : 0.45} />
              <text x={cx} y={H - 30} textAnchor="middle" className="fp-axis">{d.label}</text>
            </g>
          );
        })}
        <g transform={`translate(${width / 2 - 70},${H - 10})`} className="fp-legend">
          <circle cx={0} cy={-4} r={5} fill="var(--fp-income, #2f7566)" /><text x={10} y={0} className="fp-axis">Ingresos</text>
          <circle cx={90} cy={-4} r={5} fill="var(--fp-expense, #c1584f)" /><text x={100} y={0} className="fp-axis">Gastos</text>
        </g>
      </svg>
      {sel && <div className="fp-tip" style={{ left: Math.min(Math.max(8, M.l + step * hover! + step / 2 - 80), width - 170), top: 6 }}>
        <strong>{monthName(sel.month)}</strong><span>Ingresos: {snap.fmt(sel.income)}</span><span>Gastos: {snap.fmt(sel.expense)}</span>
      </div>}
    </div>
  );
}

/** Tasa de ahorro mensual (línea con área). */
export function SavingsRateChart() {
  const snap = useFP();
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180, data = snap.series, rates = data.map((d) => savingsRate(d.income, d.expense));
  const real = rates.filter((r): r is number => r !== null);
  if (!real.length) return <Empty h={H}>Registra ingresos para ver tu tasa de ahorro.</Empty>;
  const sc = niceScale(Math.min(...real), Math.max(...real), 4);
  const plotW = Math.max(10, width - M.l + 20 - M.r), plotH = H - M.t - M.b, step = plotW / data.length, L = M.l - 20;
  const y = (v: number) => M.t + plotH - ((v - sc.min) / (sc.max - sc.min)) * plotH;
  const pts = rates.map((r, i) => (r === null ? null : { x: L + step * i + step / 2, y: y(r) }));
  const base = y(sc.min <= 0 && sc.max >= 0 ? 0 : sc.min);
  const paths = smoothSegments(pts);
  return (
    <div ref={ref} className="fp-chart" onMouseLeave={() => setHover(null)} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label="Tasa de ahorro mensual" data-rates={JSON.stringify(rates)}>
        {sc.ticks.map((t) => <g key={t}><line x1={L} x2={width - M.r} y1={y(t)} y2={y(t)} className="fp-grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="fp-axis">{t}%</text></g>)}
        {paths.map((sg, i) => <g key={i}><path d={`${sg.d} L${sg.last.x},${base} L${sg.first.x},${base} Z`} fill="var(--fp-income, #2f7566)" opacity={0.14} /><path d={sg.d} fill="none" stroke="var(--fp-income, #2f7566)" strokeWidth={2.2} /></g>)}
        {pts.map((p, i) => p && <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthName(data[i].month)}: ${rates[i]}% de ahorro`}><circle cx={p.x} cy={p.y} r={14} fill="transparent" /><circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill="var(--fp-income, #2f7566)" /></g>)}
        {data.map((d, i) => <text key={d.month} x={L + step * i + step / 2} y={H - 8} textAnchor="middle" className="fp-axis">{d.label}</text>)}
      </svg>
      {hover !== null && rates[hover] !== null && <div className="fp-tip" style={{ left: Math.min(Math.max(8, L + step * hover + step / 2 - 60), width - 130), top: 2 }}><strong>{monthName(data[hover].month)}</strong><span>{rates[hover]}% de ahorro</span></div>}
    </div>
  );
}

/** ¿En qué se va tu dinero? Gasto del mes actual por categoría (dona + lista). */
export function CategoryDonutChart() {
  const snap = useFP();
  const fp = window.FP || {};
  const state = ((fp.getState && fp.getState()) || {}) as unknown as CoreState;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const entries = categoryTotals(state, month);
  if (!entries.length) return <Empty h={120}>Registra gastos este mes para ver tu distribución por categoría.</Empty>;
  const cats = ((fp.getCategories && fp.getCategories()) || []) as Category[];
  const rows = entries.map((e, i) => { const c = cats.find((x) => x.id === e.id); return { label: c ? `${c.icon || ''} ${c.label}` : `📋 ${e.id}`, value: Math.round(e.value), color: PALETTE[i % PALETTE.length] }; });
  const total = rows.reduce((a, r) => a + r.value, 0);
  const R = 62, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="fp-donut-wrap">
      <svg width={180} height={180} viewBox="0 0 180 180" role="img" aria-label="Gasto por categoría del mes actual" data-values={JSON.stringify(rows.map((r) => r.value))} data-labels={JSON.stringify(rows.map((r) => r.label))}>
        <g transform="rotate(-90 90 90)">
          {rows.map((r) => { const len = (r.value / total) * C; const el = <circle key={r.label} cx={90} cy={90} r={R} fill="none" stroke={r.color} strokeWidth={26} strokeDasharray={`${Math.max(0, len - (rows.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-acc}><title>{`${r.label}: ${snap.fmt(r.value)}`}</title></circle>; acc += len; return el; })}
        </g>
        <text x={90} y={86} textAnchor="middle" className="fp-axis">Total</text>
        <text x={90} y={106} textAnchor="middle" className="fp-donut-total">{compact(total)}</text>
      </svg>
      <ul className="fp-donut-legend">
        {rows.map((r) => <li key={r.label}><i className="fp-dot" style={{ background: r.color }} /><span className="fp-dl-name">{r.label}</span><span className="fp-dl-val">{snap.fmt(r.value)}</span><span className="fp-dl-pct">{((r.value / total) * 100).toFixed(1)}%</span></li>)}
      </ul>
    </div>
  );
}

/** Historial de la TRM: lee el mismo historial guardado que usa la app y el rango elegido en el selector. */
function useTrm() {
  useFP();                                                                   // se vuelve a dibujar con "fp:change"
  let history: Record<string, number> = {};
  try { history = JSON.parse(localStorage.getItem('finanzaspro_trm_history') || '{}'); } catch { history = {}; }
  const sel = document.getElementById('trm-history-range') as HTMLSelectElement | null;
  const days = sel ? parseInt(sel.value, 10) || 30 : 30;
  const w = trmWindow(history, days);
  return { days, ...w };
}
export function TrmChart() {
  const t = useTrm();
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  if (t.dates.length < 2) return <div ref={ref} />;
  const sc = niceScale(Math.min(...t.values), Math.max(...t.values), 4);
  const L = 74, plotW = Math.max(10, width - L - M.r), plotH = H - M.t - M.b;
  const x = (i: number) => L + (plotW * i) / (t.dates.length - 1), y = (v: number) => M.t + plotH - ((v - sc.min) / (sc.max - sc.min)) * plotH;
  const pts = t.values.map((v, i) => ({ x: x(i), y: y(v) }));
  const sg = smoothSegments(pts)[0], showPts = t.dates.length <= 45;
  const every = Math.max(1, Math.ceil(t.dates.length / 6));
  const lab = (s: string) => { const [, m, dd] = s.split('-'); return `${dd}/${m}`; };
  return (
    <div ref={ref} className="fp-chart" onMouseLeave={() => setHover(null)} style={{ position: 'relative' }}>
      <svg width={width} height={H} role="img" aria-label="Historial de la TRM" data-values={JSON.stringify(t.values)} data-dates={JSON.stringify(t.dates)}>
        {sc.ticks.map((v) => <g key={v}><line x1={L} x2={width - M.r} y1={y(v)} y2={y(v)} className="fp-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="fp-axis">{'$' + v.toLocaleString('es-CO')}</text></g>)}
        <path d={`${sg.d} L${sg.last.x},${y(sc.min)} L${sg.first.x},${y(sc.min)} Z`} fill="var(--fp-income, #2f7566)" opacity={0.12} />
        <path d={sg.d} fill="none" stroke="var(--fp-income, #2f7566)" strokeWidth={2} />
        {pts.map((p, i) => <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={showPts || hover === i ? 0 : -1} aria-label={`${lab(t.dates[i])}: ${'$' + t.values[i].toLocaleString('es-CO')}`}><circle cx={p.x} cy={p.y} r={10} fill="transparent" />{(showPts || hover === i) && <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 2.5} fill="var(--fp-income, #2f7566)" />}</g>)}
        {t.dates.map((s, i) => (i % every === 0 || i === t.dates.length - 1) && <text key={s} x={x(i)} y={H - 8} textAnchor="middle" className="fp-axis">{lab(s)}</text>)}
      </svg>
      {hover !== null && <div className="fp-tip" style={{ left: Math.min(Math.max(8, x(hover) - 70), width - 150), top: 2 }}><strong>{lab(t.dates[hover])}</strong><span>{'TRM: ' + '$' + t.values[hover].toLocaleString('es-CO')}</span></div>}
    </div>
  );
}
export function TrmInsight() {
  const t = useTrm();
  const f = (window.FP && window.FP.fmt) || ((n: number) => '$ ' + Math.round(n).toLocaleString('es-CO'));
  if (t.dates.length < 2) return <div className="empty-state">Estamos empezando a guardar el historial de la TRM — vuelve en unos días para ver la tendencia y recibir recomendaciones de cuándo comprar o vender.</div>;
  const i = trmInsight(t.values)!;
  const view = i.tone === 'buy'
    ? { icon: '🟢', title: 'Buen momento para comprar dólares', color: 'var(--success-text)', text: `La TRM de hoy (${f(i.current)}) está ${Math.abs(i.pctVsAvg).toFixed(1)}% por debajo del promedio de los últimos ${t.days} días. Si necesitas dólares pronto, este es un precio relativamente bajo.` }
    : i.tone === 'sell'
      ? { icon: '🔵', title: 'Buen momento para vender dólares', color: 'var(--info-text)', text: `La TRM de hoy (${f(i.current)}) está ${i.pctVsAvg.toFixed(1)}% por encima del promedio de los últimos ${t.days} días. Si tienes dólares para cambiar, este es un precio relativamente alto.` }
      : { icon: '⚪', title: 'La TRM está en su promedio habitual', color: 'var(--text-secondary)', text: `La TRM de hoy (${f(i.current)}) está cerca del promedio de los últimos ${t.days} días (${f(i.avg)}). No hay una señal fuerte de que sea un momento especialmente bueno o malo.` };
  return (
    <div className="fp-trm-insight">
      <div className="fp-trm-signal" style={{ borderLeftColor: view.color }}>
        <div className="fp-trm-title" style={{ color: view.color }}>{`${view.icon} ${view.title}`}</div>
        <div className="fp-trm-text">{view.text}</div>
      </div>
      <div className="fp-trm-range"><span>{`Mínimo: ${f(i.min)}`}</span><span>·</span><span>{`Máximo: ${f(i.max)}`}</span><span>·</span><span>{`Promedio: ${f(i.avg)}`}</span></div>
      <div className="fp-trm-note">💡 Esto es información histórica, no una predicción. El mercado cambiario puede moverse por muchas razones — úsalo como referencia, no como garantía.</div>
    </div>
  );
}
