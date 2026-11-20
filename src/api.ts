import type { AllTime, DayEntry, DayEntryInput, DayView, Ingredient, Order, Payment, Product, Purchase, Report, SessionLog, StallSession, StockItem, UsageEntry } from './types';
import { clearLoadCache } from './lib/useLoad';

const TOKEN_KEY = 'misu.token';

// Where the backend lives. On the live site the app calls Render directly:
// going through Vercel's /api rewrite adds a hop that now and then stalls for
// 30 seconds or more, which showed up as "No connection" after a few orders.
// The rewrite stays as a second route, used when the direct one fails.
// VITE_API_URL can still point elsewhere (a test server, for example).
const DIRECT = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? 'https://misu-backend.onrender.com' : '')).replace(/\/+$/, '');
const ROUTES = import.meta.env.PROD && DIRECT ? [DIRECT, ''] : [DIRECT];

// How long one try may take before it is given up and tried again
const TRY_MS = 15_000;
// A request that cannot safely be sent twice gets one long try instead,
// long enough for a server that was asleep to wake up (about a minute)
const SINGLE_TRY_MS = 60_000;
const TRIES = 4;
// Reading, and writes that land the same however often they are sent
const REPEATABLE = new Set(['GET', 'PUT', 'PATCH']);

// Saves still on their way, so a refresh or closing the tab does not lose one
let pendingWrites = 0;
export function hasPendingWrites(): boolean {
  return pendingWrites > 0;
}
window.addEventListener('beforeunload', (e) => {
  if (pendingWrites > 0) e.preventDefault();
});

/** A random id for a new order, so a retried save is recognised by the server. */
export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  // Another login must not see the last one's remembered screens
  clearLoadCache();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the user logs in again next time
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fired when the server rejects the stored token, so the app can show the login screen. */
export const UNAUTHORIZED_EVENT = 'misu:unauthorized';

type RequestOptions = {
  /** Send again after a dropped connection; only for requests the server can tell apart if they arrive twice */
  retry?: boolean;
  /** Called before each new try, so the screen can say it is still working */
  onRetry?: (attempt: number) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const repeatable = options.retry ?? REPEATABLE.has(method);
  const tries = repeatable ? TRIES : 1;
  const write = method !== 'GET';
  if (write) pendingWrites++;
  try {
    let timedOut = false;
    for (let attempt = 0; attempt < tries; attempt++) {
      if (attempt > 0) {
        options.onRetry?.(attempt);
        // 0.5 s, 1.5 s, 3 s: a short wobble clears fast, a waking server gets time
        await sleep([500, 1500, 3000][attempt - 1] ?? 3000);
      }
      const base = ROUTES[attempt % ROUTES.length];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), repeatable ? TRY_MS : SINGLE_TRY_MS);
      let res: Response;
      try {
        res = await fetch(`${base}/api${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          cache: 'no-store',
        });
      } catch {
        timedOut = controller.signal.aborted;
        continue;
      } finally {
        clearTimeout(timer);
      }

      // The host answered for a server that is waking up or restarting: worth another go
      if (repeatable && attempt < tries - 1 && (res.status === 502 || res.status === 503 || res.status === 504)) continue;

      if (res.status === 204) return undefined as T;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      return data as T;
    }
    throw new ApiError(
      0,
      timedOut ? 'The server is taking too long to answer. Check your internet and try again.' : 'No connection. Check your internet and try again.',
    );
  } finally {
    if (write) pendingWrites--;
  }
}

const qs = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { username: string } }>('POST', '/auth/login', { username, password }),
  me: () => request<{ user: { username: string } }>('GET', '/auth/me'),

  products: () => request<Product[]>('GET', '/products'),
  addProduct: (body: { name: string; price: number }) => request<Product>('POST', '/products', body),
  updateProduct: (id: string, body: Partial<Pick<Product, 'name' | 'price' | 'active'>>) =>
    request<Product>('PATCH', `/products/${id}`, body),

  ingredients: () => request<Ingredient[]>('GET', '/ingredients'),
  addIngredient: (body: { name: string; unit: string }) => request<Ingredient>('POST', '/ingredients', body),
  updateIngredient: (id: string, body: Partial<{ name: string; unit: string }>) =>
    request<Ingredient>('PATCH', `/ingredients/${id}`, body),
  deleteIngredient: (id: string) => request<void>('DELETE', `/ingredients/${id}`),

  currentDay: (date: string) => request<DayView>('GET', `/days/current${qs({ date })}`),
  day: (day: string) => request<DayView>('GET', `/days/${day}`),
  startSession: (day: string) => request<DayView>('POST', `/days/${day}/session/start`),
  stopSession: (day: string) => request<DayView>('POST', `/days/${day}/session/stop`),
  setDayOff: (day: string, off: boolean) => request<DayView>('PUT', `/days/${day}/off`, { off }),
  setPrepared: (day: string, items: { productId: string; qty: number }[]) =>
    request<DayView>('PUT', `/days/${day}/prepared`, { items }),
  dayEntry: (day: string) => request<DayEntry>('GET', `/days/${day}/entry`),
  saveDayEntry: (day: string, body: DayEntryInput) => request<DayEntry>('PUT', `/days/${day}/entry`, body),
  clearDayEntry: (day: string) => request<DayEntry>('DELETE', `/days/${day}/entry`),

  addOrder: (body: {
    day: string;
    items: { productId: string; qty: number }[];
    discount: number;
    payment: Payment | 'hold';
    customer?: { name: string; phone: string };
    /** From newClientId(): lets a save be retried without recording the sale twice */
    clientId: string;
  }, onRetry?: (attempt: number) => void) =>
    request<{ orderId: string; day: DayView }>('POST', '/orders', body, { retry: true, onRetry }),
  setOrderPayment: (id: string, payment: Payment) => request<{ day: DayView }>('PATCH', `/orders/${id}`, { payment }),
  deleteOrder: (id: string) => request<{ day: DayView }>('DELETE', `/orders/${id}`),

  purchases: (from: string, to: string) => request<Purchase[]>('GET', `/purchases${qs({ from, to })}`),
  addPurchase: (body: Omit<Purchase, 'id' | 'createdAt'>) => request<Purchase>('POST', '/purchases', body),
  updatePurchase: (id: string, body: Partial<Omit<Purchase, 'id' | 'createdAt'>>) =>
    request<Purchase>('PATCH', `/purchases/${id}`, body),
  deletePurchase: (id: string) => request<void>('DELETE', `/purchases/${id}`),

  sessions: (from: string, to: string) => request<SessionLog>('GET', `/sessions${qs({ from, to })}`),
  session: (id: string) => request<{ session: StallSession; orders: Order[] }>('GET', `/sessions/${id}`),
  deleteSession: (id: string) => request<void>('DELETE', `/sessions/${id}`),

  usage: (from: string, to: string) =>
    request<{ entries: UsageEntry[]; madeByDay: Record<string, number> }>('GET', `/usage${qs({ from, to })}`),
  addUsage: (body: { date: string; ingredientId: string; quantity: number; cost?: number; note?: string }) =>
    request<UsageEntry>('POST', '/usage', body),
  updateUsage: (id: string, body: { quantity?: number; cost?: number; note?: string; date?: string }) =>
    request<UsageEntry>('PATCH', `/usage/${id}`, body),
  deleteUsage: (id: string) => request<void>('DELETE', `/usage/${id}`),
  stock: () => request<StockItem[]>('GET', '/stock'),

  report: (from: string, to: string) => request<Report>('GET', `/reports${qs({ from, to })}`),
  allTime: () => request<AllTime>('GET', '/reports/all-time'),
};
