'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { formatPrice } from '@/lib/catalog';
import { commerceRequest } from '@/lib/pasalhoCommerce';

type Order = {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number | string;
  placedAt?: string | null;
  createdAt: string;
  fulfillmentLocation?: { id: string; name: string } | null;
};

type Page = {
  items: Order[];
  total: number;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    commerceRequest<Page>('orders?page=1&limit=50')
      .then((page) => setOrders(page.items))
      .catch((value) =>
        setError(
          value instanceof Error
            ? value.message
            : 'Could not load your Pasalho orders.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="shell page orders-shell">
      <p className="eyebrow">PASALHO ORDERS</p>
      <h1>Your orders</h1>
      {loading ? <p>Loading orders…</p> : null}
      {error ? (
        <div className="orders-auth-note">
          <p>{error}</p>
          <Link className="primary-btn" href="/account">Sign in</Link>
        </div>
      ) : null}
      {!loading && !error && !orders.length ? (
        <div className="empty-page">
          <PackageOpen />
          <h2>No orders yet</h2>
          <p>Your first Pasalho order will appear here.</p>
          <Link className="primary-btn" href="/shop">Start shopping</Link>
        </div>
      ) : null}
      <div className="order-list">
        {orders.map((order) => (
          <Link className="order-card" href={`/account/orders/${order.id}`} key={order.id}>
            <div>
              <b>{order.orderNo}</b>
              <span>{order.fulfillmentLocation?.name || 'Pasalho store'}</span>
            </div>
            <div>
              <strong>{formatPrice(Number(order.grandTotal))}</strong>
              <span className={`order-status status-${order.status.toLowerCase()}`}>{order.status.replaceAll('_', ' ')}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
