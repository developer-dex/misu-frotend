import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { api } from '../api';
import { SellTabs } from '../components/SellTabs';
import { useToast } from '../components/Toast';
import { Empty, LoadError, MoneyInput, Panel, Sheet, Spinner, Stepper, toAmount } from '../components/ui';
import { addDays, duration, inr, longDay, plural, shortDay, todayLocal } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { DayEntry, EntryLine, Payment, ReportDay } from '../types';

const PAGE_DAYS = 14;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "18:30" on this device's clock, for a time input. */
function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A day and a time on this device's clock as an ISO instant. */
function instant(day: string, time: string): string {
  return new Date(`${day}T${time}`).toISOString();
}

function toCounts(lines: EntryLine[]): Record<string, number> {
  return Object.fromEntries(lines.map((l) => [l.productId, l.qty]));
}

function toLines(counts: Record<string, number>): EntryLine[] {
  return Object.entries(counts)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({ productId, qty }));
}

export function PastDaysPage() {
  const today = todayLocal();
  const yesterday = addDays(today, -1);
  const [pages, setPages] = useState(1);
  const [params, setParams] = useSearchParams();
  const openDay = params.get('day');

  const from = addDays(yesterday, -(PAGE_DAYS * pages - 1));
  const report = useLoad(() => api.report(from, yesterday), [from, yesterday]);
  const days = [...(report.data?.days ?? [])].reverse();

  const open = (day: string) => setParams({ day });
  const close = () => setParams({});

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Past days</h1>
          <p className="subtitle">Add a whole day's sales at once, for days you did not ring up here</p>
        </div>
        <label className="day-picker">
          <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Pick a date</span>
          <input type="date" value="" max={today} aria-label="Pick a date to fill in" onChange={(e) => e.target.value && open(e.target.value)} />
        </label>
      </div>

      <SellTabs />

      <Panel title="Choose a day" id="past-days" aside={<span className="meta">Newest first</span>}>
        {report.error && !report.data ? (
          <LoadError message={report.error} onRetry={report.reload} />
        ) : !report.data ? (
          <Spinner />
        ) : (
          <>
            <ul className="past-list">
              {days.map((d) => (
                <li key={d.day}>
                  <PastDayRow day={d} onOpen={() => open(d.day)} />
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-quiet btn-block past-more" onClick={() => setPages(pages + 1)} disabled={report.loading}>
              {report.loading ? <Spinner /> : `Show ${PAGE_DAYS} earlier days`}
            </button>
          </>
        )}
      </Panel>

      <Sheet open={openDay !== null} onClose={close} title={openDay ? longDay(openDay) : 'Day'}>
        {openDay && (
          <DayEntrySheet
            key={openDay}
            day={openDay}
            onDone={() => {
              close();
              void report.reload();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function PastDayRow({ day: d, onOpen }: { day: ReportDay; onOpen: () => void }) {
  const recorded = d.orderCount > 0;
  return (
    <button type="button" className="past-row" onClick={onOpen}>
      <span className="past-main">
        <strong>
          {shortDay(d.day)}
          {d.entered && <span className="pill pill-online">Day total</span>}
          {recorded && !d.entered && <span className="pill pill-cash">From Sell</span>}
        </strong>
        <span className="meta">
          {recorded ? `${plural(d.units, 'tiramisu', 'tiramisu')} sold` : 'Nothing recorded'}
          {d.workedMs > 0 && ` · ${duration(d.workedMs)}`}
        </span>
      </span>
      {recorded ? <span className="purchase-amount">{inr(d.net)}</span> : <span className="past-add">Add</span>}
    </button>
  );
}

function DayEntrySheet({ day, onDone }: { day: string; onDone: () => void }) {
  const entry = useLoad(() => api.dayEntry(day), [day]);
  if (entry.error && !entry.data) return <LoadError message={entry.error} onRetry={entry.reload} />;
  if (!entry.data) return <Spinner />;
  return <DayEntryForm entry={entry.data} onDone={onDone} />;
}

function DayEntryForm({ entry, onDone }: { entry: DayEntry; onDone: () => void }) {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<Payment, Record<string, number>>>({
    cash: toCounts(entry.cash.items),
    online: toCounts(entry.online.items),
  });
  const [discounts, setDiscounts] = useState<Record<Payment, string>>({
    cash: entry.cash.discount ? String(entry.cash.discount) : '',
    online: entry.online.discount ? String(entry.online.discount) : '',
  });
  const [opened, setOpened] = useState(timeOf(entry.opened));
  const [closed, setClosed] = useState(timeOf(entry.closed));
  const [showMade, setShowMade] = useState(entry.prepared.length > 0);
  const [made, setMade] = useState(toCounts(entry.prepared));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const products = entry.products;
  const priceOf = (id: string) => products.find((p) => p.productId === id)?.price ?? 0;

  const sum = (payment: Payment) => {
    const lines = toLines(counts[payment]);
    const subtotal = lines.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0);
    const discount = toAmount(discounts[payment]);
    return { lines, units: lines.reduce((s, l) => s + l.qty, 0), subtotal, discount, net: Math.max(0, subtotal - discount), tooBig: discount > subtotal };
  };
  const cash = sum('cash');
  const online = sum('online');
  const units = cash.units + online.units;

  // Closing before opening means the stall ran past midnight
  const overnight = opened !== '' && closed !== '' && closed <= opened;
  const hoursMs = opened && closed ? Date.parse(instant(overnight ? addDays(entry.day, 1) : entry.day, closed)) - Date.parse(instant(entry.day, opened)) : 0;

  let problem = '';
  if (units === 0) problem = 'Add how many tiramisu you sold';
  else if (cash.tooBig) problem = 'The cash discount is more than the cash sales';
  else if (online.tooBig) problem = 'The online discount is more than the online sales';
  else if ((opened === '') !== (closed === '')) problem = 'Enter both times, or leave both empty';

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await api.saveDayEntry(entry.day, {
        opened: opened ? instant(entry.day, opened) : null,
        closed: closed ? instant(overnight ? addDays(entry.day, 1) : entry.day, closed) : null,
        cash: { items: cash.lines, discount: cash.discount },
        online: { items: online.lines, discount: online.discount },
        prepared: showMade ? toLines(made) : null,
      });
      toast(`Saved ${shortDay(entry.day)} · ${plural(units, 'tiramisu', 'tiramisu')} · ${inr(cash.net + online.net)}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.clearDayEntry(entry.day);
      toast(`Removed the day total for ${shortDay(entry.day)}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const section = (payment: Payment, title: string, s: typeof cash) => (
    <section className="entry-section" aria-labelledby={`entry-${payment}`}>
      <div className="entry-head">
        <h3 id={`entry-${payment}`} className="sheet-subhead">
          {title}
        </h3>
        <span className="meta num">{s.units > 0 ? `${plural(s.units, 'tiramisu', 'tiramisu')} · ${inr(s.net)}` : ''}</span>
      </div>
      <ul className="flavour-list">
        {products.map((p) => {
          const n = counts[payment][p.productId] ?? 0;
          return (
            <li key={p.productId} className={n > 0 ? 'is-picked' : ''}>
              <span className="flavour-name">
                <strong>{p.name}</strong>
                <span>{inr(p.price)}</span>
              </span>
              <Stepper
                value={n}
                max={10_000}
                typeable
                label={`${p.name} paid ${payment}`}
                onChange={(v) => setCounts({ ...counts, [payment]: { ...counts[payment], [p.productId]: v } })}
              />
            </li>
          );
        })}
      </ul>
      <div className="order-discount">
        <label htmlFor={`entry-${payment}-discount`}>Discount</label>
        <MoneyInput id={`entry-${payment}-discount`} value={discounts[payment]} onChange={(v) => setDiscounts({ ...discounts, [payment]: v })} />
      </div>
    </section>
  );

  return (
    <div className="form entry-form">
      {entry.live.orderCount > 0 && (
        <p className="notice">
          The Sell screen already has {plural(entry.live.orderCount, 'order')} for this day ({inr(entry.live.net)}). Enter only what is not in those; this is
          added on top.
        </p>
      )}
      {products.length === 0 && <Empty>No flavours yet. Add them in Settings.</Empty>}

      {section('cash', 'Paid in cash', cash)}
      {section('online', 'Paid online', online)}

      <section className="entry-section" aria-labelledby="entry-hours">
        <div className="entry-head">
          <h3 id="entry-hours" className="sheet-subhead">
            Stall hours
          </h3>
          <span className="meta">{hoursMs > 0 ? `${duration(hoursMs)}${overnight ? ' · past midnight' : ''}` : 'Optional'}</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="entry-opened">Opened</label>
            <input id="entry-opened" className="input" type="time" value={opened} onChange={(e) => setOpened(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="entry-closed">Closed</label>
            <input id="entry-closed" className="input" type="time" value={closed} onChange={(e) => setClosed(e.target.value)} />
          </div>
        </div>
        <p className="field-hint">Saved as a session, so this day counts in tiramisu sold per hour.</p>
      </section>

      <section className="entry-section" aria-labelledby="entry-made">
        <div className="entry-head">
          <h3 id="entry-made" className="sheet-subhead">
            Made
          </h3>
          {showMade ? (
            <span className="meta">Optional</span>
          ) : (
            <button type="button" className="link-btn" onClick={() => setShowMade(true)}>
              Add how many you made
            </button>
          )}
        </div>
        {showMade && (
          <ul className="flavour-list">
            {products.map((p) => (
              <li key={p.productId}>
                <span className="flavour-name">
                  <strong>{p.name}</strong>
                </span>
                <Stepper
                  value={made[p.productId] ?? 0}
                  max={10_000}
                  typeable
                  label={`${p.name} made`}
                  onChange={(v) => setMade({ ...made, [p.productId]: v })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="order-sum">
        <div>
          <dt>Cash</dt>
          <dd>{inr(cash.net)}</dd>
        </div>
        <div>
          <dt>Online</dt>
          <dd>{inr(online.net)}</dd>
        </div>
        {cash.discount + online.discount > 0 && (
          <div>
            <dt>Discounts</dt>
            <dd>−{inr(cash.discount + online.discount)}</dd>
          </div>
        )}
        <div className="order-total">
          <dt>Day total{units > 0 && <span> · {plural(units, 'tiramisu', 'tiramisu')}</span>}</dt>
          <dd>{inr(cash.net + online.net)}</dd>
        </div>
      </dl>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={save} disabled={busy}>
        {busy ? <Spinner label="Saving" /> : entry.exists ? 'Save changes' : 'Save day'}
      </button>
      {!error && problem && units > 0 && <p className="form-hint">{problem}</p>}

      {entry.exists &&
        (confirming ? (
          <button type="button" className="btn btn-danger btn-block" onClick={remove} disabled={busy}>
            Yes, remove this day total
          </button>
        ) : (
          <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirming(true)}>
            Remove day total
          </button>
        ))}
    </div>
  );
}
