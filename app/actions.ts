'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAdmin, logIn, logOut, loginIsConfigured, loginIsLocked } from '../lib/auth';
import { ORDER_STATUSES, getSoldOut, insertOrder, setOrderStatus, setSoldOut, type OrderStatus } from '../lib/db';
import {
  FRUITS,
  findOrderProblem,
  parseBasket,
  priceBasket,
  promiseFor,
  type FruitId,
  type OrderInput,
  type OrderResult,
} from '../lib/shop';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The browser's input is untrusted, so prices and rules are all worked out again here. */
export async function placeOrder(raw: unknown): Promise<OrderResult> {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const basket = parseBasket(data.basket);
  if (!basket) return { ok: false, error: 'Something is wrong with your basket. Please check the amounts.' };

  const fulfilment = data.fulfilment === 'pickup' ? 'pickup' : 'delivery';
  const input: OrderInput = {
    basket,
    fulfilment,
    name: text(data.name),
    phone: text(data.phone),
    address: fulfilment === 'delivery' ? text(data.address) : '',
    inCity: data.inCity === true,
  };

  // Mistakes in the form are reported first, because they don't depend on the database.
  const formProblem = findOrderProblem(input, []);
  if (formProblem) return { ok: false, error: formProblem };

  try {
    const stockProblem = findOrderProblem(input, await getSoldOut());
    if (stockProblem) return { ok: false, error: stockProblem };

    const priced = priceBasket(basket, fulfilment);
    const promise = promiseFor(new Date(), fulfilment);
    const orderNumber = await insertOrder({
      name: input.name,
      phone: input.phone,
      fulfilment,
      address: fulfilment === 'delivery' ? input.address : null,
      items: priced.lines,
      subtotalCents: priced.subtotalCents,
      deliveryCents: priced.deliveryCents,
      totalCents: priced.totalCents,
      promise,
    });
    revalidatePath('/orders');
    return { ok: true, orderNumber, totalCents: priced.totalCents, promise, fulfilment };
  } catch (error) {
    console.error('Could not place order', error);
    return { ok: false, error: 'Sorry, we could not place your order just now. Please try again in a moment.' };
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  if (!loginIsConfigured()) redirect('/orders?error=setup');
  if (loginIsLocked()) redirect('/orders?error=locked');
  const success = await logIn(text(formData.get('password')));
  redirect(success ? '/orders' : '/orders?error=wrong');
}

export async function logoutAction(): Promise<void> {
  await logOut();
  redirect('/orders');
}

export async function updateStatusAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) redirect('/orders');
  const id = Number(formData.get('id'));
  const status = text(formData.get('status')) as OrderStatus;
  if (!Number.isSafeInteger(id) || !ORDER_STATUSES.includes(status)) return;
  await setOrderStatus(id, status);
  revalidatePath('/orders');
}

export async function setSoldOutAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) redirect('/orders');
  const fruitId = text(formData.get('fruit')) as FruitId;
  if (!FRUITS.some((fruit) => fruit.id === fruitId)) return;
  await setSoldOut(fruitId, formData.get('soldOut') === 'true');
  revalidatePath('/orders');
  revalidatePath('/');
}
