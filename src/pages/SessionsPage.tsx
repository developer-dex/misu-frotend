import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Empty, LoadError, Panel, Sheet, Spinner } from '../components/ui';
import { clockTime, duration, inr, longDay, monthName, monthRange, num, plural, shiftMonth, shortDay, todayLocal } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { Order, SessionLog, StallSession } from '../types';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** A running session's length keeps growing; a finished one is fixed. */
function liveMs(s: StallSession, now: number): number {
  return s.running ? now - Date.parse(s.start) : s.durationMs;
}

function flavourLine(s: StallSession, products: SessionLog['products']): string {
  const parts = products.filter((p) => s.unitsByProduct[p.productId]).map((p) => `${num(s.unitsByProduct[p.productId])} ${p.name}`);
  return parts.length ? parts.join(' · ') : 'Nothing sold';
}

function timeRange(s: StallSession): string {
  return s.end ? `${clockTime(s.start)} – ${clockTime(s.end)}` : `Since ${clockTime(s.start)}`;
}

export function SessionsPage() {
  const thisMonth = todayLocal().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [openId, setOpenId] = useState<string | null>(null);
  const range = monthRange(month);
  const log = useLoad(() => api.sessions(range.from, range.to), [month]);
  const data = log.data;
  const now = useNow(Boolean(data?.sessions.some((s) => s.running)));

  const days = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, StallSession[]>();
    for (const s of data.sessions) map.set(s.day, [...(map.get(s.day) ?? []), s]);
    for (const o of data.outside) if (!map.has(o.day)) map.set(o.day, []);
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [data]);

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Sessions</h1>
          <p className="subtitle">Every Start and Stop of the clock, and what sold in it</p>
        </div>
        <div className="month-switch month-switch-title">
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            <ChevronLeft size={20} />
          </button>
          <span>{monthName(month)}</span>
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} aria-label="Next month">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {log.error && !data ? (
        <LoadError message={log.error} onRetry={log.reload} />
      ) : !data ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="finding">
            {data.totals.sessionCount === 0
              ? `No sessions in ${monthName(month)} yet. Start the clock on the Sell screen when you open the stall.`
              : `${plural(data.totals.sessionCount, 'session')} in ${monthName(month)}, ${duration(
                  data.sessions.reduce((sum, s) => sum + liveMs(s, now), 0),
                )} at the stall.`}
          </p>

          <dl className="kpi-strip">
            <div className="kpi-lead">
              <dt>Takings in sessions</dt>
              <dd>{inr(data.totals.net)}</dd>
            </div>
            <div>
              <dt>Sold in sessions</dt>
              <dd>{num(data.totals.units)}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{num(data.totals.orderCount)}</dd>
            </div>
            <div>
              <dt>Sold per hour</dt>
              <dd>{data.totals.unitsPerHour === null ? <span className="dash">–</span> : data.totals.unitsPerHour.toFixed(1)}</dd>
            </div>
          </dl>

          <Panel title="Session log" id="log" aside={<span className="meta">Newest first</span>}>
            {days.length === 0 && <Empty>Nothing recorded this month.</Empty>}
            {days.map(([day, sessions]) => {
              const outside = data.outside.find((o) => o.day === day);
              return (
                <div key={day} className="date-group">
                  <div className="date-group-head">
                    <h3>{longDay(day)}</h3>
                    <span>{inr(sessions.reduce((sum, s) => sum + s.net, 0) + (outside?.net ?? 0))}</span>
                  </div>
                  <ul className="session-list">
                    {sessions.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="session-row" onClick={() => setOpenId(s.id)}>
                          <span className="session-main">
                            <strong>
                              Session {s.number}
                              {s.running && <span className="pill pill-live">Running</span>}
                            </strong>
                            <span className="meta">
                              {timeRange(s)} · {duration(liveMs(s, now))}
                            </span>
                            <span className="session-flavours">{flavourLine(s, data.products)}</span>
                          </span>
                          <span className="session-figures">
                            <strong className="num">{inr(s.net)}</strong>
                            <span className="meta num">
                              {plural(s.units, 'sold', 'sold')}
                              {s.unitsPerHour !== null && ` · ${s.unitsPerHour.toFixed(1)}/h`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {outside && (
                    <p className="session-outside">
                      Sold with the clock stopped: {plural(outside.orderCount, 'order')} · {plural(outside.units, 'tiramisu', 'tiramisu')} ·{' '}
                      {inr(outside.net)}
                    </p>
                  )}
                </div>
              );
            })}
          </Panel>
        </>
      )}

      <SessionSheet
        id={openId}
        products={data?.products ?? []}
        onClose={() => setOpenId(null)}
        onDeleted={() => {
          setOpenId(null);
          void log.reload();
        }}
      />
    </div>
  );
}

function SessionSheet({
  id,
  products,
  onClose,
  onDeleted,
}: {
  id: string | null;
  products: SessionLog['products'];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<{ session: StallSession; orders: Order[] } | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError('');
    setConfirming(false);
    if (!id) return;
    let alive = true;
    api
      .session(id)
      .then((d) => alive && setDetail(d))
      .catch((err) => alive && setError((err as Error).message));
    return () => {
      alive = false;
    };
  }, [id]);

  const remove = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await api.deleteSession(id);
      toast('Session deleted. Its orders are kept.');
      onDeleted();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const s = detail?.session;

  return (
    <Sheet open={id !== null} onClose={onClose} title={s ? `Session ${s.number} · ${shortDay(s.day)}` : 'Session'}>
      {error && <p className="form-error">{error}</p>}
      {!detail && !error && <Spinner />}
      {s && detail && (
        <>
          <dl className="order-sum order-detail">
            <div>
              <dt>Started</dt>
              <dd>
                {clockTime(s.start)}
                {s.startedBy && <span className="meta"> by {s.startedBy}</span>}
              </dd>
            </div>
            <div>
              <dt>Stopped</dt>
              <dd>
                {s.end ? clockTime(s.end) : 'Still running'}
                {s.stoppedBy && <span className="meta"> by {s.stoppedBy}</span>}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{duration(s.running ? Date.now() - Date.parse(s.start) : s.durationMs)}</dd>
            </div>
            {products
              .filter((p) => s.unitsByProduct[p.productId])
              .map((p) => (
                <div key={p.productId}>
                  <dt>{p.name}</dt>
                  <dd>{num(s.unitsByProduct[p.productId])} sold</dd>
                </div>
              ))}
            <div>
              <dt>Per hour</dt>
              <dd>{s.unitsPerHour === null ? <span className="dash">–</span> : `${s.unitsPerHour.toFixed(1)} sold`}</dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd>{inr(s.cash)}</dd>
            </div>
            <div>
              <dt>Online</dt>
              <dd>{inr(s.online)}</dd>
            </div>
            {s.discount > 0 && (
              <div>
                <dt>Discounts</dt>
                <dd>−{inr(s.discount)}</dd>
              </div>
            )}
            <div className="order-total">
              <dt>
                Takings <span>· {plural(s.units, 'tiramisu', 'tiramisu')}</span>
              </dt>
              <dd>{inr(s.net)}</dd>
            </div>
          </dl>

          <div>
            <h3 className="sheet-subhead">Orders in this session</h3>
            {detail.orders.length === 0 ? (
              <Empty>No orders while this session ran.</Empty>
            ) : (
              <ul className="order-list">
                {detail.orders.map((o) => (
                  <li key={o.id}>
                    <div className="order-row">
                      <span className="order-time">{clockTime(o.createdAt)}</span>
                      <span className="order-items">
                        {o.items.map((i) => `${i.qty} ${i.name}`).join(' · ')}
                        {o.discount > 0 && <span className="order-discount-note"> · −{inr(o.discount)}</span>}
                      </span>
                      <span className={`pill pill-${o.payment}`}>{o.payment === 'cash' ? 'Cash' : 'Online'}</span>
                      <span className="order-amount">{inr(o.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {s.running ? (
            <p className="meta">Stop the clock on the Sell screen to end this session.</p>
          ) : confirming ? (
            <button type="button" className="btn btn-danger btn-block" onClick={remove} disabled={busy}>
              Yes, delete this session
            </button>
          ) : (
            <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirming(true)}>
              Delete session
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
