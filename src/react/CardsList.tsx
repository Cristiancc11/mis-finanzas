import { useState, type ReactNode } from 'react';
import { cardMonthStats, cupoBreakdown, prepaidCapital, utilBarTone, type CoreState, type TxLike } from '../core/finance';
import { defaultFmt, useFP, type Category } from './fp';

interface DebtX { id: number | string; name?: string; balance?: number; payment?: number; cutoffDay?: number | string; bank?: string; brand?: string; lastDigits?: string; canPrepayInstallments?: boolean }
interface InstGroup { desc: string; currentIndex: number; totalCuotas: number; pendingAmount: number; hasInterest?: boolean; outstandingNow?: number }
interface InstInfo { hasInstallments: boolean; groups?: InstGroup[]; finished?: { desc: string }[]; outstandingNowTotal: number }
interface Cutoff {
  icon?: string; text?: string; daysLeft: number; dateStr: string; needsPayment: boolean; paymentNeeded: number; targetMaxBalance: number; targetUtilization: number;
  canReachTarget: boolean; minPossibleUtilization: number; futureInstallments: number; futureInstallmentsRaw: number; optimizableBalance: number; currentMonthInstallmentSum: number; installmentInfo?: InstInfo;
}
type St = CoreState & { debts?: DebtX[] };
declare global {
  interface Window {
    updateDebt?: (id: number | string, field: string, value: string) => void;
    editCard?: (id: number | string) => void;
    removeDebt?: (id: number | string) => void;
    setCanPrepayInstallments?: (id: number | string, value: boolean) => void;
  }
}
const live = (): St => ((window.FP && window.FP.getState && window.FP.getState()) || {}) as unknown as St;
const fmtF = () => (window.FP && window.FP.fmt) || defaultFmt;
const month = () => (window.FP && window.FP.getMonth && window.FP.getMonth()) || new Date().toISOString().slice(0, 7);
const cutoffOf = (d: DebtX): Cutoff | null => { try { return ((window.FP?.getCutoffStatus?.(d as never)) as Cutoff) || null; } catch { return null; } };
const digits = (d: DebtX) => d.lastDigits || (d.id ? String(d.id).slice(-4) : '0000');
const num = (v: unknown) => Number(v) || 0;
const KEY = 'fp_card_sel';
const Html = ({ html, className }: { html?: string; className?: string }) => <div className={className} dangerouslySetInnerHTML={{ __html: html || '' }} />;   // solo para los logos de banco y franquicia, que son constantes de la app

function WalletCard({ d, selected, onSelect, dim }: { d: DebtX; selected: boolean; onSelect: () => void; dim: boolean }) {
  const fmt = fmtF();
  const bank = (window.FP?.getBankInfo?.() || {})[d.bank || ''] || { name: '', logo: '', cardClass: '' };
  const brand = (window.FP?.getBrandInfo?.() || {})[d.brand || ''] || { name: '', logo: '' };
  return (
    <div role="option" aria-selected={selected} tabIndex={0} className={`credit-card ${bank.cardClass || ''} fp-wc${selected ? ' is-selected' : dim ? ' is-dim' : ''}`}
      onClick={onSelect} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }} aria-label={`${d.name || 'Tarjeta'}, termina en ${digits(d)}`}>
      <div className="credit-card-top">
        {bank.logo ? <Html html={bank.logo} /> : <div className="credit-card-bank-name">{d.name || 'Tarjeta'}</div>}
        <div className="credit-card-info-label" style={{ textAlign: 'right' }}>CUPO TOTAL<br /><span className="credit-card-info-value">{fmt(d.payment || 0)}</span></div>
      </div>
      <div>
        <div className="credit-card-chip" />
        <div className="credit-card-number">{`•••• •••• •••• ${digits(d)}`}</div>
        <div className="credit-card-bottom">
          <div><div className="credit-card-info-label">Saldo actual</div><div className="credit-card-info-value">{fmt(d.balance || 0)}</div></div>
          <Html className="credit-card-brand" html={brand.logo} />
        </div>
      </div>
    </div>
  );
}

/** Saldo y día de corte editables al instante: se guardan al salir del campo o con Enter. */
function QuickEdit({ d }: { d: DebtX }) {
  const [bal, setBal] = useState<string | null>(null);
  const [cut, setCut] = useState<string | null>(null);
  const curBal = String(d.balance ?? ''), curCut = String(d.cutoffDay || '');
  const commit = (field: 'balance' | 'cutoffDay', draft: string | null, cur: string, reset: () => void) => { if (draft !== null && draft !== cur) window.updateDebt?.(d.id, field, draft); reset(); };
  return (
    <div className="fp-qe">
      <label className="fp-qe-field"><span data-extra="1">Saldo actual</span>
        <input type="number" min={0} step={0.01} inputMode="decimal" value={bal ?? curBal} placeholder="Saldo actual" title="Editar saldo rápido" onChange={(e) => setBal(e.target.value)}
          onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.select(), 0); }} onBlur={() => commit('balance', bal, curBal, () => setBal(null))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
      <label className="fp-qe-field fp-qe-cut"><span data-extra="1">Día de corte</span>
        <input type="number" min={1} max={31} inputMode="numeric" value={cut ?? curCut} placeholder="Día corte" title="Día del mes que cierra el periodo" onChange={(e) => setCut(e.target.value)}
          onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.select(), 0); }} onBlur={() => commit('cutoffDay', cut, curCut, () => setCut(null))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
      <span className="fp-qe-unit">día corte</span>
    </div>
  );
}

function CardDetail({ d }: { d: DebtX }) {
  const fmt = fmtF(), s = live();
  const banks = window.FP?.getBankInfo?.() || {}, brands = window.FP?.getBrandInfo?.() || {};
  const bank = banks[d.bank || ''] || { name: 'Banco' }, brand = brands[d.brand || ''] || { name: 'Tarjeta' };
  const balance = num(d.balance), limit = num(d.payment);
  const u = limit > 0 ? ((balance / limit) * 100).toFixed(1) : '0';
  const co = d.cutoffDay ? cutoffOf(d) : null;
  const st = cardMonthStats(s, d.id, month());
  const cats = (((window.FP && window.FP.getCategories && window.FP.getCategories()) || []) as Category[]);

  // ----- aviso de pago antes del corte -----
  let alert: ReactNode = null;
  if (co && co.needsPayment && co.daysLeft <= 10) {
    const hasInst = !!(co.installmentInfo && co.installmentInfo.hasInstallments);
    alert = hasInst && !co.canReachTarget ? (
      <div className="fp-alert fp-alert-amber">
        <div className="fp-alert-title">💡 Pago para minimizar utilización</div>
        <div>Saldo actual: <strong>{fmt(balance)}</strong>{` (${u}% utilización)`}</div>
        <div className="fp-alert-box">⚠️ Tienes <strong>{fmt(co.futureInstallments)}</strong> en cuotas futuras bloqueando el cupo.<br />Mínimo posible esta facturación: <strong>{`${co.minPossibleUtilization.toFixed(1)}%`}</strong> de utilización.</div>
        <div className="fp-alert-action">→ Paga <strong>{fmt(co.optimizableBalance)}</strong>{` antes del ${co.dateStr} para bajar a ${co.minPossibleUtilization.toFixed(1)}%`}</div>
        <div className="fp-alert-foot">{`💡 Incluye cuota del mes: ${fmt(co.currentMonthInstallmentSum)}`}</div>
      </div>
    ) : (
      <div className="fp-alert fp-alert-info">
        <div className="fp-alert-title">💡 Pago recomendado para mantener tu objetivo</div>
        <div>Saldo actual: <strong>{fmt(balance)}</strong>{` (${u}% utilización)`}</div>
        <div>Objetivo: mantener saldo ≤ <strong>{fmt(co.targetMaxBalance)}</strong>{` (${co.targetUtilization}% utilización)`}</div>
        <div className="fp-alert-action">→ Paga <strong>{fmt(co.paymentNeeded)}</strong>{` antes del ${co.dateStr}`}</div>
        {hasInst && <div className="fp-alert-foot">{`💡 Incluye cuota obligatoria del mes: ${fmt(co.currentMonthInstallmentSum)}`}</div>}
      </div>
    );
  } else if (co && !co.needsPayment && co.daysLeft <= 10) {
    alert = <div className="fp-alert fp-alert-ok"><strong>✅ Utilización óptima:</strong>{` Tu saldo de ${fmt(balance)} (${u}%) está debajo del ${co.targetUtilization}% objetivo. No necesitas pago anticipado.`}</div>;   {/* antes decía siempre "3 %" aunque hubieras elegido otro objetivo */}
  }

  // ----- cuotas activas y desglose del cupo -----
  let inst: ReactNode = null;
  const ii = co && co.installmentInfo;
  const hasFinished = !!(ii && ii.finished && ii.finished.length);
  if (co && ii && (ii.hasInstallments || hasFinished)) {
    const lim = num(d.payment) || 1;
    const cupo = cupoBreakdown(lim, balance, co.futureInstallmentsRaw, !!d.canPrepayInstallments);
    const prepaid = prepaidCapital(ii.outstandingNowTotal, balance);
    inst = (
      <div className="fp-inst">
        <div className="fp-block-title">💳 Cuotas activas en esta tarjeta</div>
        {(ii.groups || []).map((g, i) => (
          <div className="fp-inst-row" key={i}>
            <span>{`${g.desc} · Cuota ${g.currentIndex}/${g.totalCuotas}`}</span>
            <span>{`${fmt(g.pendingAmount)} por pagar`}{g.hasInterest ? <><br /><small>{`capital ${fmt(g.outstandingNow || 0)}`}</small></> : null}</span>
          </div>
        ))}
        {hasFinished && <div className="fp-inst-done">{`✓ Ya terminaste de pagar: ${(ii.finished || []).map((g) => g.desc).join(', ')}`}</div>}
        {ii.hasInstallments && (
          <>
            <div className="fp-cupo">
              <div className="fp-cupo-title">{`📊 Desglose del cupo (${fmt(lim)})`}</div>
              <div className="fp-cupo-bar">
                <div className="fp-cupo-locked" style={{ width: `${cupo.lockedPct}%` }} title="Capital bloqueado por cuotas futuras" />
                <div className="fp-cupo-opt" style={{ width: `${cupo.optimizablePct}%` }} title="Optimizable (puedes pagar para liberar)" />
                <div className="fp-cupo-free" style={{ width: `${cupo.freePct}%` }} title="Cupo libre" />
              </div>
              <div className="fp-cupo-legend">
                <span>{`🔒 Cuotas futuras: ${fmt(cupo.locked)} (${cupo.lockedPct.toFixed(1)}%)`}</span>
                <span>{`🟡 Optimizable: ${fmt(cupo.optimizable)}`}</span>
                <span>{`🟢 Libre: ${fmt(cupo.free)}`}</span>
              </div>
            </div>
            {prepaid > 1000 && !d.canPrepayInstallments && (
              <div className="fp-prepaid">💡 Tu saldo (<strong>{fmt(balance)}</strong>) es menor que el capital que faltaba según el calendario de tus cuotas (<strong>{fmt(ii.outstandingNowTotal)}</strong>). Es lo normal si adelantaste pagos a capital en tu banco: unos <strong>{fmt(prepaid)}</strong> ya los pagaste. La app usa como verdad el saldo de tu banco; el calendario es solo una referencia.</div>
            )}
            <label className="fp-prepay"><input type="checkbox" checked={!!d.canPrepayInstallments} onChange={(e) => window.setCanPrepayInstallments?.(d.id, e.target.checked)} />
              <span><strong>Mi banco me deja adelantar el pago de mis cuotas.</strong> Actívalo y el pago recomendado antes del corte tendrá en cuenta todo tu saldo; si no, se asume que las cuotas futuras no se pueden pagar antes.</span></label>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fp-cd card-detail-section">
      <div className="fp-cd-col">
        <div className="fp-cd-head">
          <div className="fp-cd-title"><strong>{`${d.name} · ${brand.name}`}</strong><div className="fp-cd-sub">{`${bank.name} · Termina en ${digits(d)}`}</div></div>
          <div className="fp-cd-actions">
            <button type="button" className="fp-cd-btn edit" onClick={() => window.editCard?.(d.id)}>✏️ <span className="btn-text">Editar</span></button>
            <button type="button" className="fp-cd-btn del" onClick={() => window.removeDebt?.(d.id)}>🗑️ <span className="btn-text">Eliminar</span></button>
          </div>
        </div>
        <div className="fp-cd-meters"><span>Utilización: <strong>{`${u}%`}</strong></span><span>Disponible: <strong>{fmt(num(d.payment) - balance)}</strong></span></div>
        <div className="progress-bar fp-cd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, parseFloat(u)))} aria-label={`Utilización ${u}%`}><div className={`progress-fill ${utilBarTone(parseFloat(u))}`} style={{ width: `${Math.min(100, parseFloat(u))}%` }} /></div>
        {co && <div className="fp-cd-cutoff">{`${co.icon || ''} ${co.text || ''}`}</div>}
        {alert}
      </div>
      <div className="fp-cd-col">
        {inst}
        {st.txCount > 0 && (
          <>
            <div className="fp-stats"><div><span>📊 Compras este mes:</span><span>{`${st.txCount} (${fmt(st.totalSpent)})`}</span></div><div><span>💰 Cashback ganado:</span><span className="fp-cb">{`+${fmt(st.totalCashback)}`}</span></div></div>
            <details className="fp-txs"><summary>{`📋 Ver los ${st.txCount} gastos de este mes`}</summary>
              <div className="fp-tx-list">
                {st.transactions.map((t: TxLike & { installment?: { current?: number; total?: number }; desc?: string; category?: string }, i) => {
                  const c = cats.find((x) => x.id === t.category);
                  let ds = ''; try { ds = new Date(t.date + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); } catch { ds = String(t.date || ''); }
                  const il = t.installment && t.installment.current && t.installment.total ? ` · Cuota ${t.installment.current}/${t.installment.total}` : '';
                  const cb = num(t.cashback);
                  return (
                    <div className="fp-tx-item" key={i}>
                      <div className="fp-tx-main"><div className="fp-tx-desc">{`${c ? c.icon : '📋'} ${t.desc || 'Gasto'}`}</div><div className="fp-tx-meta">{`${ds}${il}`}</div></div>
                      <div className="fp-tx-amt"><div>{fmt(num(t.amount))}</div>{cb > 0 && <div className="fp-tx-cb">{`+${fmt(cb)} cashback`}</div>}</div>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )}
        <QuickEdit d={d} />
        <p className="fp-cd-hint">💡 Para cambiar nombre, cupo o número, usa el botón "Editar" arriba</p>
      </div>
    </div>
  );
}

/** "Mis tarjetas": cartera de tarjetas (con tamaño real de tarjeta) y el detalle de la elegida. */
export function CardsList() {
  useFP();
  const debts = (live().debts || []) as unknown as DebtX[];
  const [sel, setSel] = useState<string | null>(() => { try { return sessionStorage.getItem(KEY); } catch { return null; } });
  if (!debts.length) {
    return (
      <div className="empty-state-fancy"><div className="empty-state-icon">💳</div><h3 className="empty-state-title">Sin tarjetas registradas</h3>
        <p className="empty-state-message">Registra tus tarjetas de crédito para hacer seguimiento de cupos, cashback y mejorar tu score crediticio.</p>
        <button type="button" className="empty-state-action" onClick={() => document.getElementById('card-template')?.focus()}>➕ Agregar mi primera tarjeta</button></div>
    );
  }
  const current = debts.find((d) => String(d.id) === sel) || debts[0];
  const pick = (d: DebtX) => { setSel(String(d.id)); try { sessionStorage.setItem(KEY, String(d.id)); } catch { /* sin almacenamiento: no pasa nada */ } };
  return (
    <div className="fp-cards">
      <div className="fp-wallet" role="listbox" aria-label="Tus tarjetas">
        {debts.map((d) => <WalletCard key={String(d.id)} d={d} selected={String(d.id) === String(current.id)} dim={debts.length > 1} onSelect={() => pick(d)} />)}
      </div>
      <CardDetail key={String(current.id)} d={current} />
    </div>
  );
}
