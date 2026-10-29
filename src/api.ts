import type { DayView, Ingredient, Payment, Product, Purchase, Report } from './types';

const TOKEN_KEY = 'misu.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const qs = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

export const api = {
  authStatus: () => request<{ authRequired: boolean }>('GET', '/auth/status'),
  login: (passcode: string) => request<{ token: string | null }>('POST', '/auth/login', { passcode }),
  me: () => request<{ ok: true }>('GET', '/auth/me'),

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
  startShift: (day: string) => request<DayView>('POST', `/days/${day}/shift/start`),
  stopShift: (day: string) => request<DayView>('POST', `/days/${day}/shift/stop`),
  setPrepared: (day: string, items: { productId: string; qty: number }[]) =>
    request<DayView>('PUT', `/days/${day}/prepared`, { items }),

  addOrder: (body: { day: string; items: { productId: string; qty: number }[]; discount: number; payment: Payment }) =>
    request<{ orderId: string; day: DayView }>('POST', '/orders', body),
  setOrderPayment: (id: string, payment: Payment) => request<{ day: DayView }>('PATCH', `/orders/${id}`, { payment }),
  deleteOrder: (id: string) => request<{ day: DayView }>('DELETE', `/orders/${id}`),

  purchases: (from: string, to: string) => request<Purchase[]>('GET', `/purchases${qs({ from, to })}`),
  addPurchase: (body: Omit<Purchase, 'id' | 'createdAt'>) => request<Purchase>('POST', '/purchases', body),
  updatePurchase: (id: string, body: Partial<Omit<Purchase, 'id' | 'createdAt'>>) =>
    request<Purchase>('PATCH', `/purchases/${id}`, body),
  deletePurchase: (id: string) => request<void>('DELETE', `/purchases/${id}`),

  report: (from: string, to: string) => request<Report>('GET', `/reports${qs({ from, to })}`),
};
