import { monthName, pct, type Snapshot } from './fp';

/** Gasto del mes por categoría frente a su presupuesto. */
export function CategoryBars({ snap }: { snap: Snapshot }) {
  const rows = snap.categories.slice(0, 8);
  const maxSpent = Math.max(...rows.map((r) => r.spent), 1);
  const totalSpent = snap.categories.reduce((s, r) => s + r.spent, 0);

  return (
    <section className="raised-card fp-card" aria-labelledby="fp-cat-title">
      <header className="fp-card-head">
        <h3 id="fp-cat-title" className="card-title">En qué se va tu plata</h3>
        <span className="fp-sub">{monthName(snap.month)}{totalSpent > 0 ? ` · ${snap.fmt(totalSpent)}` : ''}</span>
      </header>
      {rows.length === 0 ? (
        <p className="fp-empty">Aún no registras gastos este mes.</p>
      ) : (
        <ul className="fp-cats">
          {rows.map((r) => {
            const used = r.budget > 0 ? pct(r.spent, r.budget) : null;
            const tone = used === null ? 'neutral' : used > 100 ? 'over' : used >= 85 ? 'warn' : 'ok';
            const width = used === null ? pct(r.spent, maxSpent) : Math.min(100, used);
            return (
              <li key={r.id} className="fp-cat">
                <div className="fp-cat-top">
                  <span className="fp-cat-name">{r.icon} {r.label}</span>
                  <span className="fp-cat-amount">
                    <strong>{snap.fmt(r.spent)}</strong>
                    {r.budget > 0 && <span className="fp-cat-of"> de {snap.fmt(r.budget)}</span>}
                  </span>
                </div>
                <div className="fp-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={`${r.label}: ${used === null ? 'sin presupuesto' : Math.round(used) + ' % del presupuesto'}`}>
                  <div className={`fp-fill fp-${tone}`} style={{ width: `${width}%` }} />
                </div>
                {used !== null && used > 100 && <span className="fp-cat-flag">Te pasaste por {snap.fmt(r.spent - r.budget)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
