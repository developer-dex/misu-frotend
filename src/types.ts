export type Payment = 'cash' | 'online';

/** 'live' = rung up on the Sell screen; 'summary' = a day's totals typed in on Past days. */
export type EntrySource = 'live' | 'summary';

export interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface Order {
  id: string;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment: Payment;
  note: string;
  sessionId: string | null;
  source: EntrySource;
}

/** One run of the stall clock and what was sold during it. */
export interface StallSession {
  id: string;
  number: number;
  day: string;
  start: string;
  end: string | null;
  running: boolean;
  durationMs: number;
  startedBy: string | null;
  stoppedBy: string | null;
  source: EntrySource;
  orderCount: number;
  units: number;
  unitsByProduct: Record<string, number>;
  gross: number;
  discount: number;
  net: number;
  cash: number;
  online: number;
  unitsPerHour: number | null;
}

export interface SessionLog {
  from: string;
  to: string;
  products: { productId: string; name: string }[];
  totals: {
    sessionCount: number;
    durationMs: number;
    orderCount: number;
    units: number;
    net: number;
    cash: number;
    online: number;
    unitsPerHour: number | null;
  };
  sessions: StallSession[];
  outside: { day: string; orderCount: number; units: number; net: number }[];
}

export interface Takings {
  orderCount: number;
  units: number;
  gross: number;
  discount: number;
  net: number;
  cash: number;
  online: number;
}

export interface DayView {
  day: string;
  serverTime: string;
  sessions: StallSession[];
  currentSession: StallSession | null;
  running: boolean;
  workedMs: number;
  byProduct: { productId: string; name: string; sold: number; prepared: number | null }[];
  summary: Takings;
  orders: Order[];
}

export interface Purchase {
  id: string;
  date: string;
  item: string;
  quantity: number | null;
  unit: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface ReportDay extends Takings {
  day: string;
  unitsByProduct: Record<string, number>;
  prepared: number | null;
  spend: number;
  usedCost: number;
  sessionCount: number;
  workedMs: number;
  entered: boolean;
}

export interface Report {
  from: string;
  to: string;
  totals: Takings & {
    spend: number;
    usedCost: number;
    usageLogged: boolean;
    costPerTiramisu: number | null;
    profit: number;
    workedMs: number;
    stallDays: number;
    unitsPerHour: number | null;
  };
  products: { productId: string; name: string; units: number; gross: number }[];
  spendByItem: { item: string; amount: number }[];
  days: ReportDay[];
}

export interface UsageEntry {
  id: string;
  date: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
  costSource: 'average' | 'manual';
  note: string;
  createdAt: string;
}

export interface StockItem {
  ingredientId: string;
  name: string;
  unit: string;
  boughtQty: number;
  boughtAmount: number;
  unpricedPurchases: number;
  unitCost: number | null;
  usedQty: number;
  usedCost: number;
  leftQty: number;
  leftValue: number;
  lastUsed: string | null;
}

export interface EntryLine {
  productId: string;
  qty: number;
}

/** A whole day's sales typed in afterwards, on Past days. */
export interface DayEntry {
  day: string;
  exists: boolean;
  opened: string | null;
  closed: string | null;
  cash: { items: EntryLine[]; discount: number };
  online: { items: EntryLine[]; discount: number };
  prepared: EntryLine[];
  products: { productId: string; name: string; price: number; active: boolean }[];
  live: { orderCount: number; units: number; net: number; sessionCount: number };
}

export interface DayEntryInput {
  opened: string | null;
  closed: string | null;
  cash: { items: EntryLine[]; discount: number };
  online: { items: EntryLine[]; discount: number };
  prepared: EntryLine[] | null;
}
