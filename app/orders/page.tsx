import type { Metadata } from 'next';
import { isAdmin, loginIsConfigured } from '../../lib/auth';
import { getSoldOut, listOrders, orderNumber, type OrderRow, type OrderStatus } from '../../lib/db';
import { BOX, FRUITS, formatEuro, formatShopTime, isBoxSoldOut, type FruitId } from '../../lib/shop';
import { loginAction, logoutAction, setSoldOutAction, updateStatusAction } from '../actions';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Orders | Pomona Fruits',
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  delivered: 'Delivered',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
};

const LOGIN_ERRORS: Record<string, string> = {
  wrong: 'That password is not correct.',
  locked: 'Too many wrong passwords. Please wait 15 minutes and try again.',
  setup: 'The ADMIN_PASSWORD variable is not set on Railway yet.',
};

function StatusButton({ id, status, label, quiet }: { id: string; status: OrderStatus; label: string; quiet?: boolean }) {
  return (
    <form action={updateStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={quiet ? 'button quiet' : 'button'}>{label}</button>
    </form>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const isOpen = order.status === 'new';
  return (
    <article className={`order ${isOpen ? 'is-open' : 'is-closed'}`}>
      <header>
        <h3>{orderNumber(order.id)}</h3>
        <span className={`status status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        <time>{formatShopTime(new Date(order.created_at))}</time>
      </header>
      <p className="order-promise">
        {order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}: {order.promise}
      </p>
      <p>
        <strong>{order.customer_name}</strong> · <a href={`tel:${order.phone.replace(/[^+0-9]/g, '')}`}>{order.phone}</a>
        {order.address && (
          <>
            <br />
            {order.address}
          </>
        )}
      </p>
      <ul className="lines">
        {order.items.map((item) => (
          <li key={item.name}>
            <span>
              {item.name} <small>{item.quantity}</small>
            </span>
            <span>{formatEuro(item.cents)}</span>
          </li>
        ))}
        {order.delivery_cents > 0 && (
          <li>
            <span>Delivery</span>
            <span>{formatEuro(order.delivery_cents)}</span>
          </li>
        )}
        <li className="grand-total">
          <span>To collect</span>
          <span>{formatEuro(order.total_cents)}</span>
        </li>
      </ul>
      <div className="order-actions">
        {isOpen ? (
          <>
            {order.fulfilment === 'delivery' ? (
              <StatusButton id={order.id} status="delivered" label="Mark delivered" />
            ) : (
              <StatusButton id={order.id} status="picked_up" label="Mark picked up" />
            )}
            <StatusButton id={order.id} status="cancelled" label="Cancel order" quiet />
          </>
        ) : (
          <StatusButton id={order.id} status="new" label="Reopen" quiet />
        )}
      </div>
    </article>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isAdmin())) {
    const { error } = await searchParams;
    const message = (error && LOGIN_ERRORS[error]) ?? (loginIsConfigured() ? '' : LOGIN_ERRORS.setup);
    return (
      <main className="admin-login">
        <h1>Orders</h1>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <form action={loginAction}>
          <label className="field">
            Password
            <input type="password" name="password" required autoComplete="current-password" autoFocus />
          </label>
          <button className="button">Log in</button>
        </form>
      </main>
    );
  }

  let orders: OrderRow[];
  let soldOut: FruitId[];
  try {
    [orders, soldOut] = await Promise.all([listOrders(), getSoldOut()]);
  } catch (error) {
    console.error('Could not load orders', error);
    return (
      <main className="admin-login">
        <h1>Orders</h1>
        <p className="error" role="alert">
          The database could not be reached. Check that DATABASE_URL is set on this Railway service, then reload.
        </p>
      </main>
    );
  }

  const open = orders.filter((order) => order.status === 'new');
  const closed = orders.filter((order) => order.status !== 'new');

  return (
    <main className="admin">
      <AutoRefresh openOrders={open.length} />
      <header className="admin-header">
        <h1>Orders</h1>
        <form action={logoutAction}>
          <button className="button quiet">Log out</button>
        </form>
      </header>

      <section className="stock">
        <h2>Stock</h2>
        <div className="stock-list">
          {FRUITS.map((fruit) => {
            const isSoldOut = soldOut.includes(fruit.id);
            return (
              <form action={setSoldOutAction} key={fruit.id} className="stock-item">
                <input type="hidden" name="fruit" value={fruit.id} />
                <input type="hidden" name="soldOut" value={String(!isSoldOut)} />
                <span>
                  <strong>{fruit.name}</strong> {isSoldOut ? 'Sold out' : 'In stock'}
                </span>
                <button className={isSoldOut ? 'button' : 'button quiet'}>
                  {isSoldOut ? 'Back in stock' : 'Mark sold out'}
                </button>
              </form>
            );
          })}
        </div>
        <p className="muted small">
          {BOX.name}: {isBoxSoldOut(soldOut) ? 'sold out, because a fruit is sold out' : 'available'}.
        </p>
      </section>

      <section>
        <h2>Open orders ({open.length})</h2>
        <p className="muted small">This page updates by itself every 30 seconds. Oldest orders are at the top.</p>
        {open.length === 0 && <p className="muted">No open orders right now.</p>}
        <div className="order-list">
          {open.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>

      {closed.length > 0 && (
        <section>
          <h2>Finished orders</h2>
          <div className="order-list">
            {closed.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
