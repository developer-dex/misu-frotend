import type { Payment } from '../types';

/**
 * Reads a spoken order such as "1 classic and payment is cash" or
 * "2 biscoff 1 classic online discount 20" with fixed word rules, no AI.
 * Flavours are matched against the real flavour list, so a flavour added in
 * Settings can be ordered by voice straight away.
 */

export interface VoiceOrder {
  /** Quantity per product id */
  items: Record<string, number>;
  payment: Payment | null;
  discount: number;
  heard: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, won: 1, single: 1, ek: 1,
  two: 2, to: 2, too: 2, do: 2, doh: 2, couple: 2,
  three: 3, tree: 3, free: 3, teen: 3,
  four: 4, for: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6, chhah: 6,
  seven: 7, saat: 7, sat: 7,
  eight: 8, ate: 8, aath: 8, aat: 8,
  nine: 9, nau: 9,
  ten: 10, das: 10,
  eleven: 11, twelve: 12, dozen: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

// Words that sound like numbers but are ordinary words; they only count right before a flavour
const WEAK_NUMBERS = new Set(['a', 'an', 'to', 'too', 'do', 'for', 'free', 'tree', 'won', 'ate', 'sat', 'che', 'char', 'das']);

const CASH_WORDS = new Set(['cash', 'kash', 'cache', 'catch', 'nakad', 'nagad', 'rokda']);
const ONLINE_WORDS = new Set(['online', 'upi', 'gpay', 'googlepay', 'phonepe', 'phonepay', 'paytm', 'card', 'qr', 'scan', 'scanner', 'bhim', 'transfer']);
// Two spoken words that make one payment word
const ONLINE_PAIRS = new Set(['g pay', 'google pay', 'phone pe', 'phone pay', 'pay tm', 'q r', 'u p i', 'on line']);

// Ignored so they never block a number from reaching its flavour
const FILLER = new Set(['x', 'of', 'the', 'more', 'piece', 'pieces', 'pcs', 'cup', 'cups', 'box', 'boxes', 'nos', 'number']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/₹\s*(\d)/g, '$1')
    .replace(/(\d)\s*(x|×)\b/g, '$1 ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** Does a heard word sound like this flavour word? "biscuit", "biscof" and "biscoff" all match Biscoff. */
function soundsLike(word: string, target: string): boolean {
  if (word === target) return true;
  if (word.length < 4 || target.length < 4) return false;
  if (word.slice(0, 4) === target.slice(0, 4)) return true;
  return editDistance(word, target) <= (target.length >= 7 ? 2 : 1);
}

function numberAt(tokens: string[], i: number, weakAllowed: boolean): number | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d{1,4}$/.test(t)) return Number(t);
  if (t in NUMBER_WORDS && (weakAllowed || !WEAK_NUMBERS.has(t))) return NUMBER_WORDS[t];
  return null;
}

export function parseVoiceOrder(text: string, products: { id: string; name: string }[]): VoiceOrder {
  const tokens = tokenize(text);
  const flavours = products.map((p) => ({ id: p.id, words: tokenize(p.name).filter((w) => w !== 'tiramisu') }));
  const items: Record<string, number> = {};
  const used = new Set<number>();
  let payment: Payment | null = null;
  let discount = 0;

  const flavourAt = (i: number) => flavours.find((f) => f.words.length > 0 && soundsLike(tokens[i], f.words[0]));

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const pair = `${t} ${tokens[i + 1] ?? ''}`;
    const triple = `${pair} ${tokens[i + 2] ?? ''}`;

    if (CASH_WORDS.has(t)) {
      payment = 'cash';
      continue;
    }
    if (ONLINE_WORDS.has(t) || ONLINE_PAIRS.has(pair) || ONLINE_PAIRS.has(triple)) {
      payment = 'online';
      continue;
    }

    // "discount 20", "discount of 20 rupees", "20 off", "20 rupees discount"
    if (t === 'discount' || t === 'off' || t === 'less') {
      // Where the amount was said: after "discount", or before "off" / "rupees discount"
      const candidates = t === 'discount' ? [i + 1, i + 2, i - 1, i - 2] : [i - 1, i - 2];
      for (const j of candidates) {
        const n = j >= 0 && !used.has(j) ? numberAt(tokens, j, false) : null;
        if (n !== null) {
          discount = n;
          used.add(j);
          break;
        }
      }
      continue;
    }

    const flavour = flavourAt(i);
    if (!flavour) continue;

    // The number said just before the flavour ("2 classic"), skipping filler words
    let qty: number | null = null;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (used.has(j)) break;
      const n = numberAt(tokens, j, true);
      if (n !== null) {
        qty = n;
        used.add(j);
        break;
      }
      if (!FILLER.has(tokens[j])) break;
    }
    // Or just after it ("classic 2"), when that number does not belong to the next flavour
    if (qty === null) {
      const n = numberAt(tokens, i + 1, false);
      if (n !== null && !(tokens[i + 2] !== undefined && flavourAt(i + 2))) {
        qty = n;
        used.add(i + 1);
      }
    }
    items[flavour.id] = (items[flavour.id] ?? 0) + (qty ?? 1);
  }

  return { items, payment, discount, heard: text.trim() };
}

/** Picks the reading of the speech engine's guesses that understood the most. */
export function bestVoiceOrder(alternatives: string[], products: { id: string; name: string }[]): VoiceOrder {
  const parsed = alternatives.map((a) => parseVoiceOrder(a, products));
  const score = (o: VoiceOrder) => (Object.keys(o.items).length > 0 ? 2 : 0) + (o.payment ? 1 : 0);
  return parsed.reduce((best, o) => (score(o) > score(best) ? o : best), parsed[0] ?? { items: {}, payment: null, discount: 0, heard: '' });
}
