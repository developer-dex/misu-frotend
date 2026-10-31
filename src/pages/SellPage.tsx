import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarDays, Check, Pause, Play, Smartphone, X } from 'lucide-react';
import { api } from '../api';
import { SellTabs } from '../components/SellTabs';
import { useToast } from '../components/Toast';
import { Empty, LoadError, MoneyInput, Panel, Sheet, Spinner, Stepper, toAmount } from '../components/ui';
import { clockTime, duration, inr, longDay, num, plural, shortDay, stopwatch, todayLocal } from '../lib/format';
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

  const products = useLoad(() => api.products(), []);
  const day = useLoad(() => (pickedDay ? api.day(pickedDay) : api.currentDay(todayLocal())), [pickedDay]);
  const view = day.data;

  // When the app comes back to the front (e.g. opened again in the evening), move to the new day
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pickedDay === null) void day.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pickedDay, day.reload]);

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
          </p>
        </div>
        <DayPicker
          day={view.day}
          onPick={(d) => setPickedDay(d === today ? null : d)}
          isToday={view.day === today && pickedDay === null}
        />
      </div>

      <SellTabs />

      {view.day !== today && !view.running && (
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
          <OrderForm day={view.day} products={activeProducts} stock={view.byProduct} onSaved={setView} toast={toast} />
        </div>
        <div className="sell-side">
          <TakingsPanel view={view} />
          <StockPanel view={view} products={activeProducts} onChange={setView} />
          <OrdersPanel view={view} onChange={setView} />
        </div>
      </div>
    </div>
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
        <span className="meta">{footer ?? 'Each Start and Stop is saved in the session log.'}</span>
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
  return p.prepared === null ? null : p.prepared - p.sold;
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
  toast,
}: {
  day: string;
  products: Product[];
  stock: DayView['byProduct'];
  onSaved: (v: DayView) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [saving, setSaving] = useState(false);

  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const units = lines.reduce((s, p) => s + qty[p.id], 0);
  const subtotal = lines.reduce((s, p) => s + p.price * qty[p.id], 0);
  const discountAmount = toAmount(discount);
  const total = Math.max(0, subtotal - discountAmount);
  const discountTooBig = discountAmount > subtotal && units > 0;
  const ready = units > 0 && payment !== null && !discountTooBig && !saving;

  let hint = '';
  if (units === 0) hint = 'Add a tiramisu to start';
  else if (!payment) hint = 'Choose cash or online';
  else if (discountTooBig) hint = 'Discount is more than the order';

  const reset = () => {
    setQty({});
    setDiscount('');
    setPayment(null);
  };

  const submit = async () => {
    if (!ready || !payment) return;
    setSaving(true);
    try {
      const res = await api.addOrder({
        day,
        items: lines.map((p) => ({ productId: p.id, qty: qty[p.id] })),
        discount: discountAmount,
        payment,
      });
      onSaved(res.day);
      reset();
      toast(`Saved ${plural(units, 'tiramisu', 'tiramisu')} · ${inr(total)} ${payment}`, {
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
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
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
        <MoneyInput id="discount" value={discount} onChange={setDiscount} />
      </div>

      <div className="pay-choice" role="radiogroup" aria-label="Payment">
        {(['cash', 'online'] as const).map((method) => (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={payment === method}
            className={`pay-btn ${payment === method ? 'is-on' : ''}`}
            onClick={() => setPayment(method)}
          >
            {method === 'cash' ? <Banknote size={22} strokeWidth={1.75} aria-hidden="true" /> : <Smartphone size={22} strokeWidth={1.75} aria-hidden="true" />}
            {method === 'cash' ? 'Cash' : 'Online'}
            {payment === method && <Check size={18} className="pay-check" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <dl className="order-sum">
        {discountAmount > 0 && (
          <>
            <div>
              <dt>Subtotal</dt>
              <dd>{inr(subtotal)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd className={discountTooBig ? 'is-bad' : ''}>−{inr(discountAmount)}</dd>
            </div>
          </>
        )}
        <div className="order-total">
          <dt>Total{units > 0 && <span> · {plural(units, 'tiramisu', 'tiramisu')}</span>}</dt>
          <dd>{inr(total)}</dd>
        </div>
      </dl>

      <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!ready} onClick={submit} aria-describedby="order-hint">
        {saving ? <Spinner label="Saving" /> : 'Submit order'}
      </button>
      <p id="order-hint" className="form-hint" aria-live="polite">
        {hint}
      </p>
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
    </Panel>
  );
}

/** Sold against made, per flavour: the tray running down through the evening. */
function StockPanel({ view, products, onChange }: { view: DayView; products: Product[]; onChange: (v: DayView) => void }) {
  const [editing, setEditing] = useState(false);
  const anyPrepared = view.byProduct.some((p) => p.prepared !== null);

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
          const left = p.prepared === null ? null : p.prepared - p.sold;
          const cells = p.prepared ?? 0;
          return (
            <li key={p.productId}>
              <div className="tray-head">
                <strong>{p.name}</strong>
                <span className="tray-count">
                  {num(p.sold)} sold
                  {left !== null && (
                    <>
                      {' · '}
                      <span className={left < 0 ? 'is-bad' : left === 0 ? 'is-out' : ''}>{left < 0 ? `${num(-left)} over` : left === 0 ? 'sold out' : `${num(left)} left`}</span>
                    </>
                  )}
                </span>
              </div>
              {p.prepared !== null && cells > 0 && cells <= 60 ? (
                <div className="tray" role="img" aria-label={`${p.sold} of ${p.prepared} sold`}>
                  {Array.from({ length: cells }, (_, i) => (
                    <span key={i} className={i < p.sold ? 'cup is-sold' : 'cup'} />
                  ))}
                </div>
              ) : p.prepared !== null && cells > 60 ? (
                <div className="bar" role="img" aria-label={`${p.sold} of ${p.prepared} sold`}>
                  <span style={{ width: `${Math.min(100, (p.sold / cells) * 100)}%` }} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
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

function OrdersPanel({ view, onChange }: { view: DayView; onChange: (v: DayView) => void }) {
  const [selected, setSelected] = useState<Order | null>(null);
  return (
    <Panel title="Orders" id="orders" aside={view.orders.length > 0 ? <span className="meta">Newest first</span> : null}>
      {view.orders.length === 0 ? (
        <Empty>No orders yet. Orders you submit show up here.</Empty>
      ) : (
        <ul className="order-list">
          {view.orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="order-row" onClick={() => setSelected(o)}>
                <span className="order-time">{o.source === 'summary' ? 'Day total' : clockTime(o.createdAt)}</span>
                <span className="order-items">
                  {itemsLabel(o)}
                  {o.discount > 0 && <span className="order-discount-note"> · −{inr(o.discount)}</span>}
                </span>
                <span className={`pill pill-${o.payment}`}>{o.payment === 'cash' ? 'Cash' : 'Online'}</span>
                <span className="order-amount">{inr(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <OrderSheet order={selected} dayOf={view.day} onClose={() => setSelected(null)} onChange={onChange} />
    </Panel>
  );
}

function OrderSheet({
  order,
  dayOf,
  onClose,
  onChange,
}: {
  order: Order | null;
  dayOf: string;
  onClose: () => void;
  onChange: (v: DayView) => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setConfirming(false), [order]);

  const run = async (action: () => Promise<{ day: DayView }>, message: string) => {
    setBusy(true);
    try {
      onChange((await action()).day);
      toast(message);
      onClose();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const other: Payment = order?.payment === 'cash' ? 'online' : 'cash';

  return (
    <Sheet
      open={order !== null}
      onClose={onClose}
      title={order ? (order.source === 'summary' ? `Day total, paid ${order.payment}` : `Order at ${clockTime(order.createdAt)}`) : 'Order'}
    >
      {order && (
        <>
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
              <dt>Paid {order.payment}</dt>
              <dd>{inr(order.total)}</dd>
            </div>
          </dl>
          {order.source === 'summary' ? (
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
