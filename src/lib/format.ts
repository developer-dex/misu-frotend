const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const rupeesPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ₹1,234 — paise only when the amount has them. */
export function inr(amount: number): string {
  return Number.isInteger(Math.round(amount * 100) / 100) ? rupees.format(amount) : rupeesPaise.format(amount);
}

export function num(n: number): string {
  return plain.format(n);
}

/** Today on this device, as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, delta: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return todayLocal(d);
}

/** "Thursday, 29 October" */
export function longDay(day: string): string {
  return parseDay(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "Thu, 29 Oct" */
export function shortDay(day: string): string {
  return parseDay(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "29 Oct" */
export function dayMonth(day: string): string {
  return parseDay(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function monthName(month: string): string {
  return parseDay(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** "9:14 pm" */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

/** Running clock: "1:04:09" */
export function stopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Written duration: "2 h 05 m", "45 m" */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes === 0) return 'under 1 m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${String(m).padStart(2, '0')} m`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** First and last day of the month that holds `day`. */
export function monthRange(month: string): { from: string; to: string } {
  const first = parseDay(`${month}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: todayLocal(first), to: todayLocal(last) };
}

export function shiftMonth(month: string, delta: number): string {
  const d = parseDay(`${month}-01`);
  d.setMonth(d.getMonth() + delta);
  return todayLocal(d).slice(0, 7);
}
