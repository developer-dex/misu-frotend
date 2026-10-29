import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Empty, LoadError, MoneyInput, Panel, Spinner, toAmount } from '../components/ui';
import { inr } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { Ingredient, Product } from '../types';

export function SettingsPage({ onLogout }: { onLogout?: () => void }) {
  return (
    <div className="page">
      <div className="title-row">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Flavours, prices and the purchase list</p>
        </div>
      </div>
      <div className="settings-grid">
        <FlavoursPanel />
        <ItemsPanel />
        {onLogout && (
          <Panel title="This device" id="device">
            <p className="meta">You stay logged in on this phone for 30 days.</p>
            <button type="button" className="btn btn-quiet" onClick={onLogout}>
              Log out
            </button>
          </Panel>
        )}
      </div>
    </div>
  );
}

function FlavoursPanel() {
  const products = useLoad(() => api.products(), []);
  const toast = useToast();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || toAmount(price) <= 0) return toast('Enter a name and a price', { tone: 'error' });
    try {
      const p = await api.addProduct({ name: name.trim(), price: toAmount(price) });
      setName('');
      setPrice('');
      toast(`Added ${p.name}`);
      void products.reload();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  return (
    <Panel title="Flavours and prices" id="flavours">
      {products.error && <LoadError message={products.error} onRetry={products.reload} />}
      {!products.data && !products.error && <Spinner />}
      {products.data && (
        <ul className="settings-list">
          {products.data.map((p) => (
            <FlavourRow key={p.id} product={p} onChange={products.reload} />
          ))}
        </ul>
      )}
      <p className="meta settings-note">A new price applies to orders from now on. Past orders keep the price they were sold at.</p>
      <form className="inline-form" onSubmit={add}>
        <input className="input" placeholder="New flavour, e.g. Nutella" value={name} onChange={(e) => setName(e.target.value)} aria-label="New flavour name" maxLength={60} />
        <MoneyInput id="new-flavour-price" value={price} onChange={setPrice} placeholder="Price" />
        <button type="submit" className="btn btn-quiet">
          Add
        </button>
      </form>
    </Panel>
  );
}

function FlavourRow({ product, onChange }: { product: Product; onChange: () => void }) {
  const toast = useToast();
  const [price, setPrice] = useState(String(product.price));
  useEffect(() => setPrice(String(product.price)), [product.price]);
  const dirty = toAmount(price) !== product.price;

  const save = async (body: Partial<Pick<Product, 'price' | 'active'>>, message: string) => {
    try {
      await api.updateProduct(product.id, body);
      toast(message);
      onChange();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  return (
    <li className={product.active ? '' : 'is-off'}>
      <div className="settings-name">
        <strong>{product.name}</strong>
        <span className="meta">{product.active ? `On sale at ${inr(product.price)}` : 'Not on sale'}</span>
      </div>
      <form
        className="settings-controls"
        onSubmit={(e) => {
          e.preventDefault();
          if (toAmount(price) > 0) void save({ price: toAmount(price) }, `${product.name} is now ${inr(toAmount(price))}`);
        }}
      >
        <MoneyInput id={`price-${product.id}`} value={price} onChange={setPrice} />
        {dirty ? (
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => save({ active: !product.active }, product.active ? `${product.name} hidden from the order screen` : `${product.name} back on sale`)}
          >
            {product.active ? 'Hide' : 'Show'}
          </button>
        )}
      </form>
    </li>
  );
}

function ItemsPanel() {
  const items = useLoad(() => api.ingredients(), []);
  const toast = useToast();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) return toast('Enter a name and a unit', { tone: 'error' });
    try {
      await api.addIngredient({ name: name.trim(), unit: unit.trim() });
      setName('');
      setUnit('');
      void items.reload();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  const remove = async (item: Ingredient) => {
    try {
      await api.deleteIngredient(item.id);
      toast(`Removed ${item.name}. Past purchases are kept.`);
      void items.reload();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  return (
    <Panel title="Purchase list" id="items">
      {items.error && <LoadError message={items.error} onRetry={items.reload} />}
      {!items.data && !items.error && <Spinner />}
      {items.data && items.data.length === 0 && <Empty>No items yet. Add what you usually buy.</Empty>}
      {items.data && items.data.length > 0 && (
        <ul className="settings-list">
          {items.data.map((i) => (
            <li key={i.id}>
              <div className="settings-name">
                <strong>{i.name}</strong>
                <span className="meta">Counted in {i.unit}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => remove(i)} aria-label={`Remove ${i.name}`}>
                <Trash2 size={18} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={add}>
        <input className="input" placeholder="Item, e.g. Cocoa powder" value={name} onChange={(e) => setName(e.target.value)} aria-label="New item name" maxLength={60} />
        <input className="input input-unit" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" maxLength={20} />
        <button type="submit" className="btn btn-quiet">
          Add
        </button>
      </form>
    </Panel>
  );
}
