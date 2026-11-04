'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  BOX,
  BOX_NORMAL_CENTS,
  DELIVERY_FEE_CENTS,
  DELIVERY_MIN_CENTS,
  EMPTY_BASKET,
  FRUITS,
  MAX_BOXES,
  MAX_KG_PER_FRUIT,
  SHOP,
  centsShortOfDeliveryMinimum,
  formatEuro,
  isBoxSoldOut,
  priceBasket,
  promiseFor,
  type Basket,
  type FruitId,
  type Fulfilment,
  type OrderResult,
} from '../lib/shop';
import { placeOrder } from './actions';
import Charlie from './Charlie';

type Confirmation = Extract<OrderResult, { ok: true }>;

function Stepper(props: {
  label: string;
  value: string;
  isEmpty: boolean;
  addLabel: string;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  if (props.isEmpty) {
    return (
      <button type="button" className="button add" onClick={props.onAdd} disabled={!props.canAdd}>
        {props.addLabel}
      </button>
    );
  }
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <button type="button" onClick={props.onRemove} aria-label={`Less ${props.label}`}>
        −
      </button>
      <output aria-live="polite">{props.value}</output>
      <button type="button" onClick={props.onAdd} disabled={!props.canAdd} aria-label={`More ${props.label}`}>
        +
      </button>
    </div>
  );
}

export default function ShopClient({ initialNow, soldOut }: { initialNow: number; soldOut: FruitId[] }) {
  const router = useRouter();
  const [now, setNow] = useState(initialNow);
  const [basket, setBasket] = useState<Basket>(EMPTY_BASKET);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('delivery');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [inCity, setInCity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Keeps the promises correct if the page stays open past a cutoff.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const moment = new Date(now);
  const priced = priceBasket(basket, fulfilment);
  const boxSoldOut = isBoxSoldOut(soldOut);
  const hasItems = priced.subtotalCents > 0;
  const short = fulfilment === 'delivery' ? centsShortOfDeliveryMinimum(basket) : 0;

  const changeFruit = (id: FruitId, change: number) =>
    setBasket((b) => ({
      ...b,
      kg: { ...b.kg, [id]: Math.min(MAX_KG_PER_FRUIT, Math.max(0, b.kg[id] + change)) },
    }));
  const changeBoxes = (change: number) =>
    setBasket((b) => ({ ...b, boxes: Math.min(MAX_BOXES, Math.max(0, b.boxes + change)) }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await placeOrder({ basket, fulfilment, name, phone, address, inCity });
      if (result.ok) {
        setConfirmation(result);
        setBasket(EMPTY_BASKET);
        window.scrollTo({ top: 0 });
      } else {
        setError(result.error);
        router.refresh(); // picks up anything that has just sold out
      }
    } catch {
      setError('We could not reach the shop. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <header className="site-header">
      <a className="brand" href="/">
        {SHOP.name}
      </a>
      <span className="header-note">Pay on delivery or at pickup</span>
    </header>
  );

  const page = confirmation ? (
      <>
        {header}
        <main className="confirmation">
          <p className="eyebrow">Thank you, your order is in</p>
          <h1>Order {confirmation.orderNumber}</h1>
          <p className="promise-large">{confirmation.promise}</p>
          <dl>
            <div>
              <dt>{confirmation.fulfilment === 'delivery' ? 'To pay on delivery' : 'To pay at pickup'}</dt>
              <dd>{formatEuro(confirmation.totalCents)}</dd>
            </div>
            {confirmation.fulfilment === 'pickup' && (
              <div>
                <dt>Pick up from</dt>
                <dd>{SHOP.pickupAddress}</dd>
              </div>
            )}
          </dl>
          <p>
            Please note your order number. To change or cancel your order, call us on <strong>{SHOP.phone}</strong>.
          </p>
          <button type="button" className="button" onClick={() => setConfirmation(null)}>
            Back to the shop
          </button>
        </main>
      </>
  ) : (
    <>
      {header}

      <section className="hero">
        <div className="hero-text">
          <h1>Fresh fruit, at your door in 2 hours.</h1>
          <p className="lead">Ripe strawberries, bright lemons and crisp cucumbers, by the half kilo.</p>
          <div className="delivery-note">
            <strong>We deliver in 2 hours if you order before 16.00.</strong>
            <span>Monday to Saturday in {SHOP.city}.</span>
            <span>If you order now: {promiseFor(moment, 'delivery')}.</span>
          </div>
        </div>
        <div className="hero-image">
          <Image
            src={FRUITS[0].image}
            alt={FRUITS[0].alt}
            width={960}
            height={891}
            priority
            sizes="(max-width: 800px) 100vw, 45vw"
          />
        </div>
      </section>

      <div className="shop-layout">
        <main className="products">
          <section className={`box-card ${boxSoldOut ? 'is-sold-out' : ''}`} aria-labelledby="box-title">
            <div className="box-photos">
              {FRUITS.map((fruit) => (
                <Image key={fruit.id} src={fruit.image} alt="" width={960} height={720} sizes="(max-width: 800px) 33vw, 16vw" />
              ))}
            </div>
            <div className="box-body">
              <p className="eyebrow">Best value</p>
              <h2 id="box-title">{BOX.name}</h2>
              <p>
                {BOX.kgOfEach} kg each of strawberries, lemons and cucumbers. That&apos;s 6 kg of fruit for only{' '}
                {formatEuro(BOX.priceCents)}.
              </p>
              <p className="price">
                <span className="price-now">{formatEuro(BOX.priceCents)}</span>{' '}
                <s>{formatEuro(BOX_NORMAL_CENTS)}</s>{' '}
                <span className="saving">Save {formatEuro(BOX_NORMAL_CENTS - BOX.priceCents)}</span>
              </p>
              {boxSoldOut && basket.boxes === 0 ? (
                <p className="sold-out">Sold out</p>
              ) : (
                <Stepper
                  label={BOX.name}
                  value={`${basket.boxes} × box`}
                  isEmpty={basket.boxes === 0}
                  addLabel="Add box to basket"
                  canAdd={!boxSoldOut && basket.boxes < MAX_BOXES}
                  onAdd={() => changeBoxes(1)}
                  onRemove={() => changeBoxes(-1)}
                />
              )}
            </div>
          </section>

          <h2 className="section-title">Buy by the half kilo</h2>
          <div className="fruit-grid">
            {FRUITS.map((fruit) => {
              const isSoldOut = soldOut.includes(fruit.id);
              const kg = basket.kg[fruit.id];
              return (
                <article key={fruit.id} className={`fruit-card ${isSoldOut ? 'is-sold-out' : ''}`}>
                  <Image src={fruit.image} alt={fruit.alt} width={960} height={720} sizes="(max-width: 600px) 100vw, 30vw" />
                  <div className="fruit-body">
                    <h3>{fruit.name}</h3>
                    <p>{fruit.blurb}</p>
                    <p className="price">
                      <span className="price-now">{formatEuro(fruit.centsPerKg)}</span> per kg
                    </p>
                    {isSoldOut && kg === 0 ? (
                      <p className="sold-out">Sold out</p>
                    ) : (
                      <Stepper
                        label={fruit.name}
                        value={`${kg} kg`}
                        isEmpty={kg === 0}
                        addLabel="Add 0.5 kg"
                        canAdd={!isSoldOut && kg < MAX_KG_PER_FRUIT}
                        onAdd={() => changeFruit(fruit.id, 0.5)}
                        onRemove={() => changeFruit(fruit.id, -0.5)}
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        <aside className="checkout" id="checkout">
          <h2>Your basket</h2>
          {!hasItems && <p className="muted">Your basket is empty. Add some fruit to get started.</p>}

          {hasItems && (
            <form onSubmit={submit}>
              <ul className="lines">
                {priced.lines.map((line) => (
                  <li key={line.name}>
                    <span>
                      {line.name} <small>{line.quantity}</small>
                    </span>
                    <span>{formatEuro(line.cents)}</span>
                  </li>
                ))}
              </ul>

              <fieldset className="choice">
                <legend>How would you like to get it?</legend>
                <label className={fulfilment === 'delivery' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="fulfilment"
                    checked={fulfilment === 'delivery'}
                    onChange={() => setFulfilment('delivery')}
                  />
                  <span>
                    <strong>Delivery</strong> {formatEuro(DELIVERY_FEE_CENTS)}
                  </span>
                </label>
                <label className={fulfilment === 'pickup' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="fulfilment"
                    checked={fulfilment === 'pickup'}
                    onChange={() => setFulfilment('pickup')}
                  />
                  <span>
                    <strong>Pickup</strong> Free
                  </span>
                </label>
              </fieldset>

              <p className="promise">{promiseFor(moment, fulfilment)}</p>
              {fulfilment === 'pickup' && (
                <p className="muted small">
                  Collect from {SHOP.pickupAddress}. Open Monday to Saturday, 09.00 to 18.00.
                </p>
              )}

              <label className="field">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
              </label>
              <label className="field">
                Phone number
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  maxLength={25}
                  autoComplete="tel"
                />
              </label>

              {fulfilment === 'delivery' && (
                <>
                  <label className="field">
                    Street address
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                      maxLength={200}
                      autoComplete="street-address"
                    />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={inCity} onChange={(e) => setInCity(e.target.checked)} required />
                    <span>My address is in {SHOP.city}</span>
                  </label>
                </>
              )}

              <dl className="totals">
                <div>
                  <dt>Fruit</dt>
                  <dd>{formatEuro(priced.subtotalCents)}</dd>
                </div>
                <div>
                  <dt>{fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</dt>
                  <dd>{priced.deliveryCents ? formatEuro(priced.deliveryCents) : 'Free'}</dd>
                </div>
                <div className="grand-total">
                  <dt>Total</dt>
                  <dd>{formatEuro(priced.totalCents)}</dd>
                </div>
              </dl>

              {short > 0 && (
                <p className="notice">
                  Delivery needs at least {formatEuro(DELIVERY_MIN_CENTS)} of fruit. Add {formatEuro(short)} more, or
                  choose pickup.
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="button place-order" disabled={submitting || short > 0}>
                {submitting ? 'Placing your order…' : 'Place order'}
              </button>
              <p className="muted small center">
                {fulfilment === 'delivery' ? 'Pay when your fruit arrives.' : 'Pay when you collect.'} Nothing to pay
                online.
              </p>
            </form>
          )}
        </aside>
      </div>

      {hasItems && (
        <a className="mobile-bar" href="#checkout">
          <span>Basket: {formatEuro(priced.subtotalCents)}</span>
          <strong>Checkout</strong>
        </a>
      )}

      <footer className="site-footer">
        <div>
          <h2>Good to know</h2>
          <p>
            Delivery is {formatEuro(DELIVERY_FEE_CENTS)} within {SHOP.city}, with a minimum of{' '}
            {formatEuro(DELIVERY_MIN_CENTS)} of fruit. To change or cancel an order, call us on {SHOP.phone}.
          </p>
        </div>
        <div>
          <h2>Your privacy</h2>
          <p>
            We store your name, phone number, address and order so that we can deliver it and contact you about it.
            We use no accounts and share your details with no one for marketing. If you chat with Charlie, our AI
            helper, your messages are saved and processed by our AI provider, Anthropic, so please keep personal
            details out of the chat. To ask about your details or have them removed, call us on {SHOP.phone}.
          </p>
        </div>
        <div>
          <h2>Photo credits</h2>
          <p>
            <a href="https://commons.wikimedia.org/wiki/File:Strawberries_in_basket_2018_G1.jpg">Strawberries</a> by
            George Chernilevsky, public domain.{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Lemons_on_a_plate.JPG">Lemons</a> by Chris Haines and{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Kurkkuja.jpg">cucumbers</a> by Muu-karhu, both{' '}
            <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, resized.
          </p>
        </div>
      </footer>
    </>
  );

  // Charlie stays outside the page content, so the chat carries on past the order confirmation.
  return (
    <>
      {page}
      <Charlie basket={basket} onBasketChange={setBasket} />
    </>
  );
}
