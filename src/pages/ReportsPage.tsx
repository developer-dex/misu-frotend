import { useState } from 'react';
import { api } from '../api';
import { BarList, DailyBars, RunningTotals } from '../components/charts';
import { Empty, LoadError, Panel, Spinner } from '../components/ui';
import { addDays, dayMonth, duration, inr, monthRange, num, plural, shiftMonth, shortDay, todayLocal } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { Report } from '../types';

type Preset = 'today' | 'week' | 'month' | 'last-month' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  const today = todayLocal();
  const month = today.slice(0, 7);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: monthRange(month).from, to: today };
    case 'last-month':
      return monthRange(shiftMonth(month, -1));
    case 'custom':
      return custom;
  }
}

/** Short rupees for chart axes: ₹1.2k */
function axisInr(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₹${n}`;
}

export function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState({ from: addDays(todayLocal(), -29), to: todayLocal() });
  const range = rangeFor(preset, custom);
  const report = useLoad(() => api.report(range.from, range.to), [range.from, range.to]);
  const r = report.data;

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Reports</h1>
          <p className="subtitle">{range.from === range.to ? shortDay(range.from) : `${shortDay(range.from)} – ${shortDay(range.to)}`}</p>
        </div>
      </div>

      <div className="range-bar">
        <div className="segmented" role="tablist" aria-label="Date range">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={preset === p.id} className={preset === p.id ? 'is-on' : ''} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="custom-range">
            <input
              type="date"
              className="input"
              aria-label="From"
              value={custom.from}
              max={custom.to}
              onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
            />
            <span aria-hidden="true">to</span>
            <input
              type="date"
              className="input"
              aria-label="To"
              value={custom.to}
              min={custom.from}
              max={todayLocal()}
              onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}
      </div>

      {report.error && !r ? (
        <LoadError message={report.error} onRetry={report.reload} />
      ) : !r ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : (
        <ReportBody r={r} loading={report.loading} />
      )}
    </div>
  );
}

function ReportBody({ r, loading }: { r: Report; loading: boolean }) {
  const t = r.totals;
  const activeDays = r.days.filter((d) => d.orderCount > 0 || d.spend > 0 || d.workedMs > 0);
  const multiDay = r.days.length > 1;
  const cashShare = t.net > 0 ? Math.round((t.cash / t.net) * 100) : 0;

  let finding = 'No sales or purchases in these dates yet.';
  if (t.orderCount > 0 || t.spend > 0) {
    finding = `${plural(t.units, 'tiramisu', 'tiramisu')} sold`;
    if (t.stallDays > 1) finding += ` over ${t.stallDays} stall days`;
    if (t.workedMs > 0) finding += ` in ${duration(t.workedMs)} at the stall`;
    finding += '.';
  }

  return (
    <div className={`report ${loading ? 'is-loading' : ''}`}>
      <p className="finding">{finding}</p>

      <dl className="kpi-strip">
        <div className="kpi-lead">
          <dt>Takings</dt>
          <dd>{inr(t.net)}</dd>
        </div>
        <div>
          <dt>{t.usageLogged ? 'Ingredients used' : 'Spent on purchases'}</dt>
          <dd>{inr(t.usageLogged ? t.usedCost : t.spend)}</dd>
          {t.costPerTiramisu !== null && <dd className="kpi-sub">{inr(Math.round(t.costPerTiramisu * 100) / 100)} per tiramisu made</dd>}
        </div>
        <div>
          <dt>{t.usageLogged ? 'Profit after ingredients' : 'Profit after purchases'}</dt>
          <dd className={t.profit < 0 ? 'is-bad' : t.profit > 0 ? 'is-good' : ''}>{t.profit < 0 ? `−${inr(-t.profit)}` : inr(t.profit)}</dd>
        </div>
        <div>
          <dt>Sold per hour</dt>
          <dd>{t.unitsPerHour === null ? <span className="dash">–</span> : t.unitsPerHour.toFixed(1)}</dd>
        </div>
      </dl>

      <div className="report-grid">
        {multiDay && (
          <Panel title="Takings by day" id="by-day" className="span-3">
            <DailyBars
              label="Takings per day"
              format={inr}
              axisFormat={axisInr}
              days={r.days.map((d) => ({
                day: d.day,
                value: d.net,
                tick: r.days.length > 10 ? dayMonth(d.day).split(' ')[0] : shortDay(d.day).split(',')[0],
                detail: `${shortDay(d.day)} · ${plural(d.units, 'tiramisu', 'tiramisu')}${d.workedMs ? ` · ${duration(d.workedMs)}` : ''}`,
              }))}
            />
          </Panel>
        )}

        <BuySellPanel r={r} />

        <Panel title="Flavours" id="flavours">
          {t.units === 0 ? (
            <Empty>Nothing sold in these dates.</Empty>
          ) : (
            <BarList rows={r.products.map((p) => ({ label: p.name, value: p.units, sub: inr(p.gross) }))} format={(n) => `${num(n)} sold`} />
          )}
        </Panel>

        <Panel title="Cash and online" id="payments">
          {t.net === 0 ? (
            <Empty>No payments in these dates.</Empty>
          ) : (
            <>
              <div className="split-bar" role="img" aria-label={`${cashShare}% cash, ${100 - cashShare}% online`}>
                <span className="split-cash" style={{ width: `${cashShare}%` }} />
                <span className="split-online" style={{ width: `${100 - cashShare}%` }} />
              </div>
              <dl className="split-legend">
                <div>
                  <dt>
                    <i className="swatch swatch-cash" aria-hidden="true" />
                    Cash · {cashShare}%
                  </dt>
                  <dd>{inr(t.cash)}</dd>
                </div>
                <div>
                  <dt>
                    <i className="swatch swatch-online" aria-hidden="true" />
                    Online · {100 - cashShare}%
                  </dt>
                  <dd>{inr(t.online)}</dd>
                </div>
                <div>
                  <dt>Discounts given</dt>
                  <dd>{t.discount > 0 ? `−${inr(t.discount)}` : inr(0)}</dd>
                </div>
              </dl>
            </>
          )}
        </Panel>

        <Panel title="Purchases by item" id="spend" className="tablet-wide" aside={t.spend > 0 ? <span className="meta">{inr(t.spend)} in all</span> : null}>
          {r.spendByItem.length === 0 ? (
            <Empty>No purchases in these dates.</Empty>
          ) : (
            <BarList rows={r.spendByItem.map((s) => ({ label: s.item, value: s.amount }))} format={inr} />
          )}
        </Panel>

        <Panel title="Day by day" id="days" className="span-3">
          {activeDays.length === 0 ? (
            <Empty>No stall days in these dates.</Empty>
          ) : (
            <DayTable r={r} days={[...activeDays].reverse()} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function signedInr(n: number): string {
  return n < 0 ? `−${inr(-n)}` : inr(n);
}

/** What was spent on purchases set against what was sold, in the same dates. */
function BuySellPanel({ r }: { r: Report }) {
  const t = r.totals;
  const gap = t.net - t.spend;
  const multiDay = r.days.length > 1;

  let finding = 'No sales or purchases in these dates.';
  if (t.spend === 0 && t.net > 0) finding = `No purchases in these dates, so all ${inr(t.net)} of takings is ahead of spending.`;
  else if (t.net === 0 && t.spend > 0) finding = `${inr(t.spend)} spent on purchases and nothing sold yet in these dates.`;
  else if (gap >= 0 && t.spend > 0) finding = `For every ₹100 spent on purchases, you took ₹${num(Math.round((t.net / t.spend) * 100))} in sales.`;
  else if (gap < 0) finding = `You spent ${inr(-gap)} more on purchases than you sold. Often a stock-up that later days sell through.`;

  // Running totals, so a stock-up on one day can be set against the sales of the days after it
  const sold: number[] = [];
  const bought: number[] = [];
  r.days.forEach((d, i) => {
    sold.push((sold[i - 1] ?? 0) + d.net);
    bought.push((bought[i - 1] ?? 0) + d.spend);
  });

  return (
    <Panel title="Purchases vs sales" id="buy-sell" className="span-3">
      <p className="compare-finding">{finding}</p>

      <dl className="kpi-strip is-flat">
        <div>
          <dt>Sold</dt>
          <dd>{inr(t.net)}</dd>
          <dd className="kpi-sub">{plural(t.units, 'tiramisu', 'tiramisu')}</dd>
        </div>
        <div>
          <dt>Spent on purchases</dt>
          <dd>{inr(t.spend)}</dd>
          <dd className="kpi-sub">{t.net > 0 && t.spend > 0 ? `${Math.round((t.spend / t.net) * 100)}% of takings` : '–'}</dd>
        </div>
        <div>
          <dt>Sold minus spent</dt>
          <dd className={gap < 0 ? 'is-bad' : gap > 0 ? 'is-good' : ''}>{signedInr(gap)}</dd>
          <dd className="kpi-sub">{gap < 0 ? 'Spent more than sold' : gap > 0 ? 'Sold more than spent' : 'Even'}</dd>
        </div>
        <div>
          <dt>Spent per tiramisu sold</dt>
          <dd>{t.units > 0 && t.spend > 0 ? inr(Math.round((t.spend / t.units) * 100) / 100) : <span className="dash">–</span>}</dd>
          <dd className="kpi-sub">{t.units > 0 ? `Sold at ${inr(Math.round((t.net / t.units) * 100) / 100)} each` : '–'}</dd>
        </div>
      </dl>

      {multiDay && (t.net > 0 || t.spend > 0) && (
        <RunningTotals
          label="Running totals of sales and purchases by day"
          format={inr}
          axisFormat={axisInr}
          days={r.days.map((d) => ({
            day: d.day,
            tick: r.days.length > 10 ? dayMonth(d.day).split(' ')[0] : shortDay(d.day).split(',')[0],
            detail: shortDay(d.day),
          }))}
          series={[
            { id: 'sold', label: 'Sold so far', className: 'series-sold', values: sold },
            { id: 'bought', label: 'Spent so far', className: 'series-bought', values: bought },
          ]}
          describe={(i) => {
            const diff = sold[i] - bought[i];
            return diff >= 0 ? `${inr(diff)} ahead` : `${inr(-diff)} behind`;
          }}
        />
      )}

      {r.spendByItem.length > 0 && t.units > 0 && (
        <div className="compare-items">
          <h3 className="sheet-subhead">Each purchase item against what you sold</h3>
          <BarList
            rows={r.spendByItem.map((s) => ({
              label: s.item,
              value: s.amount,
              sub: `${inr(Math.round((s.amount / t.units) * 100) / 100)} per tiramisu${t.net > 0 ? ` · ${Math.round((s.amount / t.net) * 100)}% of takings` : ''}`,
            }))}
            format={inr}
          />
        </div>
      )}
    </Panel>
  );
}

function DayTable({ r, days }: { r: Report; days: Report['days'] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" className="num">
              Stall time
            </th>
            {r.products.map((p) => (
              <th key={p.productId} scope="col" className="num">
                {p.name}
              </th>
            ))}
            <th scope="col" className="num">
              Per hour
            </th>
            <th scope="col" className="num">
              Cash
            </th>
            <th scope="col" className="num">
              Online
            </th>
            <th scope="col" className="num">
              Discount
            </th>
            <th scope="col" className="num">
              Takings
            </th>
            <th scope="col" className="num">
              Spent
            </th>
            <th scope="col" className="num">
              Used
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const rate = d.workedMs >= 5 * 60_000 ? d.units / (d.workedMs / 3_600_000) : null;
            return (
              <tr key={d.day}>
                <th scope="row">{shortDay(d.day)}</th>
                <td className="num">{d.workedMs ? duration(d.workedMs) : <span className="dash">–</span>}</td>
                {r.products.map((p) => (
                  <td key={p.productId} className="num">
                    {num(d.unitsByProduct[p.productId] ?? 0)}
                  </td>
                ))}
                <td className="num">{rate === null ? <span className="dash">–</span> : rate.toFixed(1)}</td>
                <td className="num">{inr(d.cash)}</td>
                <td className="num">{inr(d.online)}</td>
                <td className="num">{d.discount ? `−${inr(d.discount)}` : inr(0)}</td>
                <td className="num strong">{inr(d.net)}</td>
                <td className="num">{inr(d.spend)}</td>
                <td className="num">{d.usedCost ? inr(d.usedCost) : <span className="dash">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phone: each day as a two-line row */}
      <ul className="day-rows">
        {days.map((d) => (
          <li key={d.day}>
            <div className="day-row-main">
              <strong>{shortDay(d.day)}</strong>
              <span className="num strong">{inr(d.net)}</span>
            </div>
            <div className="day-row-sub">
              <span>
                {r.products.map((p) => `${num(d.unitsByProduct[p.productId] ?? 0)} ${p.name}`).join(' · ')}
                {d.workedMs ? ` · ${duration(d.workedMs)}` : ''}
              </span>
              <span className="num">
                Cash {inr(d.cash)} · Online {inr(d.online)}
                {d.spend ? ` · Spent ${inr(d.spend)}` : ''}
                {d.usedCost ? ` · Used ${inr(d.usedCost)}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
