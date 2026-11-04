// All shop facts and rules live here, so they can be changed and tested in one place.
// This file is used by both the browser and the server, and the server always
// recalculates prices itself rather than trusting what the browser sends.

export const SHOP = {
  name: 'Pomona Fruits',
  // PLACEHOLDERS: replace these three before taking real orders.
  city: '[Your city]',
  pickupAddress: '[Your pickup address]',
  phone: '[Your shop phone number]',
  // Eastern European Time, including the summer time switch.
  timeZone: 'Europe/Tallinn',
};

export const DELIVERY_FEE_CENTS = 300;
export const DELIVERY_MIN_CENTS = 500;
export const MAX_KG_PER_FRUIT = 50;
export const MAX_BOXES = 20;

const OPENS_AT = 9 * 60;
const CUTOFF_AT = 16 * 60;
const TWO_HOURS = 2 * 60;

export type FruitId = 'strawberries' | 'lemons' | 'cucumbers';
export type Fulfilment = 'delivery' | 'pickup';

export const FRUITS: {
  id: FruitId;
  name: string;
  centsPerKg: number;
  image: string;
  alt: string;
  blurb: string;
}[] = [
  {
    id: 'strawberries',
    name: 'Strawberries',
    centsPerKg: 500,
    image: '/images/strawberries.jpg',
    alt: 'A wicker basket full of ripe red strawberries on green grass',
    blurb: 'Sweet, red and ripe.',
  },
  {
    id: 'lemons',
    name: 'Lemons',
    centsPerKg: 600,
    image: '/images/lemons.jpg',
    alt: 'A plate piled with bright yellow lemons',
    blurb: 'Bright, juicy and sharp.',
  },
  {
    id: 'cucumbers',
    name: 'Cucumbers',
    centsPerKg: 200,
    image: '/images/cucumbers.jpg',
    alt: 'Whole dark green cucumbers beside freshly cut slices',
    blurb: 'Cool, crisp and fresh.',
  },
];

export const BOX = {
  name: 'Magic Fruit Box',
  priceCents: 1500,
  kgOfEach: 2,
};

/** What the same fruit would cost if bought separately. */
export const BOX_NORMAL_CENTS = FRUITS.reduce((sum, f) => sum + f.centsPerKg * BOX.kgOfEach, 0);

export type Basket = {
  kg: Record<FruitId, number>;
  boxes: number;
};

export const EMPTY_BASKET: Basket = {
  kg: { strawberries: 0, lemons: 0, cucumbers: 0 },
  boxes: 0,
};

export type PricedLine = { name: string; quantity: string; cents: number };

export type PricedBasket = {
  lines: PricedLine[];
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
};

export type OrderInput = {
  basket: Basket;
  fulfilment: Fulfilment;
  name: string;
  phone: string;
  address: string;
  inCity: boolean;
};

export type OrderResult =
  | { ok: true; orderNumber: string; totalCents: number; promise: string; fulfilment: Fulfilment }
  | { ok: false; error: string };

export function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function priceBasket(basket: Basket, fulfilment: Fulfilment): PricedBasket {
  const lines: PricedLine[] = [];
  if (basket.boxes > 0) {
    lines.push({
      name: BOX.name,
      quantity: `${basket.boxes} × box`,
      cents: basket.boxes * BOX.priceCents,
    });
  }
  for (const fruit of FRUITS) {
    const kg = basket.kg[fruit.id];
    if (kg > 0) {
      lines.push({ name: fruit.name, quantity: `${kg} kg`, cents: Math.round(kg * fruit.centsPerKg) });
    }
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.cents, 0);
  const deliveryCents = fulfilment === 'delivery' && subtotalCents > 0 ? DELIVERY_FEE_CENTS : 0;
  return { lines, subtotalCents, deliveryCents, totalCents: subtotalCents + deliveryCents };
}

/** How much more fruit is needed before delivery is allowed. 0 means the minimum is met. */
export function centsShortOfDeliveryMinimum(basket: Basket): number {
  return Math.max(0, DELIVERY_MIN_CENTS - priceBasket(basket, 'pickup').subtotalCents);
}

export function isBoxSoldOut(soldOut: readonly FruitId[]): boolean {
  return soldOut.length > 0;
}

/** Turns untrusted input into a valid basket, or returns null if anything is off. */
export function parseBasket(input: unknown): Basket | null {
  if (typeof input !== 'object' || input === null) return null;
  const { kg, boxes } = input as { kg?: unknown; boxes?: unknown };
  if (typeof kg !== 'object' || kg === null) return null;
  if (typeof boxes !== 'number' || !Number.isInteger(boxes) || boxes < 0 || boxes > MAX_BOXES) return null;

  const basket: Basket = { kg: { ...EMPTY_BASKET.kg }, boxes };
  for (const fruit of FRUITS) {
    const amount = (kg as Record<string, unknown>)[fruit.id];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    if (amount < 0 || amount > MAX_KG_PER_FRUIT) return null;
    if (!Number.isInteger(amount * 2)) return null; // half-kilo steps only
    basket.kg[fruit.id] = amount;
  }
  return basket;
}

/** Checks everything about an order except the database. Returns an error message, or null. */
export function findOrderProblem(input: OrderInput, soldOut: readonly FruitId[]): string | null {
  const { basket, fulfilment } = input;
  if (priceBasket(basket, 'pickup').subtotalCents === 0) return 'Your basket is empty.';

  if (basket.boxes > 0 && isBoxSoldOut(soldOut)) {
    return `Sorry, the ${BOX.name} just sold out. Please remove it from your basket.`;
  }
  for (const fruit of FRUITS) {
    if (basket.kg[fruit.id] > 0 && soldOut.includes(fruit.id)) {
      return `Sorry, ${fruit.name.toLowerCase()} just sold out. Please remove them from your basket.`;
    }
  }

  if (input.name.length < 2 || input.name.length > 100) return 'Please enter your name.';
  if (!/^\+?[0-9][0-9 ()-]{5,24}$/.test(input.phone)) return 'Please enter a valid phone number.';

  if (fulfilment === 'delivery') {
    const short = centsShortOfDeliveryMinimum(basket);
    if (short > 0) {
      return `Delivery needs at least ${formatEuro(DELIVERY_MIN_CENTS)} of fruit. Add ${formatEuro(short)} more, or choose pickup.`;
    }
    if (input.address.length < 5 || input.address.length > 200) return 'Please enter your street address.';
    if (!input.inCity) return `Please confirm that your address is in ${SHOP.city}.`;
  }
  return null;
}

// --- Time rules ---

function shopClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    minutes: get('hour') * 60 + get('minute'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), // 0 is Sunday
  };
}

function clockText(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}.${pad(minutes % 60)}`;
}

/** Works out the promise to show a customer ordering at the given moment. */
export function promiseFor(now: Date, fulfilment: Fulfilment): string {
  const clock = shopClock(now);
  const isOpenDay = clock.weekday !== 0;

  if (isOpenDay && clock.minutes < CUTOFF_AT) {
    const ready = clockText(Math.max(clock.minutes, OPENS_AT) + TWO_HOURS);
    return fulfilment === 'delivery'
      ? `Delivered today by ${ready}`
      : `Ready for pickup today from ${ready}, until 18.00`;
  }

  // After the cutoff, or on Sunday: the next delivery day. Saturday skips over Sunday.
  const daysAhead = clock.weekday === 6 ? 2 : 1;
  const next = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + daysAhead));
  const dateText = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(next)
    .replace(',', '');
  // "Tomorrow" only after an open day's cutoff. Sunday's orders always name Monday.
  const when = isOpenDay && daysAhead === 1 ? `tomorrow, ${dateText}` : dateText;
  return fulfilment === 'delivery'
    ? `Delivered ${when}, between 09.00 and 18.00`
    : `Ready for pickup ${when}, from 09.00 until 18.00`;
}

export function formatShopTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
