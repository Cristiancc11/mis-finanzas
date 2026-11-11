import { useState } from 'react';
import { antExpenses, calendarMonth, monthComparison, type CalEvent, type CoreState, type Reminder } from '../core/finance';
import { useFP, type Category } from './fp';

declare global {
  interface Window {
    openReminderModal?: (date?: string) => void;
    editReminder?: (id: string) => void;
    deleteReminder?: (id: string) => void | Promise<void>;
    hasPlanAccess?: (plan: string) => boolean;
    renderUpgradePrompt?: (feature: string, plan: string, description: string) => string;
  }
}
type St = CoreState & { reminders?: Record<string, Reminder | null> };
const liveState = (): St => ((window.FP && window.FP.getState && window.FP.getState()) || {}) as unknown as St;
const cats = (): Category[] => ((window.FP && window.FP.getCategories && window.FP.getCategories()) || []) as Category[];
const catLabel = (id: string) => { const c = cats().find((x) => x.id === id); return c ? `${c.icon || ''} ${c.label}` : `📋 ${id}`; };
const TEXT_EMPTY = 'fp-insight-empty';

/** Comparativa del gasto del mes actual contra el anterior, por categoría. */
export function MonthComparison() {
  const s = useFP();
  const [mode, setMode] = useState<'same-period' | 'full'>('same-period');
  const c = monthComparison(liveState(), new Date(), mode);
  if (!c.hasData) return <div className={TEXT_EMPTY}>Aún no tienes datos suficientes para comparar. Registra movimientos para ver la comparativa.</div>;
  const up = c.diff > 0, tone = up ? 'var(--danger-text)' : 'var(--success-text)';
  const arrow = up ? '↑' : c.diff < 0 ? '↓' : '→';
  const maxV = Math.max(1, ...c.rows.map((r) => Math.max(r.current, r.previous)));
  return (
    <div className="fp-cmp">
      <div className="fp-seg" role="group" aria-label="Período a comparar">
        <button type="button" className={mode === 'same-period' ? 'on' : ''} aria-pressed={mode === 'same-period'} onClick={() => setMode('same-period')}>Mismo período</button>
        <button type="button" className={mode === 'full' ? 'on' : ''} aria-pressed={mode === 'full'} onClick={() => setMode('full')}>Mes completo</button>
      </div>
      <p className="fp-cmp-note">{mode === 'same-period' ? `Del 1 al ${c.throughDay} de cada mes, para comparar lo mismo con lo mismo. No incluye pagos de tarjeta.` : 'Todo el mes anterior contra lo que va de este mes. No incluye pagos de tarjeta.'}</p>
      <div className="fp-cmp-tiles">
        <div className="fp-cmp-tile"><div className="fp-cmp-label">Mes anterior</div><div className="fp-cmp-value">{s.fmt(c.previousTotal)}</div></div>
        <div className="fp-cmp-tile" style={{ borderLeftColor: tone }}>
          <div className="fp-cmp-label">Este mes</div><div className="fp-cmp-value">{s.fmt(c.currentTotal)}</div>
          {c.pct !== null && <div className="fp-cmp-delta" style={{ color: tone }}>{`${arrow} ${up ? '+' : ''}${c.pct.toFixed(0)}% vs anterior`}</div>}
        </div>
      </div>
      <p className="fp-cmp-sub">📋 Por categoría</p>
      <div className="fp-cmp-rows">
        {c.rows.map((r) => {
          const color = r.trend === 'up' ? 'var(--danger-text)' : r.trend === 'down' ? 'var(--success-text)' : 'var(--text-secondary)';
          const icon = r.trend === 'up' ? '↑' : r.trend === 'down' ? '↓' : '→';
          const label = r.previous > 0 ? `${r.diff > 0 ? '+' : ''}${r.pct.toFixed(0)}%` : r.isNew ? 'nuevo' : '—';
          return (
            <div className="fp-cmp-row" key={r.id}>
              <div className="fp-cmp-head"><span>{catLabel(r.id)}</span><span style={{ color }}>{`${icon} ${label}`}</span></div>
              <div className="fp-cmp-bars" aria-hidden="true"><i style={{ width: `${(r.previous / maxV) * 100}%` }} className="prev" /><i style={{ width: `${(r.current / maxV) * 100}%`, background: color === 'var(--text-secondary)' ? 'var(--fp-income, #2f7566)' : color }} className="now" /></div>
              <div className="fp-cmp-foot"><span>{`Antes: ${s.fmt(r.previous)}`}</span><span>{`Ahora: ${s.fmt(r.current)}`}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Gastos hormiga: gastos pequeños que se repiten y lo que suman al año. */
export function AntExpenses() {
  const s = useFP();
  if (window.hasPlanAccess && !window.hasPlanAccess('pro') && window.renderUpgradePrompt) {
    return <div dangerouslySetInnerHTML={{ __html: window.renderUpgradePrompt('Gastos hormiga', 'pro', 'Detecta patrones de gastos pequeños y frecuentes que suman al año.') }} />;
  }
  const r = antExpenses(liveState());
  if (!r.enough) return <div className={TEXT_EMPTY}>Necesitas registrar más transacciones para detectar patrones.</div>;
  if (!r.patterns.length) return <div className={TEXT_EMPTY}>✅ No detectamos patrones de gastos hormiga problemáticos.</div>;
  return (
    <div className="fp-ants">
      <div className="fp-ants-banner">🐜 <strong>Gastos pequeños frecuentes</strong> que pueden sumar mucho al año.</div>
      {r.patterns.map((a) => (
        <div className="fp-ant" key={a.key}>
          <div className="fp-ant-head"><strong>{a.key}</strong><span>{`${a.count}x registrado`}</span></div>
          <div className="fp-ant-grid">
            <div><span>Total:</span> <strong>{s.fmt(a.total)}</strong></div>
            <div><span>Promedio:</span> {s.fmt(a.avg)}</div>
            <div><span>Año:</span> <b>{s.fmt(a.projectedYear)}</b></div>
          </div>
          <div className="fp-ant-note">{`Basado en ${a.monthsSpan} mes${a.monthsSpan > 1 ? 'es' : ''} de datos reales`}</div>
        </div>
      ))}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
function EventLabel({ e }: { e: CalEvent }) { return <>{`${e.icon} ${e.label}`}</>; }

/** Calendario financiero: cortes de tarjeta y recordatorios, con navegación entre meses. */
export function FinancialCalendar() {
  useFP();
  const [offset, setOffset] = useState(0);
  const real = new Date();
  const view = new Date(real.getFullYear(), real.getMonth() + offset, 1);
  const cal = calendarMonth(liveState(), view);
  const raw = view.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const monthLabel = raw.charAt(0).toUpperCase() + raw.slice(1);          // "Noviembre de 2026" (solo la primera letra en mayúscula)
  const days = Array.from({ length: cal.daysInMonth }, (_, i) => i + 1);
  const sorted = Object.keys(cal.events).map(Number).sort((a, b) => a - b);
  const hasUser = sorted.some((d) => cal.events[d].some((e) => e.type === 'reminder'));
  const dateOf = (d: number) => `${cal.year}-${pad(cal.month + 1)}-${pad(d)}`;
  const diffDays = (d: number) => Math.round((Date.UTC(cal.year, cal.month, d) - Date.UTC(real.getFullYear(), real.getMonth(), real.getDate())) / 864e5);
  const when = (d: number) => { const n = diffDays(d); return n === 0 ? 'HOY' : n === 1 ? 'MAÑANA' : n > 0 ? `en ${n} días` : `hace ${Math.abs(n)} días`; };
  return (
    <div className="fp-cal">
      <div className="fp-cal-top">
        <div className="fp-cal-nav-wrap">
          <button type="button" className="fp-cal-nav prev" aria-label="Mes anterior" onClick={() => setOffset((o) => o - 1)}>‹</button>
          <div className="fp-cal-month" aria-live="polite">{monthLabel}</div>
          <button type="button" className="fp-cal-nav next" aria-label="Mes siguiente" onClick={() => setOffset((o) => o + 1)}>›</button>
          {offset !== 0 && <button type="button" className="fp-cal-today-btn" onClick={() => setOffset(0)}>Hoy</button>}
        </div>
        <button type="button" className="fp-cal-add" onClick={() => window.openReminderModal?.(offset === 0 ? undefined : dateOf(1))}>+ Recordatorio</button>
      </div>
      <div className="fp-cal-legend"><span>💳 Corte de tarjeta</span><span>📌 Recordatorio</span></div>
      <div className="fp-cal-grid fp-cal-wd" aria-hidden="true">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="fp-cal-grid" role="grid" aria-label={`Calendario de ${monthLabel}`}>
        {Array.from({ length: cal.startWeekday }, (_, i) => <div key={'b' + i} />)}
        {days.map((d) => {
          const evs = cal.events[d] || [], isToday = offset === 0 && d === real.getDate(), hasRem = evs.some((e) => e.type === 'reminder');
          return (
            <button type="button" key={d} role="gridcell" data-day={d} className={`fp-cal-day${isToday ? ' today' : ''}${hasRem ? ' rem' : evs.length ? ' ev' : ''}`}
              aria-label={`${d} de ${monthLabel}${evs.length ? ': ' + evs.map((e) => e.label).join(', ') : ''}. Agregar recordatorio`} onClick={() => window.openReminderModal?.(dateOf(d))}>
              <span className="fp-cal-num">{d}</span>
              {evs.slice(0, 2).map((e, i) => <span key={i} className={`fp-cal-chip${e.type === 'reminder' ? ' rem' : ''}`}><EventLabel e={e} /></span>)}
              {evs.length > 2 && <span className="fp-cal-more">{`+${evs.length - 2} más`}</span>}
              {evs.length > 0 && <span className="fp-cal-icos" aria-hidden="true">{evs.slice(0, 3).map((e, i) => <span key={i} className="fp-cal-ico">{e.icon}</span>)}{evs.length > 3 && <span className="fp-cal-ico-more">{`+${evs.length - 3}`}</span>}</span>}
            </button>
          );
        })}
      </div>
      <div className="fp-cal-events">
        <p className="fp-cmp-sub">📋 Eventos importantes del mes</p>
        {sorted.flatMap((d) => cal.events[d].map((e, i) => (
          <div className={`fp-cal-ev${e.type === 'reminder' ? ' rem' : ''}`} key={`${d}-${i}`}>
            <div className="fp-cal-ev-main">
              <div className="fp-cal-ev-title"><EventLabel e={e} /></div>
              {e.amount && e.amount > 0 ? <div className="fp-cal-ev-amt">{`$${e.amount.toLocaleString('es-CO')}`}</div> : null}
              <div className="fp-cal-ev-when">{`Día ${d} · `}{diffDays(d) === 0 ? <strong className="fp-cal-today">HOY</strong> : when(d)}</div>
            </div>
            {e.type === 'reminder' && e.reminderId && (
              <div className="fp-cal-ev-actions">
                <button type="button" aria-label={`Editar ${e.label}`} className="edit" onClick={() => window.editReminder?.(e.reminderId!)}>✏️</button>
                <button type="button" aria-label={`Eliminar ${e.label}`} className="del" onClick={() => window.deleteReminder?.(e.reminderId!)}>🗑️</button>
              </div>
            )}
          </div>
        )))}
        {!hasUser && <div className="fp-cal-hint">💡 Toca cualquier día del calendario para agregar un recordatorio</div>}
      </div>
    </div>
  );
}
