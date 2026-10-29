import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { api } from '../api';
import { IngredientsTabs } from '../components/IngredientsTabs';
import { useToast } from '../components/Toast';
import { Empty, Field, LoadError, MoneyInput, Panel, Sheet, Spinner, toAmount } from '../components/ui';
import { inr, longDay, plural, qtyUnit, shortDay, todayLocal, unitRate } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { StockItem, UsageEntry } from '../types';

function parseQty(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function UsagePage() {
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<UsageEntry | null>(null);
  const usage = useLoad(() => api.usage(date, date), [date]);
  const stock = useLoad(() => api.stock(), []);

  const entries = usage.data?.entries ?? [];
  const total = entries.reduce((sum, e) => sum + e.cost, 0);
  const made = usage.data?.madeByDay[date] ?? null;

  const refresh = () => {
    void usage.reload();
    void stock.reload();
  };

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Daily use</h1>
          <p className="subtitle">What you used to make tiramisu, and what it cost</p>
        </div>
        <label className={`day-picker ${date === today ? '' : 'is-past'}`}>
          <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{date === today ? 'Today' : shortDay(date)}</span>
          <input type="date" value={date} max={today} aria-label="Day the ingredients were used" onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>

      <IngredientsTabs />

      <div className="purchase-grid">
        <Panel title="Add what you used" id="add-usage">
          {stock.error ? (
            <LoadError message={stock.error} onRetry={stock.reload} />
          ) : !stock.data ? (
            <Spinner />
          ) : stock.data.length === 0 ? (
            <Empty>Your purchase list is empty. Add items in Settings.</Empty>
          ) : (
            <UsageForm date={date} items={stock.data} onSaved={refresh} />
          )}
        </Panel>

        <Panel title={`Used ${date === today ? 'today' : `on ${shortDay(date)}`}`} id="day-usage">
          {usage.error && !usage.data ? (
            <LoadError message={usage.error} onRetry={usage.reload} />
          ) : !usage.data ? (
            <Spinner />
          ) : (
            <>
              <div className="figure-row">
                <p className="figure">{inr(total)}</p>
                <p className="meta">ingredient cost{entries.length > 0 && ` for ${plural(entries.length, 'item')}`}</p>
              </div>
              {made ? (
                <p className="cost-per">
                  {plural(made, 'tiramisu', 'tiramisu')} made · <strong>{total > 0 ? `${inr(Math.round((total / made) * 100) / 100)} each` : '–'}</strong>
                </p>
              ) : (
                <p className="meta cost-per">
                  Set how many you made on the <Link to="/">Sell screen</Link> to see the cost of each tiramisu.
                </p>
              )}
              {entries.length === 0 ? (
                <Empty>Nothing added for {longDay(date)} yet.</Empty>
              ) : (
                <ul className="purchase-list">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="purchase-row" onClick={() => setEditing(e)}>
                        <span className="purchase-item">
                          <strong>{e.name}</strong>
                          <span className="meta">
                            {qtyUnit(e.quantity, e.unit)} at {unitRate(e.unitCost, e.unit)}
                            {e.costSource === 'manual' && ' · cost typed in'}
                            {e.note && ` · ${e.note}`}
                          </span>
                        </span>
                        <span className="purchase-amount">{inr(e.cost)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${editing.name} · ${shortDay(editing.date)}` : 'Edit'}>
        {editing && (
          <EditUsage
            entry={editing}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function UsageForm({ date, items, onSaved }: { date: string; items: StockItem[]; onSaved: () => void }) {
  const toast = useToast();
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [manual, setManual] = useState(false);
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const item = useMemo(() => items.find((i) => i.ingredientId === itemId) ?? null, [items, itemId]);
  const quantity = parseQty(qty);
  const needsCost = manual || item?.unitCost == null;
  const lineCost = needsCost ? toAmount(cost) : item && item.unitCost !== null ? Math.round(item.unitCost * quantity * 100) / 100 : 0;

  useEffect(() => {
    setManual(false);
    setCost('');
    setError('');
  }, [itemId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!item) return setError('Pick what you used');
    if (quantity <= 0) return setError(`Enter how much ${item.name} you used`);
    if (needsCost && toAmount(cost) <= 0) return setError('Enter what this amount cost');
    setSaving(true);
    try {
      const saved = await api.addUsage({
        date,
        ingredientId: item.ingredientId,
        quantity,
        cost: needsCost ? toAmount(cost) : undefined,
        note: note.trim() || undefined,
      });
      toast(`Added ${qtyUnit(saved.quantity, saved.unit)} ${saved.name} · ${inr(saved.cost)}`);
      setQty('');
      setCost('');
      setNote('');
      setManual(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="field">
        <legend>What did you use?</legend>
        <div className="chips">
          {items.map((i) => (
            <button
              key={i.ingredientId}
              type="button"
              className={`chip ${itemId === i.ingredientId ? 'is-on' : ''}`}
              aria-pressed={itemId === i.ingredientId}
              onClick={() => setItemId(i.ingredientId)}
            >
              {i.name}
            </button>
          ))}
        </div>
        {item && (
          <p className="field-hint">
            {item.boughtQty > 0 ? `${qtyUnit(Math.max(0, item.leftQty), item.unit)} left` : 'Not bought yet'}
            {item.unitCost !== null && ` · you paid ${unitRate(item.unitCost, item.unit)} on average`}
          </p>
        )}
      </fieldset>

      <Field label={item ? `How much? (${item.unit})` : 'How much?'} htmlFor="usage-qty">
        <div className="unit-input">
          <input
            id="usage-qty"
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={qty}
            placeholder="0"
            onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
            disabled={!item}
          />
          {item && <span aria-hidden="true">{item.unit}</span>}
        </div>
      </Field>

      {item && needsCost && (
        <Field
          label="What did this amount cost?"
          htmlFor="usage-cost"
          hint={item.unitCost === null ? `No ${item.name} purchase with a quantity in ${item.unit} yet, so type the cost.` : undefined}
        >
          <MoneyInput id="usage-cost" value={cost} onChange={setCost} />
        </Field>
      )}

      {item && !needsCost && item.unitCost !== null && (
        <div className="cost-preview" aria-live="polite">
          <span>
            {quantity > 0 ? qtyUnit(quantity, item.unit) : `0 ${item.unit}`} × {unitRate(item.unitCost, item.unit)}
          </span>
          <strong>{inr(lineCost)}</strong>
        </div>
      )}
      {item && item.unitCost !== null && (
        <button type="button" className="link-btn link-start" onClick={() => setManual(!manual)}>
          {manual ? 'Use my average purchase price' : 'Type the cost instead'}
        </button>
      )}

      <Field label="Note" htmlFor="usage-note">
        <input id="usage-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. 2nd batch" maxLength={200} />
      </Field>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? <Spinner label="Saving" /> : item && quantity > 0 && lineCost > 0 ? `Add · ${inr(lineCost)}` : 'Add'}
      </button>
    </form>
  );
}

function EditUsage({ entry, onDone }: { entry: UsageEntry; onDone: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState(String(entry.quantity));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quantity = parseQty(qty);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) return setError('Enter how much you used');
    setBusy(true);
    try {
      const saved = await api.updateUsage(entry.id, { quantity });
      toast(`Updated ${saved.name} · ${inr(saved.cost)}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteUsage(entry.id);
      toast(`Removed ${entry.name}`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={save} noValidate>
      <Field label={`How much? (${entry.unit})`} htmlFor="edit-usage-qty">
        <div className="unit-input">
          <input id="edit-usage-qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
          <span aria-hidden="true">{entry.unit}</span>
        </div>
      </Field>
      <div className="cost-preview">
        <span>
          {qtyUnit(quantity, entry.unit)} × {unitRate(entry.unitCost, entry.unit)}
        </span>
        <strong>{inr(Math.round(quantity * entry.unitCost * 100) / 100)}</strong>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        Save
      </button>
      {confirming ? (
        <button type="button" className="btn btn-danger btn-block" onClick={remove} disabled={busy}>
          Yes, remove it
        </button>
      ) : (
        <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirming(true)}>
          Remove
        </button>
      )}
    </form>
  );
}
