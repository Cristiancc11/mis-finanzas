import { useEffect, useState } from 'react';
import { pct, type Snapshot } from './fp';

const R = 80;
const C = 2 * Math.PI * R;
const GAP = 3;

interface Item { name: string; icon: string; value: number; color: string }

function buildItems(snap: Snapshot): Item[] {
  const sorted = [...snap.pockets].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, p) => s + p.amount, 0);
  const items: Item[] = top.map((p, i) => ({ name: p.name, icon: p.icon || '', value: p.amount, color: `var(--fp-${(i % 8) + 1})` }));
  if (rest > 0) items.push({ name: 'Otros', icon: '', value: rest, color: 'var(--text-tertiary)' });
  return items;
}

/** Dónde está tu dinero: dona con total al centro y detalle por bolsillo. */
export function PocketsDonut({ snap }: { snap: Snapshot }) {
  const items = buildItems(snap);
  const total = items.reduce((s, i) => s + i.value, 0);
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(id); }, []);

  let offset = 0;
  const focus = active !== null ? items[active] : null;

  return (
    <section className="raised-card fp-card" aria-labelledby="fp-donut-title">
      <header className="fp-card-head">
        <h3 id="fp-donut-title" className="card-title">Dónde está tu dinero</h3>
        <span className="fp-sub">{items.length} {items.length === 1 ? 'bolsillo' : 'bolsillos'}</span>
      </header>
      {total <= 0 ? (
        <p className="fp-empty">Aún no tienes ahorros registrados. Crea tus bolsillos en la pestaña Bolsillos.</p>
      ) : (
        <div className="fp-donut-wrap">
          <div className="fp-donut-box">
          <svg viewBox="0 0 200 200" className="fp-donut" role="img" aria-label={`Ahorros totales ${snap.fmt(total)} repartidos en ${items.length} bolsillos`}>
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--bg-secondary)" strokeWidth="26" />
            <g transform="rotate(-90 100 100)">
              {items.map((it, i) => {
                const len = Math.max(0, (it.value / total) * C - (items.length > 1 ? GAP : 0));
                const el = (
                  <circle
                    key={it.name + i}
                    cx="100" cy="100" r={R} fill="none" stroke={it.color} strokeWidth={active === i ? 30 : 26}
                    strokeDasharray={`${ready ? len : 0} ${C}`} strokeDashoffset={-offset}
                    opacity={active === null || active === i ? 1 : 0.35}
                    className="fp-seg" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                  />
                );
                offset += (it.value / total) * C;
                return el;
              })}
            </g>
            <text x="100" y="92" textAnchor="middle" className="fp-donut-label">{focus ? focus.name : 'Total ahorrado'}</text>
            <text x="100" y="114" textAnchor="middle" className="fp-donut-value">{snap.fmt(focus ? focus.value : total)}</text>
            <text x="100" y="132" textAnchor="middle" className="fp-donut-pct">{focus ? pct(focus.value, total).toFixed(1).replace('.', ',') + ' %' : ''}</text>
          </svg>
          </div>
          <ul className="fp-legend">
            {items.map((it, i) => (
              <li key={it.name + i} className={active === i ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                <span className="fp-dot" style={{ background: it.color }} aria-hidden="true" />
                <span className="fp-legend-name">{it.icon} {it.name}</span>
                <span className="fp-legend-val">{snap.fmt(it.value)}</span>
                <span className="fp-legend-pct">{pct(it.value, total).toFixed(0)} % del total</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
