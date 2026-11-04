import { getSoldOut } from '../lib/db';
import type { FruitId } from '../lib/shop';
import ShopClient from './ShopClient';

// Sold-out switches and the time of day must always be current.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let soldOut: FruitId[] = [];
  try {
    soldOut = await getSoldOut();
  } catch (error) {
    // Keep the page up. Placing an order will show a clear message if the database is down.
    console.error('Could not read sold-out fruit', error);
  }
  return <ShopClient initialNow={Date.now()} soldOut={soldOut} />;
}
