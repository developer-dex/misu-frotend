import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarDays, Check, Clock, Phone, Pause, Play, RefreshCw, Smartphone, X } from 'lucide-react';
import { ApiError, api, hasPendingWrites, newClientId } from '../api';
import { SellTabs } from '../components/SellTabs';
import { useToast } from '../components/Toast';
import { Empty, LoadError, MoneyInput, Panel, Sheet, Spinner, Stepper, toAmount } from '../components/ui';
import { clockTime, duration, inr, longDay, num, payLabel, plural, shortDay, stopwatch, todayLocal } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { DayView, Order, Payment, Product } from '../types';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function sessionMs(s: { start: string; end: string | null }, now: number): number {
  return (s.end ? Date.parse(s.end) : now) - Date.parse(s.start);
}

function itemsLabel(order: Order): string {
  return order.items.map((i) => `${i.qty} ${i.name}`).join(' · ');
}

export function SellPage() {
  const toast = useToast();
  // null = follow today (or the day whose clock is still running)
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const products = useLoad(() => api.products(), [], 'products');
  const day = useLoad(() => (pickedDay ? api.day(pickedDay) : api.currentDay(todayLocal())), [pickedDay], `day:${pickedDay ?? `current:${todayLocal()}`}`);
  const view = day.data;

  // Every arrival on this screen loads fresh figures: opening it (useLoad does that),
  // tapping Sell again while here, and coming back to the app or browser tab
  const { key: visit } = useLocation();
  const firstVisit = useRef(visit);
  const reloadAll = useRef(() => {});
  reloadAll.current = () => {
    void products.reload();
    void day.reload();
  };

  useEffect(() => {
    if (visit === firstVisit.current) return;
    firstVisit.current = visit;
    // A fresh visit starts on today, as it does when coming from another screen
    if (pickedDay !== null) {
      void products.reload();
      setPickedDay(null); // which loads today
    } else {
      reloadAll.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadAll.current();
    };
    // pageshow covers a phone restoring the page from its back/forward cache
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reloadAll.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const setView = day.setData;

  if (day.error && !view) return <LoadError message={day.error} onRetry={day.reload} />;
  if (products.error && !products.data) return <LoadError message={products.error} onRetry={products.reload} />;
  if (!view || !products.data) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  const today = todayLocal();
  const activeProducts = products.data.filter((p) => p.active);

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>{view.day === today ? 'Today' : shortDay(view.day)}</h1>
          <p className="subtitle">
            {longDay(view.day)}
            {view.day !== today && view.running && ' · clock still running from this day'}
            {(day.loading || products.loading) && (
              <span className="sell-refreshing" role="status">
                <RefreshCw size={13} aria-hidden="true" className="is-spinning" />
                Updating
              </span>
            )}
          </p>
        </div>
        <div className="title-actions">
          <button
            type="button"
            className="day-picker page-refresh"
            onClick={() => {
              // A full reload would drop an order still on its way to the server
              if (hasPendingWrites()) return toast('An order is still saving. Refresh once it is saved.');
              if (!navigator.onLine) {
                toast('No internet right now. Showing the last figures.', { tone: 'error' });
                return reloadAll.current();
              }
              window.location.reload();
            }}
            aria-label="Refresh the whole page"
          >
            <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <DayPicker
            day={view.day}
            onPick={(d) => setPickedDay(d === today ? null : d)}
            isToday={view.day === today && pickedDay === null}
          />
        </div>
      </div>

      <SellTabs />

      {day.error && (
        <p className="notice" role="alert">
          Could not refresh: {day.error} Showing what was loaded last.{' '}
          <button type="button" className="link-btn" onClick={() => void day.reload()}>
            Try again
          </button>
        </p>
      )}

      {view.off && <DayOffNotice view={view} isToday={view.day === today} onChange={setView} />}

      {view.day !== today && !view.running && !view.off && (
        <p className="notice">
          You are adding orders to {longDay(view.day)}. Only have the day's totals?{' '}
          <Link to={`/past?day=${view.day}`} className="link-btn">
            Enter them in Past days
          </Link>.{' '}
          <button type="button" className="link-btn" onClick={() => setPickedDay(null)}>
            Back to today
          </button>
        </p>
      )}

      <StockAlerts view={view} />

      <div className="sell-grid">
        <div className="sell-main">
          <ShiftClock view={view} isPast={view.day < today} onChange={setView} />
          <HeldPanel view={view} onChange={setView} onRefresh={day.reload} />
          <OrderForm day={view.day} products={activeProducts} stock={view.byProduct} onSaved={setView} onRefresh={day.reload} toast={toast} />
        </div>
        <div className="sell-side">
          <TakingsPanel view={view} />
          <StockPanel view={view} products={activeProducts} onChange={setView} />
          <OrdersPanel view={view} onChange={setView} onRefresh={day.reload} refreshing={day.loading} />
        </div>
      </div>
    </div>
  );
}

function DayOffNotice({ view, isToday, onChange }: { view: DayView; isToday: boolean; onChange: (v: DayView) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const undo = async () => {
    setBusy(true);
    try {
      onChange(await api.setDayOff(view.day, false));
      toast(`${shortDay(view.day)} is no longer a day off`);
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <p className="notice day-off-notice">
      <strong>Day off.</strong> {isToday ? 'Today is' : 'This day is'} marked as closed. Ringing up an order or starting the clock opens it again.{' '}
      <button type="button" className="link-btn" onClick={undo} disabled={busy}>
        Undo day off
      </button>
    </p>
  );
}

function DayPicker({ day, onPick, isToday }: { day: string; onPick: (d: string) => void; isToday: boolean }) {
  return (
    <label className={`day-picker ${isToday ? '' : 'is-past'}`}>
      <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
      <span>{isToday ? 'Change day' : shortDay(day)}</span>
      <input
        type="date"
        value={day}
        max={todayLocal()}
        aria-label="Choose the day to record sales for"
        onChange={(e) => e.target.value && onPick(e.target.value)}
      />
    </label>
  );
}

/**
 * The stall clock. While it runs it shows the current session: its time and
 * what has been sold since Start. When stopped it shows the day's total.
 */
function ShiftClock({ view, isPast, onChange }: { view: DayView; isPast: boolean; onChange: (v: DayView) => void }) {
  const toast = useToast();
  const now = useNow(view.running);
  const [busy, setBusy] = useState(false);
  const current = view.currentSession;
  const dayMs = view.sessions.reduce((sum, s) => sum + sessionMs(s, now), 0);
  const last = view.sessions[view.sessions.length - 1];

  // Figures for the running session, or for the whole day when the clock is stopped
  const shownMs = current ? sessionMs(current, now) : dayMs;
  const units = current ? current.units : view.summary.units;
  const net = current ? current.net : view.summary.net;
  const hours = shownMs / 3_600_000;
  const rate = shownMs >= 5 * 60_000 ? units / hours : null;

  const toggle = async () => {
    setBusy(true);
    try {
      onChange(view.running ? await api.stopSession(view.day) : await api.startSession(view.day));
      toast(view.running ? 'Session stopped' : `Session ${view.sessions.length + 1} started`);
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  let status = isPast ? 'The clock only runs live. Type in past hours on Past days.' : 'Start the clock when you open the stall';
  if (current) status = `Since ${clockTime(current.start)}`;
  else if (last?.end) status = `Last session ended at ${clockTime(last.end)}`;

  // A day with nothing on it yet can be marked as one the stall stays closed
  const canMarkOff = !view.off && !view.running && view.sessions.length === 0 && view.summary.orderCount === 0;
  const markOff = async () => {
    setBusy(true);
    try {
      onChange(await api.setDayOff(view.day, true));
      toast(`${isPast ? shortDay(view.day) : 'Today'} marked as a day off`);
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  let footer: string | null = null;
  if (view.sessions.length > 0) {
    footer = `${isPast ? 'This day' : 'Today'}: ${duration(dayMs)} over ${plural(view.sessions.length, 'session')}`;
    if (current) footer += ` · ${plural(view.summary.units, 'tiramisu', 'tiramisu')} in all`;
  }

  return (
    <Panel className={`clock ${view.running ? 'is-running' : ''}`}>
      <div className="clock-row">
        <div>
          <p className="label">
            {view.running && <span className="live-dot" aria-hidden="true" />}
            {current ? `Session ${current.number}` : isPast ? 'Stall time' : 'Stall time today'}
          </p>
          <p className="clock-time" aria-live="off">
            {stopwatch(shownMs)}
          </p>
          <p className="meta">{status}</p>
        </div>
        {isPast && !view.running ? (
          // Starting the clock on a past day would record today's time against it
          <Link to={`/past?day=${view.day}`} className="btn btn-quiet clock-btn">
            Set hours
          </Link>
        ) : (
          <button type="button" className={`btn clock-btn ${view.running ? 'btn-stop' : 'btn-primary'}`} onClick={toggle} disabled={busy}>
            {view.running ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            {view.running ? 'Stop' : 'Start'}
          </button>
        )}
      </div>
      <dl className="clock-stats">
        <div>
          <dt>Sold</dt>
          <dd>{num(units)}</dd>
        </div>
        <div>
          <dt>Per hour</dt>
          <dd>{rate === null ? <span className="dash">–</span> : rate.toFixed(1)}</dd>
        </div>
        <div>
          <dt>{current ? 'Takings' : '₹ per hour'}</dt>
          <dd>{current ? inr(net) : rate === null ? <span className="dash">–</span> : inr(Math.round(net / hours))}</dd>
        </div>
      </dl>
      <div className="clock-foot">
        {canMarkOff ? (
          <span className="meta">
            {isPast ? 'Stall closed this day?' : 'Not opening today?'}{' '}
            <button type="button" className="link-btn" onClick={markOff} disabled={busy}>
              Mark as day off
            </button>
          </span>
        ) : (
          <span className="meta">{footer ?? 'Each Start and Stop is saved in the session log.'}</span>
        )}
        <Link to="/sessions" className="link-btn">
          Session log
        </Link>
      </div>
    </Panel>
  );
}

// A flavour with this many or fewer left (of the number made) raises an alert
const LOW_LEFT = 2;

function leftOf(p: DayView['byProduct'][number]): number | null {
  // Tiramisu set aside for orders on hold are off the tray too
  return p.prepared === null ? null : p.prepared - p.sold - (p.held ?? 0);
}

function alertText(name: string, left: number): string {
  if (left < 0) return `${name}: ${num(-left)} more sold than made`;
  if (left === 0) return `${name} is sold out`;
  return `Only ${num(left)} ${name} left`;
}

/**
 * Warns when a flavour runs low or sells out (needs "made" set for the day).
 * The banner shows while it is true; the phone vibrates only when it changes.
 */
function StockAlerts({ view }: { view: DayView }) {
  const lastLeft = useRef(new Map<string, number>());
  const [dismissed, setDismissed] = useState('');

  const low = view.byProduct.map((p) => ({ p, left: leftOf(p) })).filter((x): x is { p: typeof x.p; left: number } => x.left !== null && x.left <= LOW_LEFT);
  const signature = low.map((x) => `${x.p.productId}:${x.left}`).join(',');

  useEffect(() => {
    let dropped = false;
    for (const p of view.byProduct) {
      const left = leftOf(p);
      const key = `${view.day}:${p.productId}`;
      const before = lastLeft.current.get(key);
      if (left === null) {
        lastLeft.current.delete(key);
        continue;
      }
      // Only a sale that brings the count down announces; opening the day or editing "made" does not
      if (before !== undefined && left < before && left <= LOW_LEFT && !(before < 0)) dropped = true;
      lastLeft.current.set(key, left);
    }
    if (dropped) navigator.vibrate?.([200, 100, 200]);
  }, [view]);

  if (low.length === 0 || dismissed === signature) return null;

  return (
    <div className="stock-alert" role="alert">
      <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
      <p>{low.map((x) => alertText(x.p.name, x.left)).join(' · ')}</p>
      <button type="button" className="icon-btn" onClick={() => setDismissed(signature)} aria-label="Hide this alert">
        <X size={18} />
      </button>
    </div>
  );
}

function OrderForm({
  day,
  products,
  stock,
  onSaved,
  onRefresh,
  toast,
}: {
  day: string;
  products: Product[];
  stock: DayView['byProduct'];
  onSaved: (v: DayView) => void;
  onRefresh: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('');
  // Discount typed as rupees off, or as a percentage of the order. Kept between orders.
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  // 'hold': the customer pays when they collect it
  const [payment, setPayment] = useState<Payment | 'hold' | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Cash the customer hands over, only to work out their change; never saved
  const [received, setReceived] = useState('');
  // Orders still on their way to the server; the form is free for the next one meanwhile
  const sending = useRef({ seq: 0, applied: 0, open: 0, skipped: false });
  // An order that failed to save is put back in the form with its id, so sending
  // it again cannot record it twice if the first try did reach the server
  const failed = useRef<{ clientId: string; key: string } | null>(null);

  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const units = lines.reduce((s, p) => s + qty[p.id], 0);
  const subtotal = lines.reduce((s, p) => s + p.price * qty[p.id], 0);
  const discountPct = discountMode === 'percent' ? toAmount(discount) : 0;
  // A percentage is rounded to whole rupees, which is what changes hands at the stall
  const discountAmount = discountMode === 'percent' ? Math.round((subtotal * Math.min(discountPct, 100)) / 100) : toAmount(discount);
  const total = Math.max(0, subtotal - discountAmount);
  const discountTooBig = units > 0 && (discountMode === 'percent' ? discountPct > 100 : discountAmount > subtotal);
  const needsName = payment === 'hold' && customerName.trim() === '';
  const ready = units > 0 && payment !== null && !discountTooBig && !needsName;

  let hint = '';
  if (units === 0) hint = 'Add a tiramisu to start';
  else if (!payment) hint = 'Choose cash, online or on hold';
  else if (discountTooBig) hint = discountMode === 'percent' ? 'Discount cannot be more than 100%' : 'Discount is more than the order';
  else if (needsName) hint = 'Enter the customer name to put the order on hold';

  const reset = () => {
    setQty({});
    setDiscount('');
    setPayment(null);
    setReceived('');
    setCustomerName('');
    setCustomerPhone('');
  };

  const submit = async () => {
    if (!ready || !payment) return;
    const customer = payment === 'hold' ? { name: customerName.trim(), phone: customerPhone.trim() } : undefined;
    const draft = { qty, discount, discountMode, payment, customerName, customerPhone };
    const items = lines.map((p) => ({ productId: p.id, qty: qty[p.id] }));
    const key = JSON.stringify({ items, discountAmount, payment, customer });
    const clientId = failed.current?.key === key ? failed.current.clientId : newClientId();
    failed.current = null;
    const label = `${plural(units, 'tiramisu', 'tiramisu')} · ${inr(total)} ${payment === 'hold' ? `on hold for ${customer!.name}` : payment}`;
    const s = sending.current;
    const id = ++s.seq;
    s.open++;
    // Clear the form at once so the next customer can be rung up while this one saves
    reset();
    toast(`Saving ${label}…`);
    try {
      const res = await api.addOrder({ day, items, discount: discountAmount, payment: draft.payment, customer, clientId }, () =>
        toast(`Still saving ${label}… the connection is slow`),
      );
      // Answers can come back out of order; an older one must not hide a newer order
      if (id > s.applied) {
        s.applied = id;
        onSaved(res.day);
      } else {
        s.skipped = true;
      }
      toast(`Saved ${label}`, {
        action: {
          label: 'Undo',
          run: async () => {
            try {
              onSaved((await api.deleteOrder(res.orderId)).day);
            } catch (err) {
              toast((err as Error).message, { tone: 'error' });
            }
          },
        },
      });
    } catch (err) {
      // Put the order back so nothing is lost
      failed.current = { clientId, key };
      setQty(draft.qty);
      setDiscount(draft.discount);
      setDiscountMode(draft.discountMode);
      setPayment(draft.payment);
      setCustomerName(draft.customerName);
      setCustomerPhone(draft.customerPhone);
      const offline = err instanceof ApiError && err.status === 0;
      // The order may have reached the server even so; its id makes sending it again safe
      toast(offline ? `Not saved: ${err.message} The order is back in the form; submit it again, it will not be counted twice.` : `Not saved: ${(err as Error).message}`, {
        tone: 'error',
      });
    } finally {
      s.open--;
      if (s.open === 0 && s.skipped) {
        s.skipped = false;
        onRefresh();
      }
    }
  };

  const leftById = new Map(stock.map((p) => [p.productId, leftOf(p)]));

  return (
    <Panel title="New order" id="order" aside={units > 0 ? <button type="button" className="link-btn" onClick={reset}>Clear</button> : null}>
      <ul className="flavour-list">
        {products.map((p) => {
          const n = qty[p.id] ?? 0;
          const left = leftById.get(p.id) ?? null;
          return (
            <li key={p.id} className={n > 0 ? 'is-picked' : ''}>
              <button type="button" className="flavour-name" onClick={() => setQty({ ...qty, [p.id]: n + 1 })}>
                <strong>{p.name}</strong>
                <span>
                  {inr(p.price)}
                  {left !== null && (
                    <span className={`flavour-left ${left <= 0 ? 'is-bad' : left <= LOW_LEFT ? 'is-low' : ''}`}>
                      {' · '}
                      {left <= 0 ? 'Sold out' : `${num(left)} left`}
                    </span>
                  )}
                </span>
              </button>
              <Stepper value={n} label={p.name} onChange={(v) => setQty({ ...qty, [p.id]: v })} />
            </li>
          );
        })}
        {products.length === 0 && <Empty>No flavours on sale. Add one in Settings.</Empty>}
      </ul>

      <div className="order-discount">
        <label htmlFor="discount">Discount</label>
        <div className="discount-entry">
          <div className="segmented discount-mode" role="radiogroup" aria-label="Discount as">
            {(['amount', 'percent'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={discountMode === m}
                aria-label={m === 'amount' ? 'Rupees off' : 'Percent off'}
                className={discountMode === m ? 'is-on' : ''}
                onClick={() => {
                  if (m === discountMode) return;
                  // ₹10 off and 10% off are different discounts, so start the box afresh
                  setDiscountMode(m);
                  setDiscount('');
                }}
              >
                {m === 'amount' ? '₹' : '%'}
              </button>
            ))}
          </div>
          <MoneyInput id="discount" value={discount} onChange={setDiscount} percent={discountMode === 'percent'} />
        </div>
      </div>

      <div className="pay-choice pay-choice-3" role="radiogroup" aria-label="Payment">
        {(['cash', 'online', 'hold'] as const).map((method) => (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={payment === method}
            className={`pay-btn ${payment === method ? 'is-on' : ''}`}
            onClick={() => setPayment(method)}
          >
            {method === 'cash' ? (
              <Banknote size={22} strokeWidth={1.75} aria-hidden="true" />
            ) : method === 'online' ? (
              <Smartphone size={22} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Clock size={22} strokeWidth={1.75} aria-hidden="true" />
            )}
            {payLabel(method === 'hold' ? null : method)}
            {payment === method && <Check size={18} className="pay-check" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {payment === 'hold' && (
        <div className="hold-fields">
          <p className="meta">The customer pays when they collect it. It is not counted in takings until then.</p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="hold-name">Customer name</label>
              <input id="hold-name" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={60} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="hold-phone">
                Phone <span className="meta">(optional)</span>
              </label>
              <input
                id="hold-phone"
                className="input"
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))}
                maxLength={20}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      )}

      <dl className="order-sum">
        {discountAmount > 0 && (
          <>
            <div>
              <dt>Subtotal</dt>
              <dd>{inr(subtotal)}</dd>
            </div>
            <div>
              <dt>Discount{discountMode === 'percent' && <span> · {num(discountPct)}%</span>}</dt>
              <dd className={discountTooBig ? 'is-bad' : ''}>−{inr(discountAmount)}</dd>
            </div>
          </>
        )}
        <div className="order-total">
          <dt>Total{units > 0 && <span> · {plural(units, 'tiramisu', 'tiramisu')}</span>}</dt>
          <dd>{inr(total)}</dd>
        </div>
      </dl>

      {payment === 'cash' && units > 0 && <CashChange total={total} received={received} onChange={setReceived} />}

      <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!ready} onClick={submit} aria-describedby="order-hint">
        {payment === 'hold' ? 'Put order on hold' : 'Submit order'}
      </button>
      <p id="order-hint" className="form-hint" aria-live="polite">
        {hint}
      </p>
    </Panel>
  );
}

// Notes customers usually pay with, offered as one-tap amounts
const NOTES = [100, 200, 500, 2000];

/** How much change to hand back for the cash the customer gave. Only shown, never saved. */
function CashChange({ total, received, onChange }: { total: number; received: string; onChange: (v: string) => void }) {
  const given = toAmount(received);
  const diff = Math.round((given - total) * 100) / 100;
  const notes = NOTES.filter((n) => n >= total);

  return (
    <div className="cash-change">
      <div className="order-discount">
        <label htmlFor="cash-received">Customer gave</label>
        <MoneyInput id="cash-received" value={received} onChange={onChange} />
      </div>
      {notes.length > 0 && (
        <div className="cash-notes" role="group" aria-label="Amount the customer gave">
          {notes.map((n) => (
            <button key={n} type="button" className={`chip ${given === n ? 'is-on' : ''}`} aria-pressed={given === n} onClick={() => onChange(String(n))}>
              {inr(n)}
            </button>
          ))}
        </div>
      )}
      {given > 0 && (
        <p className={`cash-back ${diff < 0 ? 'is-short' : ''}`} aria-live="polite">
          {diff < 0 ? (
            <>
              <span>Still to pay</span>
              <strong>{inr(-diff)}</strong>
            </>
          ) : (
            <>
              <span>Give back</span>
              <strong>{inr(diff)}</strong>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** Orders waiting to be paid for, from any day. Tap one when the customer comes to pay. */
function HeldPanel({ view, onChange, onRefresh }: { view: DayView; onChange: (v: DayView) => void; onRefresh: () => void }) {
  const [selected, setSelected] = useState<Order | null>(null);
  const held = view.held ?? [];
  if (held.length === 0) return null;
  const total = held.reduce((sum, o) => sum + o.total, 0);
  const today = todayLocal();

  return (
    <Panel title="On hold" id="held" className="held-panel" aside={<span className="meta">{plural(held.length, 'order')} · {inr(total)}</span>}>
      <ul className="order-list">
        {held.map((o) => (
          <li key={o.id}>
            <button type="button" className="order-row held-row" onClick={() => setSelected(o)}>
              <span className="order-time">{o.day === today ? clockTime(o.createdAt) : shortDay(o.day)}</span>
              <span className="order-items">
                <strong className="order-customer">{o.customer?.name ?? 'Customer'}</strong>
                {o.customer?.phone && <span className="meta"> · {o.customer.phone}</span>}
                <span className="held-items">{itemsLabel(o)}</span>
              </span>
              <span className="pill pill-hold">Pay</span>
              <span className="order-amount">{inr(o.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      <OrderSheet order={selected} view={view} onClose={() => setSelected(null)} onChange={onChange} onRefresh={onRefresh} />
    </Panel>
  );
}

function TakingsPanel({ view }: { view: DayView }) {
  const s = view.summary;
  return (
    <Panel title="Takings" id="takings" aside={<span className="meta">{plural(s.orderCount, 'order')}</span>}>
      <p className="takings-total">{inr(s.net)}</p>
      <dl className="split-stats">
        <div>
          <dt>Cash</dt>
          <dd>{inr(s.cash)}</dd>
        </div>
        <div>
          <dt>Online</dt>
          <dd>{inr(s.online)}</dd>
        </div>
        <div>
          <dt>Discounts</dt>
          <dd>{s.discount > 0 ? `−${inr(s.discount)}` : inr(0)}</dd>
        </div>
      </dl>
      {s.heldCount > 0 && (
        <p className="meta takings-held">
          Not counted yet: {plural(s.heldCount, 'order')} on hold · {inr(s.heldTotal)}
        </p>
      )}
    </Panel>
  );
}

function trayLabel(p: DayView['byProduct'][number]): string {
  return `${p.sold} of ${p.prepared} sold${p.held > 0 ? `, ${p.held} on hold` : ''}`;
}

/** Sold against made, per flavour: the tray running down through the evening. */
function StockPanel({ view, products, onChange }: { view: DayView; products: Product[]; onChange: (v: DayView) => void }) {
  const [editing, setEditing] = useState(false);
  const anyPrepared = view.byProduct.some((p) => p.prepared !== null);
  // All flavours together. Made and left only count flavours whose number made is set.
  const total = view.byProduct.reduce(
    (t, p) => {
      const left = leftOf(p);
      return {
        made: t.made + (p.prepared ?? 0),
        sold: t.sold + p.sold,
        held: t.held + p.held,
        left: t.left + (left !== null ? Math.max(0, left) : 0),
      };
    },
    { made: 0, sold: 0, held: 0, left: 0 },
  );
  // Roughly what the day brings in once the tray is empty: taken so far, plus the
  // orders on hold, plus what is left at today's prices (before any discounts)
  const priceOf = new Map(products.map((p) => [p.id, p.price]));
  const leftValue = view.byProduct.reduce((sum, p) => sum + Math.max(0, leftOf(p) ?? 0) * (priceOf.get(p.productId) ?? 0), 0);
  const expected = view.summary.net + view.summary.heldTotal + leftValue;

  return (
    <Panel
      title="Made and sold"
      id="stock"
      aside={
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          {anyPrepared ? 'Edit made' : 'Set made'}
        </button>
      }
    >
      <ul className="tray-list">
        {view.byProduct.map((p) => {
          const left = leftOf(p);
          const cells = p.prepared ?? 0;
          return (
            <li key={p.productId}>
              <div className="tray-head">
                <strong>{p.name}</strong>
                <span className="tray-count">
                  {num(p.sold)} sold
                  {p.held > 0 && ` · ${num(p.held)} on hold`}
                  {left !== null && (
                    <>
                      {' · '}
                      <span className={left < 0 ? 'is-bad' : left === 0 ? 'is-out' : ''}>{left < 0 ? `${num(-left)} over` : left === 0 ? 'sold out' : `${num(left)} left`}</span>
                    </>
                  )}
                </span>
              </div>
              {p.prepared !== null && cells > 0 && cells <= 60 ? (
                // Sold cups empty first, then the ones set aside for orders on hold; the full ones are left
                <div className="tray" role="img" aria-label={trayLabel(p)}>
                  {Array.from({ length: cells }, (_, i) => (
                    <span key={i} className={i < p.sold ? 'cup is-sold' : i < p.sold + p.held ? 'cup is-held' : 'cup'} />
                  ))}
                </div>
              ) : p.prepared !== null && cells > 60 ? (
                <div className="bar" role="img" aria-label={trayLabel(p)}>
                  <span style={{ width: `${Math.min(100, (p.sold / cells) * 100)}%` }} />
                  {p.held > 0 && <span className="is-held" style={{ width: `${Math.min(100, (p.held / cells) * 100)}%` }} />}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {view.byProduct.length > 1 && (anyPrepared || total.sold > 0 || total.held > 0) && (
        <dl className="tray-total">
          <div>
            <dt>Total</dt>
            <dd>
              {anyPrepared && `${num(total.made)} made · `}
              {num(total.sold)} sold
              {total.held > 0 && ` · ${num(total.held)} on hold`}
              {anyPrepared && (
                <>
                  {' · '}
                  <strong className={total.left === 0 ? 'is-out' : ''}>{total.left === 0 ? 'all sold out' : `${num(total.left)} left`}</strong>
                </>
              )}
            </dd>
          </div>
          {anyPrepared && (
            <div className="tray-money">
              <dt>
                If all sell
                <span className="meta">
                  {inr(view.summary.net)} taken
                  {view.summary.heldTotal > 0 && ` + ${inr(view.summary.heldTotal)} on hold`}
                  {leftValue > 0 && ` + ${inr(leftValue)} still in the tray`}
                </span>
              </dt>
              <dd>≈ {inr(expected)}</dd>
            </div>
          )}
        </dl>
      )}
      {!anyPrepared && <p className="meta tray-note">Set how many you made today to see what is left.</p>}
      <PreparedSheet open={editing} onClose={() => setEditing(false)} view={view} products={products} onSaved={onChange} />
    </Panel>
  );
}

function PreparedSheet({
  open,
  onClose,
  view,
  products,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  view: DayView;
  products: Product[];
  onSaved: (v: DayView) => void;
}) {
  const toast = useToast();
  const initial = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.id] = view.byProduct.find((b) => b.productId === p.id)?.prepared ?? 0;
    return map;
  }, [products, view.byProduct]);
  const [qty, setQty] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setQty(initial);
  }, [open, initial]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      onSaved(await api.setPrepared(view.day, Object.entries(qty).map(([productId, n]) => ({ productId, qty: n }))));
      onClose();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }, [qty, view.day, onSaved, onClose, toast]);

  return (
    <Sheet open={open} onClose={onClose} title={`Made on ${shortDay(view.day)}`}>
      <ul className="flavour-list">
        {products.map((p) => (
          <li key={p.id}>
            <span className="flavour-name">
              <strong>{p.name}</strong>
            </span>
            <Stepper value={qty[p.id] ?? 0} max={10000} label={p.name} onChange={(v) => setQty({ ...qty, [p.id]: v })} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving}>
        {saving ? <Spinner label="Saving" /> : 'Save'}
      </button>
    </Sheet>
  );
}

function OrdersPanel({
  view,
  onChange,
  onRefresh,
  refreshing,
}: {
  view: DayView;
  onChange: (v: DayView) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [selected, setSelected] = useState<Order | null>(null);
  return (
    <Panel
      title="Orders"
      id="orders"
      aside={
        <button type="button" className="btn btn-quiet btn-sm refresh-btn" onClick={onRefresh} disabled={refreshing} aria-label="Refresh orders">
          <RefreshCw size={16} aria-hidden="true" className={refreshing ? 'is-spinning' : ''} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      }
    >
      {view.orders.length === 0 ? (
        <Empty>No orders yet. Orders you submit show up here.</Empty>
      ) : (
        <ul className="order-list">
          {view.orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="order-row" onClick={() => setSelected(o)}>
                <span className="order-time">{o.source === 'summary' ? 'Day total' : clockTime(o.createdAt)}</span>
                <span className="order-items">
                  {o.customer && <strong className="order-customer">{o.customer.name} · </strong>}
                  {itemsLabel(o)}
                  {o.discount > 0 && <span className="order-discount-note"> · −{inr(o.discount)}</span>}
                </span>
                <span className={`pill pill-${o.payment ?? 'hold'}`}>{payLabel(o.payment)}</span>
                <span className="order-amount">{inr(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <OrderSheet order={selected} view={view} onClose={() => setSelected(null)} onChange={onChange} onRefresh={onRefresh} />
    </Panel>
  );
}

/** Shows the day the screen is on: an answer about another day's order means reloading this one. */
function applyDay(res: { day: DayView }, view: DayView, onChange: (v: DayView) => void, onRefresh: () => void) {
  if (res.day.day === view.day) onChange(res.day);
  else onRefresh();
}

function OrderSheet({
  order,
  view,
  onClose,
  onChange,
  onRefresh,
}: {
  order: Order | null;
  view: DayView;
  onClose: () => void;
  onChange: (v: DayView) => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState('');
  const dayOf = view.day;

  useEffect(() => {
    setConfirming(false);
    setReceived('');
  }, [order]);

  const run = async (action: () => Promise<{ day: DayView }>, message: string) => {
    setBusy(true);
    try {
      applyDay(await action(), view, onChange, onRefresh);
      toast(message);
      onClose();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const other: Payment = order?.payment === 'cash' ? 'online' : 'cash';
  const held = order !== null && order.payment === null;

  let title = 'Order';
  if (order) {
    if (order.source === 'summary') title = `Day total, paid ${order.payment}`;
    else if (held) title = `On hold for ${order.customer?.name ?? 'customer'}`;
    else title = `Order at ${clockTime(order.createdAt)}`;
  }

  return (
    <Sheet open={order !== null} onClose={onClose} title={title}>
      {order && (
        <>
          {order.customer && (
            <p className="hold-customer">
              <strong>{order.customer.name}</strong>
              {order.customer.phone && (
                <a href={`tel:${order.customer.phone.replace(/[^\d+]/g, '')}`} className="link-btn hold-phone">
                  <Phone size={14} aria-hidden="true" />
                  {order.customer.phone}
                </a>
              )}
              <span className="meta">
                Ordered {order.day === todayLocal() ? 'today' : shortDay(order.day)} at {clockTime(order.createdAt)}
                {order.paidAt && !held && ` · paid ${order.payment} at ${clockTime(order.paidAt)}`}
              </span>
            </p>
          )}
          <dl className="order-sum order-detail">
            {order.items.map((i) => (
              <div key={i.productId}>
                <dt>
                  {i.qty} × {i.name} <span className="meta">at {inr(i.unitPrice)}</span>
                </dt>
                <dd>{inr(i.qty * i.unitPrice)}</dd>
              </div>
            ))}
            {order.discount > 0 && (
              <div>
                <dt>Discount</dt>
                <dd>−{inr(order.discount)}</dd>
              </div>
            )}
            <div className="order-total">
              <dt>{held ? 'To pay' : `Paid ${order.payment}`}</dt>
              <dd>{inr(order.total)}</dd>
            </div>
          </dl>
          {held ? (
            <div className="sheet-actions">
              <CashChange total={order.total} received={received} onChange={setReceived} />
              <div className="pay-choice">
                {(['cash', 'online'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className="pay-btn"
                    disabled={busy}
                    onClick={() => run(() => api.setOrderPayment(order.id, method), `${order.customer?.name ?? 'Order'} paid ${inr(order.total)} ${method}`)}
                  >
                    {method === 'cash' ? <Banknote size={22} strokeWidth={1.75} aria-hidden="true" /> : <Smartphone size={22} strokeWidth={1.75} aria-hidden="true" />}
                    Paid {method}
                  </button>
                ))}
              </div>
              {confirming ? (
                <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => run(() => api.deleteOrder(order.id), 'Order deleted')}>
                  Yes, delete this order
                </button>
              ) : (
                <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirming(true)}>
                  Customer did not come: delete order
                </button>
              )}
            </div>
          ) : order.source === 'summary' ? (
            <div className="sheet-actions">
              <p className="meta">This was typed in as the day's total on Past days. Change or remove it there.</p>
              <Link to={`/past?day=${dayOf}`} className="btn btn-quiet btn-block">
                Edit in Past days
              </Link>
            </div>
          ) : (
            <div className="sheet-actions">
              <button type="button" className="btn btn-quiet btn-block" disabled={busy} onClick={() => run(() => api.setOrderPayment(order.id, other), `Changed to ${other}`)}>
                Change to {other}
              </button>
              {confirming ? (
                <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => run(() => api.deleteOrder(order.id), 'Order deleted')}>
                  Yes, delete this order
                </button>
              ) : (
                <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirming(true)}>
                  Delete order
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
