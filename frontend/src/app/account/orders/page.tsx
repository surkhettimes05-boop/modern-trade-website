'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/catalog';
import {
  listCustomerOrders,
  type CustomerOrder,
} from '@/lib/pasalhoCommerce';

export default function OrdersPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCustomerOrders()
      .then((result) => setOrders(result.items))
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Could not load orders.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="shell page">
      <p className="eyebrow">PASALHO ACCOUNT</p>
      <h1>Your orders</h1>
      {loading ? <p className="mt-4 text-slate-600">Loading orders…</p> : null}
      {error ? (
        <div className="commerce-message error">
          {error}{' '}
          <Link href="/account?next=/account/orders">Sign in</Link>
        </div>
      ) : null}
      {!loading && !error && !orders.length ? (
        <div className="empty-page">
          <h2>No orders yet</h2>
          <p>Your Pasalho web and app orders will appear here.</p>
          <Link className="primary-btn" href="/shop">Start shopping</Link>
        </div>
      ) : null}
      <div className="orders-grid">
        {orders.map((order) => (
          <Link
            className="order-card"
            href={`/account/orders/${order.id}`}
            key={order.id}
          >
            <div>
              <span>{order.status.replaceAll('_', ' ')}</span>
              <h2>{order.orderNo}</h2>
              <small>{new Date(order.createdAt).toLocaleString('en-NP')}</small>
            </div>
            <div>
              <b>{formatPrice(Number(order.grandTotal))}</b>
              <small>
                {order.fulfillmentLocation?.name || 'Pasalho fulfillment'}
              </small>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
