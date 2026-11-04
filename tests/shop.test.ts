import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_BASKET,
  centsShortOfDeliveryMinimum,
  findOrderProblem,
  parseBasket,
  priceBasket,
  promiseFor,
  type Basket,
  type FruitId,
  type OrderInput,
} from '../lib/shop.ts';

// 4 November 2026 is a Wednesday. In November the shop's clock is UTC+2.
const local = (date: string, time: string) => new Date(`${date}T${time}:00+02:00`);
const basket = (kg: Partial<Record<FruitId, number>> = {}, boxes = 0): Basket => ({
  kg: { ...EMPTY_BASKET.kg, ...kg },
  boxes,
});
const order = (over: Partial<OrderInput> = {}): OrderInput => ({
  basket: basket({ strawberries: 1 }),
  fulfilment: 'delivery',
  name: 'Sam Example',
  phone: '+372 5555 5555',
  address: '1 Example Street',
  inCity: true,
  ...over,
});

test('delivery promise on an open day', () => {
  assert.equal(promiseFor(local('2026-11-04', '03:00'), 'delivery'), 'Delivered today by 11.00');
  assert.equal(promiseFor(local('2026-11-04', '08:59'), 'delivery'), 'Delivered today by 11.00');
  assert.equal(promiseFor(local('2026-11-04', '09:00'), 'delivery'), 'Delivered today by 11.00');
  assert.equal(promiseFor(local('2026-11-04', '12:05'), 'delivery'), 'Delivered today by 14.05');
  assert.equal(promiseFor(local('2026-11-04', '15:59'), 'delivery'), 'Delivered today by 17.59');
});

test('16.00 exactly is too late, and later orders go to the next delivery day', () => {
  const tomorrow = 'Delivered tomorrow, Thursday 5 November, between 09.00 and 18.00';
  assert.equal(promiseFor(local('2026-11-04', '16:00'), 'delivery'), tomorrow);
  assert.equal(promiseFor(local('2026-11-04', '23:30'), 'delivery'), tomorrow);
  assert.equal(
    promiseFor(local('2026-11-06', '17:00'), 'delivery'),
    'Delivered tomorrow, Saturday 7 November, between 09.00 and 18.00',
  );
});

test('Saturday still delivers, but its evening and all of Sunday show Monday', () => {
  const monday = 'Delivered Monday 9 November, between 09.00 and 18.00';
  assert.equal(promiseFor(local('2026-11-07', '10:00'), 'delivery'), 'Delivered today by 12.00');
  assert.equal(promiseFor(local('2026-11-07', '16:30'), 'delivery'), monday);
  assert.equal(promiseFor(local('2026-11-08', '00:10'), 'delivery'), monday);
  assert.equal(promiseFor(local('2026-11-08', '10:00'), 'delivery'), monday);
  assert.equal(promiseFor(local('2026-11-08', '23:59'), 'delivery'), monday);
});

test('the next delivery day crosses a month end', () => {
  assert.equal(
    promiseFor(local('2026-11-28', '18:00'), 'delivery'),
    'Delivered Monday 30 November, between 09.00 and 18.00',
  );
  assert.equal(
    promiseFor(local('2026-11-30', '18:00'), 'delivery'),
    'Delivered tomorrow, Tuesday 1 December, between 09.00 and 18.00',
  );
});

test('the cutoff follows summer time, when the clock is UTC+3', () => {
  assert.equal(promiseFor(new Date('2026-07-01T12:59:00Z'), 'delivery'), 'Delivered today by 17.59');
  assert.equal(
    promiseFor(new Date('2026-07-01T13:00:00Z'), 'delivery'),
    'Delivered tomorrow, Thursday 2 July, between 09.00 and 18.00',
  );
});

test('pickup timing follows the same clock', () => {
  assert.equal(
    promiseFor(local('2026-11-04', '07:00'), 'pickup'),
    'Ready for pickup today from 11.00, until 18.00',
  );
  assert.equal(
    promiseFor(local('2026-11-04', '13:00'), 'pickup'),
    'Ready for pickup today from 15.00, until 18.00',
  );
  assert.equal(
    promiseFor(local('2026-11-07', '17:00'), 'pickup'),
    'Ready for pickup Monday 9 November, from 09.00 until 18.00',
  );
});

test('prices, the box and the delivery fee', () => {
  const priced = priceBasket(basket({ strawberries: 1.5, lemons: 0.5, cucumbers: 2 }, 1), 'delivery');
  assert.equal(priced.subtotalCents, 1500 + 750 + 300 + 400);
  assert.equal(priced.deliveryCents, 300);
  assert.equal(priced.totalCents, 3250);
  assert.equal(priceBasket(basket({}, 1), 'pickup').totalCents, 1500);
  assert.equal(priceBasket(basket(), 'delivery').totalCents, 0);
});

test('the delivery minimum excludes the fee, and pickup has none', () => {
  assert.equal(centsShortOfDeliveryMinimum(basket({ strawberries: 1 })), 0);
  assert.equal(centsShortOfDeliveryMinimum(basket({ cucumbers: 0.5 })), 400);
  assert.equal(centsShortOfDeliveryMinimum(basket({}, 1)), 0);
  const small = order({ basket: basket({ cucumbers: 0.5 }) });
  assert.match(findOrderProblem(small, []) ?? '', /Add €4.00 more/);
  assert.equal(findOrderProblem({ ...small, fulfilment: 'pickup', address: '', inCity: false }, []), null);
});

test('sold-out fruit blocks orders, and any sold-out fruit blocks the box', () => {
  assert.equal(findOrderProblem(order(), []), null);
  assert.match(findOrderProblem(order(), ['strawberries']) ?? '', /strawberries just sold out/);
  assert.equal(findOrderProblem(order(), ['lemons']), null);
  const box = order({ basket: basket({}, 1) });
  assert.match(findOrderProblem(box, ['lemons']) ?? '', /Magic Fruit Box just sold out/);
});

test('delivery details are required, and pickup details are not', () => {
  assert.match(findOrderProblem(order({ address: '' }), []) ?? '', /street address/);
  assert.match(findOrderProblem(order({ inCity: false }), []) ?? '', /confirm/);
  assert.match(findOrderProblem(order({ phone: 'call me' }), []) ?? '', /phone/);
  assert.match(findOrderProblem(order({ name: '' }), []) ?? '', /name/);
  assert.match(findOrderProblem(order({ basket: basket() }), []) ?? '', /empty/);
});

test('invalid baskets from the browser are rejected', () => {
  const good = { kg: { strawberries: 1.5, lemons: 0, cucumbers: 0 }, boxes: 1 };
  assert.deepEqual(parseBasket(good), good);
  assert.equal(parseBasket({ ...good, kg: { ...good.kg, lemons: 0.3 } }), null);
  assert.equal(parseBasket({ ...good, kg: { ...good.kg, lemons: -1 } }), null);
  assert.equal(parseBasket({ ...good, kg: { ...good.kg, lemons: '1' } }), null);
  assert.equal(parseBasket({ ...good, kg: { ...good.kg, lemons: 51 } }), null);
  assert.equal(parseBasket({ ...good, boxes: 0.5 }), null);
  assert.equal(parseBasket({ kg: { strawberries: 1 }, boxes: 0 }), null);
  assert.equal(parseBasket(null), null);
});
