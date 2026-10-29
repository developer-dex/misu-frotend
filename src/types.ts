export type Payment = 'cash' | 'online';

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
}

export interface Shift {
  start: string;
  end: string | null;
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
  shifts: Shift[];
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
  workedMs: number;
}

export interface Report {
  from: string;
  to: string;
  totals: Takings & {
    spend: number;
    profit: number;
    workedMs: number;
    stallDays: number;
    unitsPerHour: number | null;
  };
  products: { productId: string; name: string; units: number; gross: number }[];
  spendByItem: { item: string; amount: number }[];
  days: ReportDay[];
}
