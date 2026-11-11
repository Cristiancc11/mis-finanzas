import { useState } from 'react';
import { cardInsightKind, cardsOverview, urgencyTone, type CoreState } from '../core/finance';
import { defaultFmt, useFP } from './fp';

interface Debt { id: number | string; name: string; balance?: number; payment?: number; cutoffDay?: number }
interface Cutoff { daysLeft: number; dateStr: string; needsPayment: boolean; recommendedPayment: number; canReachTarget: boolean; recommendedUtilization: number }
type St = CoreState & { debts?: Debt[]; targetUtilization?: number };
declare global { interface Window { setTargetUtilization?: (value: string | number) => void } }

const live = (): St => ((window.FP && window.FP.getState && window.FP.getState()) || {}) as unknown as St;
const fmtF = () => (window.FP && window.FP.fmt) || defaultFmt;
const debtsOf = (s: St) => (s.debts || []) as unknown as Debt[];
const cutoffOf = (d: Debt): Cutoff | null => { try { return ((window.FP?.getCutoffStatus?.(d)) as Cutoff) || null; } catch { return null; } };
const month = () => (window.FP && window.FP.getMonth && window.FP.getMonth()) || new Date().toISOString().slice(0, 7);

/** Cupo total, saldo, utilización general y cashback del mes. */
export function CardsOverview() {
  useFP();
  const fmt = fmtF(), s = live();
  if (!debtsOf(s).length) return null;
  const o = cardsOverview(s, month());
  const good = o.util <= 30;
  return (
    <div className="hero-metrics">
      <div className="metric-hero"><div className="metric-hero-icon blue">💳</div><div className="metric-hero-label">Cupo total</div><p className="metric-hero-value">{fmt(o.limit)}</p><div className="metric-hero-sub">{`${o.count} ${o.count === 1 ? 'tarjeta' : 'tarjetas'}`}</div></div>
      <div className="metric-hero"><div className="metric-hero-icon red">💰</div><div className="metric-hero-label">Saldo total</div><p className="metric-hero-value" style={{ color: 'var(--danger-text)' }}>{fmt(o.debt)}</p><div className="metric-hero-sub">{`Disponible: ${fmt(o.available)}`}</div></div>
      <div className="metric-hero"><div className={`metric-hero-icon ${good ? 'green' : 'amber'}`}>📊</div><div className="metric-hero-label">Utilización general</div><p className="metric-hero-value" style={{ color: good ? 'var(--success-text)' : 'var(--warning-text)' }}>{`${o.util.toFixed(1)}%`}</p><div className="metric-hero-sub">{good ? 'Saludable' : 'Recomendado: ≤30%'}</div></div>
      <div className="metric-hero"><div className="metric-hero-icon green">🎁</div><div className="metric-hero-label">Cashback este mes</div><p className="metric-hero-value" style={{ color: 'var(--success-text)' }}>{fmt(o.cashbackMonth)}</p><div className="metric-hero-sub">De todas tus tarjetas</div></div>
    </div>
  );
}

/** Consejo dinámico: lo más urgente primero y, si no hay nada urgente, según la utilización general. */
export function CardInsight() {
  useFP();
  const fmt = fmtF(), s = live(), debts = debtsOf(s);
  if (!debts.length) return null;
  const o = cardsOverview(s, month());
  let urgent: { d: Debt; info: Cutoff } | null = null;
  for (const d of debts) {
    if (!d.cutoffDay) continue;
    const info = cutoffOf(d);
    if (info && info.daysLeft <= 1 && info.needsPayment && !urgent) urgent = { d, info };
  }
  const kind = cardInsightKind(o.util, o.debt, o.limit, !!urgent);
  const u = o.util.toFixed(1);
  if (kind === 'urgent' && urgent) {
    const { d, info } = urgent;
    const reach = info.canReachTarget ? 'para mantener tu utilización óptima' : `para bajar al mínimo posible este ciclo (${info.recommendedUtilization.toFixed(1)}%)`;
    return <div className="alert alert-danger"><strong>⚠️ Acción requerida:</strong>{` "${d.name}" corta ${info.daysLeft <= 0 ? 'HOY' : 'mañana'} y todavía necesitas pagar `}<strong>{fmt(info.recommendedPayment)}</strong>{` ${reach}.`}</div>;
  }
  if (kind === 'no-limit') return <div className="alert alert-warning"><strong>ℹ️ Falta el cupo:</strong> Tienes saldo en tus tarjetas pero ninguna tiene cupo registrado. Edita tus tarjetas y agrega el cupo para calcular tu utilización.</div>;
  if (kind === 'clean') return <div className="alert alert-success"><strong>✅ Excelente:</strong> No tienes saldo pendiente en ninguna tarjeta.</div>;
  if (kind === 'ok') return <div className="alert alert-success"><strong>✅ Buen manejo:</strong>{` Tu utilización general es ${u}%, dentro del rango saludable (≤30%) para tu score crediticio.`}</div>;
  if (kind === 'warn') return <div className="alert alert-warning"><strong>🟡 Atención:</strong>{` Tu utilización general es ${u}%. Los expertos recomiendan mantenerla bajo 30% para un score óptimo.`}</div>;
  return <div className="alert alert-danger"><strong>⚠️ Utilización alta:</strong>{` Tu utilización general es ${u}%. Esto puede estar afectando tu score crediticio negativamente. Considera hacer un pago pronto.`}</div>;
}

/** Qué porcentaje del cupo quieres tener usado en cada corte (por defecto 3 %). */
export function TargetUtilization() {
  useFP();
  const fmt = fmtF(), s = live();
  const target = s.targetUtilization !== undefined && s.targetUtilization !== null ? s.targetUtilization : 3;
  const [draft, setDraft] = useState<string | null>(null);
  const limit = cardsOverview(s, month()).limit;
  const commit = () => { if (draft !== null && draft !== String(target)) window.setTargetUtilization?.(draft); setDraft(null); };
  const n = parseFloat(draft ?? String(target));
  return (
    <div className="raised-card fp-target">
      <div className="fp-target-row">
        <div className="fp-target-text">
          <p className="card-title">Tu objetivo de utilización</p>
          <p className="fp-target-desc">Qué porcentaje de tu cupo quieres tener usado en cada corte. 3% es lo ideal para el score, pero no todos pueden lograrlo — ajústalo a lo que te funcione a ti.</p>
        </div>
        <div className="fp-target-input">
          <input type="number" min={1} max={100} step={1} inputMode="decimal" aria-label="Objetivo de utilización en porcentaje" value={draft ?? String(target)}
            onChange={(e) => setDraft(e.target.value)} onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.select(), 0); }} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <span>%</span>
        </div>
      </div>
      {limit > 0 && n >= 1 && n <= 100 && <p className="fp-target-hint">{`Con tu cupo total de ${fmt(limit)}, esto es llegar a cada corte con un saldo de máximo ${fmt((limit * n) / 100)}.`}</p>}
    </div>
  );
}

/** Próximos cortes de todas tus tarjetas, del más urgente al más lejano, con el pago recomendado. */
export function UpcomingPayments() {
  useFP();
  const fmt = fmtF(), s = live();
  const items = debtsOf(s).filter((d) => d.cutoffDay).map((d) => ({ d, info: cutoffOf(d) })).filter((x): x is { d: Debt; info: Cutoff } => !!x.info).sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  if (!items.length) return null;
  return (
    <div className="raised-card" id="react-upcoming-card">
      <p className="card-title">Próximos pagos</p>
      <div className="fp-up-list">
        {items.map(({ d, info }) => (
          <div className={`fp-up fp-up-${urgencyTone(info.daysLeft)}`} key={String(d.id)}>
            <div className="fp-up-main">
              <div className="fp-up-name">{d.name}</div>
              <div className="fp-up-note">
                {info.needsPayment ? <>{'Paga '}<strong className="fp-up-pay">{fmt(info.recommendedPayment)}</strong>{info.canReachTarget ? ' para utilización óptima' : ` para bajar al mínimo posible (${info.recommendedUtilization.toFixed(1)}%)`}</> : '✅ Utilización óptima, sin pago anticipado necesario'}
              </div>
            </div>
            <div className="fp-up-when"><div className="fp-up-days">{info.daysLeft <= 0 ? 'HOY' : `${info.daysLeft}d`}</div><div className="fp-up-date">{info.dateStr}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
