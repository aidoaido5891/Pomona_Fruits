'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Reloads the orders every 30 seconds and shows the number of open orders in the browser tab. */
export default function AutoRefresh({ openOrders }: { openOrders: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    document.title = openOrders > 0 ? `(${openOrders}) Orders | Pomona Fruits` : 'Orders | Pomona Fruits';
  }, [openOrders]);

  return null;
}
