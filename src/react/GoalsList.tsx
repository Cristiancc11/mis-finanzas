import { pct, type Snapshot } from './fp';

declare global { interface Window { navigateTab?: (tab: string) => void } }

/** Avance de tus metas de ahorro. */
export function GoalsList({ snap }: { snap: Snapshot }) {
  const goals = snap.goals.filter((g) => g.target > 0);
  return (
    <section className="raised-card fp-card" aria-labelledby="fp-goals-title">
      <header className="fp-card-head">
        <h3 id="fp-goals-title" className="card-title">Tus metas</h3>
        <button type="button" className="fp-link" onClick={() => window.navigateTab?.('metas')}>Ver todas</button>
      </header>
      {goals.length === 0 ? (
        <p className="fp-empty">Aún no tienes metas. Crea una en la pestaña Metas para ver tu avance aquí.</p>
      ) : (
        <ul className="fp-goals">
          {goals.slice(0, 5).map((g) => {
            const p = Math.min(100, pct(g.current, g.target));
            return (
              <li key={g.id}>
                <div className="fp-cat-top">
                  <span className="fp-cat-name">{g.name}</span>
                  <strong>{p.toFixed(0)} %</strong>
                </div>
                <div className="fp-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={`Meta ${g.name}`}>
                  <div className="fp-fill fp-ok" style={{ width: `${p}%` }} />
                </div>
                <span className="fp-cat-of">{snap.fmt(g.current)} de {snap.fmt(g.target)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
