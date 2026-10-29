import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { BarList } from '../components/charts';
import { IngredientsTabs } from '../components/IngredientsTabs';
import { useToast } from '../components/Toast';
import { Empty, Field, LoadError, MoneyInput, Panel, Sheet, Spinner, toAmount } from '../components/ui';
import { inr, longDay, monthName, monthRange, num, shiftMonth, todayLocal } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { Ingredient, Purchase } from '../types';

export function PurchasesPage() {
  const thisMonth = todayLocal().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const range = monthRange(month);

  const ingredients = useLoad(() => api.ingredients(), []);
  const purchases = useLoad(() => api.purchases(range.from, range.to), [month]);

  const list = purchases.data ?? [];
  const total = list.reduce((s, p) => s + p.amount, 0);

  const byDate = useMemo(() => {
    const groups = new Map<string, Purchase[]>();
    for (const p of list) groups.set(p.date, [...(groups.get(p.date) ?? []), p]);
    return [...groups.entries()];
  }, [list]);

  const byItem = useMemo(() => {
    const sums = new Map<string, number>();
    for (const p of list) sums.set(p.item, (sums.get(p.item) ?? 0) + p.amount);
    return [...sums.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [list]);

  const onSaved = (p: Purchase) => {
    // A purchase dated in another month is not shown here; jump to it so it does not seem lost
    const m = p.date.slice(0, 7);
    if (m !== month) setMonth(m);
    else void purchases.reload();
  };

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Purchases</h1>
          <p className="subtitle">What you buy to make tiramisu</p>
        </div>
      </div>

      <IngredientsTabs />

      <div className="purchase-grid">
        <Panel title="Add purchase" id="add-purchase" className="purchase-form-panel">
          {ingredients.error ? (
            <LoadError message={ingredients.error} onRetry={ingredients.reload} />
          ) : (
            <PurchaseForm ingredients={ingredients.data ?? []} onSaved={onSaved} />
          )}
        </Panel>

        <div className="purchase-side">
          <Panel
            title={monthName(month)}
            id="month"
            aside={
              <div className="month-switch">
                <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                  disabled={month >= thisMonth}
                  aria-label="Next month"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            }
          >
            {purchases.error ? (
              <LoadError message={purchases.error} onRetry={purchases.reload} />
            ) : (
              <>
                <div className="figure-row">
                  <p className="figure">{purchases.loading && !purchases.data ? <Spinner /> : inr(total)}</p>
                  <p className="meta">spent on {list.length === 1 ? '1 purchase' : `${num(list.length)} purchases`}</p>
                </div>
                {byItem.length > 0 && <BarList rows={byItem} format={inr} />}
              </>
            )}
          </Panel>

          <Panel title="History" id="history">
            {purchases.data && list.length === 0 && <Empty>Nothing bought in {monthName(month)} yet.</Empty>}
            {byDate.map(([date, rows]) => (
              <div key={date} className="date-group">
                <div className="date-group-head">
                  <h3>{longDay(date)}</h3>
                  <span>{inr(rows.reduce((s, r) => s + r.amount, 0))}</span>
                </div>
                <ul className="purchase-list">
                  {rows.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="purchase-row" onClick={() => setEditing(p)}>
                        <span className="purchase-item">
                          <strong>{p.item}</strong>
                          {(p.quantity !== null || p.note) && (
                            <span className="meta">
                              {p.quantity !== null && `${num(p.quantity)} ${p.unit}`}
                              {p.quantity !== null && p.note && ' · '}
                              {p.note}
                            </span>
                          )}
                        </span>
                        <span className="purchase-amount">{inr(p.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit purchase">
        {editing && (
          <PurchaseForm
            ingredients={ingredients.data ?? []}
            existing={editing}
            onSaved={(p) => {
              setEditing(null);
              onSaved(p);
            }}
            onDeleted={() => {
              setEditing(null);
              void purchases.reload();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function PurchaseForm({
  ingredients,
  existing,
  onSaved,
  onDeleted,
}: {
  ingredients: Ingredient[];
  existing?: Purchase;
  onSaved: (p: Purchase) => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const idp = existing ? 'edit' : 'new';
  const [item, setItem] = useState(existing?.item ?? '');
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : '');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [date, setDate] = useState(existing?.date ?? todayLocal());
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  // An edited purchase whose item is no longer on the list still shows its name
  useEffect(() => {
    if (existing && !ingredients.some((i) => i.name === existing.item)) setCustom(true);
  }, [existing, ingredients]);

  const pick = (ing: Ingredient) => {
    setItem(ing.name);
    setCustom(false);
    if (!unit || ingredients.some((i) => i.unit === unit)) setUnit(ing.unit);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!item.trim()) return setError('Pick what you bought');
    if (toAmount(amount) <= 0) return setError('Enter the amount you paid');
    setSaving(true);
    const body = {
      date,
      item: item.trim(),
      amount: toAmount(amount),
      quantity: quantity.trim() === '' ? null : Number.parseFloat(quantity),
      unit: unit.trim(),
      note: note.trim(),
    };
    try {
      const saved = existing ? await api.updatePurchase(existing.id, body) : await api.addPurchase(body);
      toast(`${existing ? 'Updated' : 'Saved'} ${saved.item} · ${inr(saved.amount)}`);
      if (!existing) {
        setItem('');
        setAmount('');
        setQuantity('');
        setNote('');
        setCustom(false);
      }
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await api.deletePurchase(existing.id);
      toast('Purchase deleted');
      onDeleted?.();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="field">
        <legend>What did you buy?</legend>
        <div className="chips">
          {ingredients.map((ing) => (
            <button
              key={ing.id}
              type="button"
              className={`chip ${!custom && item === ing.name ? 'is-on' : ''}`}
              aria-pressed={!custom && item === ing.name}
              onClick={() => pick(ing)}
            >
              {ing.name}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${custom ? 'is-on' : ''}`}
            aria-pressed={custom}
            onClick={() => {
              setCustom(true);
              setItem('');
            }}
          >
            Something else
          </button>
        </div>
        {custom && (
          <input
            id={`${idp}-item`}
            className="input chips-other"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="e.g. Cocoa powder"
            aria-label="Item name"
            maxLength={60}
            autoFocus
          />
        )}
      </fieldset>

      <div className="field-row">
        <Field label="Amount paid" htmlFor={`${idp}-amount`}>
          <MoneyInput id={`${idp}-amount`} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Date" htmlFor={`${idp}-date`}>
          <input id={`${idp}-date`} className="input" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Quantity" htmlFor={`${idp}-qty`}>
          <input
            id={`${idp}-qty`}
            className="input"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Optional"
          />
        </Field>
        <Field label="Unit" htmlFor={`${idp}-unit`}>
          <input id={`${idp}-unit`} className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, ml, pcs" maxLength={20} />
        </Field>
      </div>

      <p className="field-hint">Add the quantity so Daily use can work out the cost of what you use.</p>

      <Field label="Note" htmlFor={`${idp}-note`}>
        <input id={`${idp}-note`} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shop, brand… (optional)" maxLength={200} />
      </Field>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
        {saving ? <Spinner label="Saving" /> : existing ? 'Save changes' : 'Save purchase'}
      </button>

      {existing &&
        (confirmDelete ? (
          <button type="button" className="btn btn-danger btn-block" onClick={remove} disabled={saving}>
            Yes, delete this purchase
          </button>
        ) : (
          <button type="button" className="btn btn-danger-quiet btn-block" onClick={() => setConfirmDelete(true)}>
            Delete purchase
          </button>
        ))}
    </form>
  );
}
