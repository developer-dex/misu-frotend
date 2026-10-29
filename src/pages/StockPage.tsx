import { api } from '../api';
import { IngredientsTabs } from '../components/IngredientsTabs';
import { Empty, LoadError, Panel, Spinner } from '../components/ui';
import { inr, plural, qtyUnit, shortDay, unitRate } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { StockItem } from '../types';

function leftLabel(s: StockItem) {
  if (s.boughtQty === 0 && s.usedQty === 0) return { text: 'Nothing recorded', tone: 'is-out' };
  if (s.boughtQty === 0) return { text: 'Not bought yet', tone: 'is-out' };
  if (s.leftQty < 0) return { text: `${qtyUnit(-s.leftQty, s.unit)} over`, tone: 'is-bad' };
  if (s.leftQty === 0) return { text: 'Used up', tone: 'is-out' };
  return { text: `${qtyUnit(s.leftQty, s.unit)} left`, tone: '' };
}

export function StockPage() {
  const stock = useLoad(() => api.stock(), []);
  const items = stock.data ?? [];
  const value = items.reduce((sum, s) => sum + s.leftValue, 0);

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Stock</h1>
          <p className="subtitle">Bought minus used, valued at what you paid</p>
        </div>
      </div>

      <IngredientsTabs />

      <Panel title="Ingredients on hand" id="stock" aside={stock.data ? <span className="meta">Worth {inr(value)}</span> : null}>
        {stock.error && !stock.data ? (
          <LoadError message={stock.error} onRetry={stock.reload} />
        ) : !stock.data ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>Your purchase list is empty. Add items in Settings.</Empty>
        ) : (
          <ul className="stock-list">
            {items.map((s) => {
              const left = leftLabel(s);
              const usedPart = s.boughtQty > 0 ? Math.min(100, (s.usedQty / s.boughtQty) * 100) : 0;
              return (
                <li key={s.ingredientId}>
                  <div className="stock-head">
                    <strong>{s.name}</strong>
                    <span className={`stock-left ${left.tone}`}>{left.text}</span>
                  </div>
                  {s.boughtQty > 0 && (
                    <div className="bar stock-bar" role="img" aria-label={`${Math.round(100 - usedPart)}% left`}>
                      <span style={{ width: `${100 - usedPart}%` }} />
                    </div>
                  )}
                  {(s.boughtQty > 0 || s.usedQty > 0) && (
                    <div className="stock-meta">
                      <span>
                        Bought {qtyUnit(s.boughtQty, s.unit)} · used {qtyUnit(s.usedQty, s.unit)}
                        {s.unitCost !== null && ` · ${unitRate(s.unitCost, s.unit)}`}
                        {s.lastUsed && ` · last used ${shortDay(s.lastUsed)}`}
                      </span>
                      {s.leftValue > 0 && <span className="num">{inr(s.leftValue)}</span>}
                    </div>
                  )}
                  {s.unpricedPurchases > 0 && (
                    <p className="stock-warn">
                      {plural(s.unpricedPurchases, 'purchase')} of {s.name} {s.unpricedPurchases === 1 ? 'has' : 'have'} no quantity in {s.unit}, so{' '}
                      {s.unpricedPurchases === 1 ? "it isn't" : "they aren't"} counted here.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
