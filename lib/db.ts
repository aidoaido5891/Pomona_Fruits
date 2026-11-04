import { Pool } from 'pg';
import type { FruitId, Fulfilment, PricedLine } from './shop';

// The tables are created the first time the app reaches the Railway database.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    fulfilment TEXT NOT NULL CHECK (fulfilment IN ('delivery', 'pickup')),
    address TEXT,
    items JSONB NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    delivery_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    promise TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'delivered', 'picked_up', 'cancelled'))
  );
  CREATE TABLE IF NOT EXISTS sold_out_fruit (
    fruit_id TEXT PRIMARY KEY
  );
`;

export const ORDER_STATUSES = ['new', 'delivered', 'picked_up', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRow = {
  id: string;
  created_at: Date;
  customer_name: string;
  phone: string;
  fulfilment: Fulfilment;
  address: string | null;
  items: PricedLine[];
  subtotal_cents: number;
  delivery_cents: number;
  total_cents: number;
  promise: string;
  status: OrderStatus;
};

let pool: Pool | undefined;
let schemaReady: Promise<unknown> | undefined;

async function database(): Promise<Pool> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  schemaReady ??= pool.query(SCHEMA).catch((error) => {
    schemaReady = undefined; // try again on the next request
    throw error;
  });
  await schemaReady;
  return pool;
}

export function orderNumber(id: string | number): string {
  return `PF-${1000 + Number(id)}`;
}

export async function getSoldOut(): Promise<FruitId[]> {
  const db = await database();
  const { rows } = await db.query<{ fruit_id: FruitId }>('SELECT fruit_id FROM sold_out_fruit');
  return rows.map((row) => row.fruit_id);
}

export async function setSoldOut(fruitId: FruitId, soldOut: boolean): Promise<void> {
  const db = await database();
  if (soldOut) {
    await db.query('INSERT INTO sold_out_fruit (fruit_id) VALUES ($1) ON CONFLICT DO NOTHING', [fruitId]);
  } else {
    await db.query('DELETE FROM sold_out_fruit WHERE fruit_id = $1', [fruitId]);
  }
}

export async function insertOrder(order: {
  name: string;
  phone: string;
  fulfilment: Fulfilment;
  address: string | null;
  items: PricedLine[];
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  promise: string;
}): Promise<string> {
  const db = await database();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO orders
       (customer_name, phone, fulfilment, address, items, subtotal_cents, delivery_cents, total_cents, promise)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      order.name,
      order.phone,
      order.fulfilment,
      order.address,
      JSON.stringify(order.items),
      order.subtotalCents,
      order.deliveryCents,
      order.totalCents,
      order.promise,
    ],
  );
  return orderNumber(rows[0].id);
}

/** Open orders first, oldest at the top, then the most recently closed ones. */
export async function listOrders(): Promise<OrderRow[]> {
  const db = await database();
  const { rows } = await db.query<OrderRow>(
    `SELECT * FROM orders
     ORDER BY CASE WHEN status = 'new' THEN 0 ELSE 1 END,
              CASE WHEN status = 'new' THEN created_at END ASC,
              created_at DESC
     LIMIT 200`,
  );
  return rows;
}

export async function setOrderStatus(id: number, status: OrderStatus): Promise<void> {
  const db = await database();
  await db.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
}
