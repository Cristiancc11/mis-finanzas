import { useEffect, useRef, useState } from 'react';
import { countActiveFilters, emptyFilters, filterStats, pageNumbers, paginate, selectTransactions, type CoreState, type TxFilters, type TxLike } from '../core/finance';
import { defaultFmt, type Category } from './fp';

interface Inst { current: number; total: number; hasInterest?: boolean; originalTotal?: number; interestRate?: number }
interface TxFull {
  id: number | string; date: string; desc?: string; amount: number | string; category: string; paymentMethod?: string;
  cardId?: number | string | null; pocketId?: number | string | null; cashback?: number; isLent?: boolean; isShared?: boolean;
  totalAmount?: number; totalPeople?: number; myAmount?: number; installment?: Inst; payCardId?: unknown;
}
interface Debt { id: number | string; name: string; lastDigits?: string; lastFour?: string }
interface PocketX { id: number | string; name: string; icon?: string }
type Method = { icon: string; label: string };

declare global {
  interface Window {
    txFilters?: TxFilters;
    txCurrentPage?: number;
    openEditTxModal?: (month: string, id: number | string) => void;
    removeTransaction?: (month: string, id: number | string) => void;
    openAddExpenseModal?: () => void;
  }
}

const PAYMENT_OPTIONS: [string, string][] = [['', 'Todos'], ['tarjeta', 'Tarjeta'], ['debito', 'Débito'], ['pse', 'PSE'], ['llave', 'Llave / Bre-B'], ['efectivo', 'Efectivo']];
const METHOD_CHIP: Record<string, string> = { tarjeta: 'Tarjeta', debito: 'Débito', pse: 'PSE', llave: 'Llave/Bre-B', efectivo: 'Efectivo' };

function readCtx() {
  const fp = window.FP || {};
  const state = ((fp.getState && fp.getState()) || {}) as unknown as CoreState & { debts?: Debt[]; pockets?: PocketX[] };
  const month = (fp.getMonth && fp.getMonth()) || new Date().toISOString().slice(0, 7);
  const filters: TxFilters = { ...emptyFilters(), ...(window.txFilters || {}) };
  const selected = selectTransactions(state, month, filters) as unknown as TxFull[];
  const pg = paginate(selected, typeof window.txCurrentPage === 'number' ? window.txCurrentPage : 1);
  const isCard = fp.isCardPayment || ((t: { category?: string; payCardId?: unknown }) => t.category === 'pago_tarjeta' || !!t.payCardId);
  return {
    month, filters, selected, pg, state,
    monthCount: ((state.transactions || {})[month] || []).length,
    debts: (state.debts || []) as Debt[], pockets: (state.pockets || []) as PocketX[],
    cats: ((fp.getCategories && fp.getCategories()) || []) as Category[],
    methods: ((fp.getPaymentMethods && fp.getPaymentMethods()) || {}) as Record<string, Method>,
    monthLabel: fp.getMonthLabel ? fp.getMonthLabel(month) : month,
    fmt: fp.fmt || defaultFmt, isCard: isCard as (t: unknown) => boolean,
  };
}
type Ctx = ReturnType<typeof readCtx>;

function useCtx(): Ctx {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => bump((v) => v + 1);
    window.addEventListener('fp:change', h);
    return () => window.removeEventListener('fp:change', h);
  }, []);
  return readCtx();
}

/** Cambia filtros (y vuelve a la primera página). Es el mismo estado global que usa el código anterior. */
function setFilters(patch: Partial<TxFilters>) {
  window.txFilters = { ...emptyFilters(), ...(window.txFilters || {}), ...patch };
  window.txCurrentPage = 1;
  window.dispatchEvent(new CustomEvent('fp:change'));
}
const monthOf = (t: TxFull) => String(t.date || '').slice(0, 7);

function Badge({ kind, children }: { kind: 'lent' | 'shared' | 'inst' | 'transfer'; children: string }) {
  return <span className={`fp-tb fp-tb-${kind}`}>{children}</span>;
}

function TxRow({ t, c }: { t: TxFull; c: Ctx }) {
  const cat = c.cats.find((x) => x.id === t.category) || { icon: '📋', label: 'Otros' };
  const ds = new Date(t.date + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const method = c.methods[t.paymentMethod || ''] || { icon: '💵', label: 'Efectivo' };
  const card = t.cardId ? c.debts.find((x) => x.id === t.cardId) : undefined;
  const pocket = t.pocketId ? c.pockets.find((x) => x.id === t.pocketId) : undefined;
  const methodStr = card ? `${method.icon} ${card.name}` : pocket ? `${method.icon} ${method.label} desde ${pocket.icon} ${pocket.name}` : `${method.icon} ${method.label}`;
  const cb = Number(t.cashback) || 0;
  const lent = !!(t.isLent && t.totalAmount);
  const shared = !lent && !!(t.isShared && t.totalAmount && t.totalPeople);
  const inst = t.installment;
  const isCardPay = c.isCard(t);
  const payCardName = isCardPay && t.payCardId ? (c.debts.find((d) => d.id === t.payCardId) || { name: '' }).name : '';
  const total = Number(t.totalAmount) || 0;
  const month = monthOf(t);
  return (
    <div className="tx-row" data-tx-id={t.id}>
      <div className="tx-date">{ds}</div>
      <div>
        {t.desc}
        {lent && <Badge kind="lent">🤝 Presté tarjeta</Badge>}
        {shared && <Badge kind="shared">👥 Compartido</Badge>}
        {inst && <Badge kind="inst">{`💳 Cuota ${inst.current}/${inst.total}${inst.hasInterest ? ' c/int' : ' s/int'}`}</Badge>}
        {isCardPay && <Badge kind="transfer">🔄 Transferencia</Badge>}
        <br />
        <span className="fp-tx-sub">{`${cat.icon} ${cat.label} · ${methodStr}`}{cb > 0 && <span className="fp-tx-cb">{` · +${c.fmt(cb)} cashback`}</span>}</span>
        {lent && <><br /><span className="fp-tx-detail fp-tx-detail-lent">{`Total: ${c.fmt(total)} · Te deben ${c.fmt(total)}${cb > 0 ? ` · Cashback tuyo: +${c.fmt(cb)}` : ''}`}</span></>}
        {shared && <><br /><span className="fp-tx-detail fp-tx-detail-shared">{`Total: ${c.fmt(total)} · Dividido entre ${t.totalPeople} · Te deben ${c.fmt(total - (Number(t.myAmount) || 0))}`}</span></>}
        {inst && <><br /><span className="fp-tx-detail fp-tx-detail-shared">{`Compra total: ${c.fmt(Number(inst.originalTotal) || 0)}${inst.hasInterest ? ` · Tasa: ${inst.interestRate}% mensual` : ' · Sin intereses'}`}</span></>}
        {isCardPay && <><br /><span className="fp-tx-detail fp-tx-detail-transfer">{`No es gasto real · pago${payCardName ? ` a ${payCardName}` : ''} (no afecta margen)`}</span></>}
      </div>
      <div style={{ color: isCardPay ? 'var(--info-text)' : 'var(--danger-text)', fontWeight: 500 }}>{c.fmt(Number(t.amount) || 0)}</div>
      <button className="edit-tx-btn" title="Editar" aria-label="Editar movimiento" onClick={() => window.openEditTxModal?.(month, t.id)}>✏️</button>
      <button className="delete-btn" aria-label="Eliminar movimiento" onClick={() => window.removeTransaction?.(month, t.id)}>×</button>
    </div>
  );
}

function FiltersPanel({ c, onClose }: { c: Ctx; onClose: () => void }) {
  const f = c.filters;
  const [d, setD] = useState({
    dateFrom: f.dateFrom || '', dateTo: f.dateTo || '', categories: [...f.categories], cardId: String(f.cardId ?? ''), pocketId: String(f.pocketId ?? ''),
    amountMin: f.amountMin == null ? '' : String(f.amountMin), amountMax: f.amountMax == null ? '' : String(f.amountMax), paymentMethod: f.paymentMethod || '', cashbackOnly: !!f.cashbackOnly,
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleCat = (id: string) => set('categories', d.categories.includes(id) ? d.categories.filter((x) => x !== id) : [...d.categories, id]);
  const apply = () => {
    setFilters({ dateFrom: d.dateFrom, dateTo: d.dateTo, categories: d.categories, cardId: d.cardId, pocketId: d.pocketId, amountMin: d.amountMin === '' ? null : Number(d.amountMin), amountMax: d.amountMax === '' ? null : Number(d.amountMax), paymentMethod: d.paymentMethod, cashbackOnly: d.cashbackOnly });
    onClose();
  };
  const clear = () => { setFilters(emptyFilters()); onClose(); };
  return (
    <div className="fp-tx-panel" role="dialog" aria-label="Filtros avanzados">
      <div className="fp-tx-panel-head"><h3>Filtros avanzados</h3><button type="button" className="fp-tx-x" aria-label="Cerrar" onClick={onClose}>✕</button></div>
      <div className="fp-tx-panel-body">
        <div className="field-group"><label className="field-label" htmlFor="fp-f-from">Rango de fechas <small>(busca en todo el histórico)</small></label>
          <div className="fp-tx-range"><input id="fp-f-from" type="date" value={d.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} /><span>→</span><input aria-label="Fecha hasta" type="date" value={d.dateTo} onChange={(e) => set('dateTo', e.target.value)} /></div></div>
        <div className="field-group"><span className="field-label">Categorías <small>(selecciona varias)</small></span>
          <div className="fp-tx-cats">{c.cats.map((x) => <label key={x.id} className={`fp-tx-cat${d.categories.includes(x.id) ? ' on' : ''}`}><input type="checkbox" checked={d.categories.includes(x.id)} onChange={() => toggleCat(x.id)} /><span>{`${x.icon || ''} ${x.label}`}</span></label>)}</div></div>
        <div className="form-grid-2">
          <div className="field-group"><label className="field-label" htmlFor="fp-f-card">Tarjeta</label>
            <select id="fp-f-card" value={d.cardId} onChange={(e) => set('cardId', e.target.value)}><option value="">Todas</option>{c.debts.map((x) => <option key={String(x.id)} value={String(x.id)}>{x.name + ((x.lastDigits || x.lastFour) ? ` (••${x.lastDigits || x.lastFour})` : '')}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="fp-f-pocket">Bolsillo</label>
            <select id="fp-f-pocket" value={d.pocketId} onChange={(e) => set('pocketId', e.target.value)}><option value="">Todos</option>{c.pockets.map((x) => <option key={String(x.id)} value={String(x.id)}>{x.name}</option>)}</select></div>
        </div>
        <div className="field-group"><label className="field-label" htmlFor="fp-f-min">Rango de monto (COP)</label>
          <div className="fp-tx-range"><input id="fp-f-min" type="number" inputMode="decimal" min={0} step={1000} placeholder="Mínimo" value={d.amountMin} onChange={(e) => set('amountMin', e.target.value)} /><span>→</span><input aria-label="Monto máximo" type="number" inputMode="decimal" min={0} step={1000} placeholder="Máximo" value={d.amountMax} onChange={(e) => set('amountMax', e.target.value)} /></div></div>
        <div className="field-group"><label className="field-label" htmlFor="fp-f-pay">Método de pago</label>
          <select id="fp-f-pay" value={d.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>{PAYMENT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <label className="fp-tx-switch"><input type="checkbox" checked={d.cashbackOnly} onChange={(e) => set('cashbackOnly', e.target.checked)} /><span>Solo movimientos con cashback</span></label>
      </div>
      <div className="fp-tx-panel-foot"><button type="button" className="fp-tx-btn-ghost" onClick={clear}>Limpiar todo</button><button type="button" className="fp-tx-btn-primary" onClick={apply}>Aplicar filtros</button></div>
    </div>
  );
}

function Chips({ c }: { c: Ctx }) {
  const f = c.filters;
  const chips: { key: string; cls: string; text: string; remove: () => void }[] = [];
  if (f.search && f.search.trim()) chips.push({ key: 'search', cls: '', text: `🔍 "${f.search.trim()}" `, remove: () => setFilters({ search: '' }) });
  for (const id of f.categories) { const cat = c.cats.find((x) => x.id === id) || { icon: '📋', label: id }; chips.push({ key: 'cat-' + id, cls: 'teal', text: `${cat.icon} ${cat.label} `, remove: () => setFilters({ categories: f.categories.filter((x) => x !== id) }) }); }
  if (f.cardId !== '' && f.cardId != null) { const d = c.debts.find((x) => String(x.id) === String(f.cardId)); chips.push({ key: 'card', cls: 'pink', text: `💳 ${d ? d.name : 'Tarjeta'} `, remove: () => setFilters({ cardId: '' }) }); }
  if (f.pocketId !== '' && f.pocketId != null) { const p = c.pockets.find((x) => String(x.id) === String(f.pocketId)); chips.push({ key: 'pocket', cls: 'amber', text: `👛 ${p ? p.name : 'Bolsillo'} `, remove: () => setFilters({ pocketId: '' }) }); }
  if (f.dateFrom || f.dateTo) chips.push({ key: 'dates', cls: 'coral', text: `📅 ${f.dateFrom ? f.dateFrom.substring(5) : '...'} → ${f.dateTo ? f.dateTo.substring(5) : '...'} `, remove: () => setFilters({ dateFrom: '', dateTo: '' }) });
  if ((f.amountMin != null && f.amountMin !== '') || (f.amountMax != null && f.amountMax !== '')) chips.push({ key: 'amount', cls: '', text: `💵 ${f.amountMin ? c.fmt(Number(f.amountMin)) : '0'} → ${f.amountMax ? c.fmt(Number(f.amountMax)) : '∞'} `, remove: () => setFilters({ amountMin: null, amountMax: null }) });
  if (f.cashbackOnly) chips.push({ key: 'cb', cls: 'teal', text: '🎁 Con cashback ', remove: () => setFilters({ cashbackOnly: false }) });
  if (f.paymentMethod) chips.push({ key: 'pay', cls: '', text: `💳 ${METHOD_CHIP[f.paymentMethod] || f.paymentMethod} `, remove: () => setFilters({ paymentMethod: '' }) });
  if (!chips.length) return null;
  return (
    <div className="fp-tx-chips">
      {chips.map((x) => <button type="button" key={x.key} className={`fp-chip-f ${x.cls}`} onClick={x.remove} aria-label={`Quitar filtro ${x.text.trim()}`}>{x.text}<span className="tx-chip-x">✕</span></button>)}
      <button type="button" className="fp-tx-clear" onClick={() => setFilters(emptyFilters())}>Limpiar</button>
    </div>
  );
}

export function Transactions() {
  const c = useCtx();
  const root = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState(false);
  const [text, setText] = useState(c.filters.search || '');
  useEffect(() => { if ((c.filters.search || '') !== text) setText(c.filters.search || ''); }, [c.filters.search]);   // eslint-disable-line react-hooks/exhaustive-deps
  const active = countActiveFilters(c.filters);
  const stats = filterStats(c.selected as unknown as TxLike[]);
  const goto = (n: number) => { window.txCurrentPage = n; window.dispatchEvent(new CustomEvent('fp:change')); root.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };
  const { pg } = c;
  return (
    <div className="fp-tx" ref={root}>
      <div className="tx-header"><p className="card-title">Movimientos del mes</p><span className="tx-count-badge">{c.monthCount}</span></div>
      <div className="fp-tx-bar">
        <div className="fp-tx-search">
          <span aria-hidden="true">🔍</span>
          <input type="text" value={text} placeholder="Buscar por descripción..." aria-label="Buscar por descripción" autoComplete="off" enterKeyHint="search"
            onChange={(e) => { setText(e.target.value); setFilters({ search: e.target.value }); }} />
          {text && <button type="button" className="fp-tx-x" aria-label="Limpiar búsqueda" onClick={() => { setText(''); setFilters({ search: '' }); }}>✕</button>}
        </div>
        <button type="button" className={`fp-tx-filter-btn${active > 0 ? ' active' : ''}`} aria-expanded={panel} onClick={() => setPanel((v) => !v)}>
          <span aria-hidden="true">⚙</span><span>Filtros</span>{active > 0 && <span className="fp-tx-count">{active}</span>}
        </button>
      </div>
      <Chips c={c} />
      {active > 0 && (
        <div className="fp-tx-stats">
          <span className="tx-filter-stats-count">{`${stats.count} ${stats.count === 1 ? 'resultado' : 'resultados'}`}</span>
          <span className="tx-filter-stats-amount">{`· Total: ${c.fmt(stats.sum)}`}</span>
          {stats.cashback > 0 && <><span className="tx-filter-stats-amount">·</span><span className="tx-filter-stats-cashback">{`+${c.fmt(stats.cashback)} cashback`}</span></>}
        </div>
      )}
      {panel && <FiltersPanel c={c} onClose={() => setPanel(false)} />}
      <div id="react-tx-list">
        {c.selected.length === 0 ? (
          active > 0 ? (
            <div className="fp-tx-empty"><div className="fp-tx-empty-icon">🔍</div><div className="fp-tx-empty-title">Sin resultados</div>
              <div className="fp-tx-empty-msg">No se encontraron movimientos con esos filtros. Prueba quitar algún filtro o cambiar la búsqueda.</div>
              <button type="button" className="fp-tx-btn-primary" onClick={() => setFilters(emptyFilters())}>Limpiar filtros</button></div>
          ) : (
            <div className="fp-tx-empty"><div className="fp-tx-empty-icon">📝</div><div className="fp-tx-empty-title">{`Sin movimientos en ${c.monthLabel}`}</div>
              <div className="fp-tx-empty-msg">Registra tus gastos para hacer seguimiento del presupuesto y descubrir patrones de consumo.</div>
              <button type="button" className="fp-tx-btn-primary" onClick={() => window.openAddExpenseModal?.()}>💸 Registrar primer gasto</button></div>
          )
        ) : pg.items.map((t) => <TxRow key={`${monthOf(t as unknown as TxFull)}-${(t as unknown as TxFull).id}`} t={t as unknown as TxFull} c={c} />)}
      </div>
      {pg.totalPages > 1 && (
        <div className="tx-pagination fp-tx-pages">
          <div className="tx-pagination-info">{'Mostrando '}<strong>{`${pg.start}–${pg.end}`}</strong>{' de '}<strong>{pg.total}</strong>{' movimientos'}</div>
          <div className="tx-pagination-controls">
            <button type="button" className="tx-page-btn" disabled={pg.page === 1} onClick={() => goto(pg.page - 1)} aria-label="Página anterior">‹ Anterior</button>
            {pageNumbers(pg.page, pg.totalPages).map((n, i) => n === '…' ? <span key={'e' + i} className="tx-page-ellipsis">…</span> : <button type="button" key={n} className={`tx-page-num${n === pg.page ? ' active' : ''}`} onClick={() => goto(n)} aria-label={`Página ${n}`} aria-current={n === pg.page ? 'page' : undefined}>{n}</button>)}
            <button type="button" className="tx-page-btn" disabled={pg.page === pg.totalPages} onClick={() => goto(pg.page + 1)} aria-label="Página siguiente">Siguiente ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
