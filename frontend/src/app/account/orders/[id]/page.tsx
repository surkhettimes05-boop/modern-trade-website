'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/catalog';
import { commerceRequest } from '@/lib/pasalhoCommerce';

type TimelineEvent = {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  createdAt: string;
  note?: string | null;
};

type Order = {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number | string;
  deliveryFee: number | string;
  placedAt?: string | null;
  fulfillmentLocation?: { id: string; name: string } | null;
  items: Array<{
    id: string;
    quantity: number | string;
    lineTotal: number | string;
    product: { name: string };
    unit?: { symbol: string };
  }>;
  statusEvents: TimelineEvent[];
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    commerceRequest<Order>(`orders/${encodeURIComponent(id)}`)
      .then(setOrder)
      .catch((value) =>
        setError(value instanceof Error ? value.message : 'Could not load order'),
      );
  }, [id]);

  if (error) {
    return (
      <div className="shell page">
        <p className="form-error">{error}</p>
        <Link href="/account">Sign in or open account</Link>
      </div>
    );
  }
  if (!order) return <div className="shell page">Loading order…</div>;

  return (
    <div className="shell page order-detail-shell">
      <Link href="/account/orders" className="order-back">← All orders</Link>
      <div className="order-detail-head">
        <div>
          <p className="eyebrow">ORDER {order.orderNo}</p>
          <h1>{order.status.replaceAll('_', ' ')}</h1>
          <p>{order.fulfillmentLocation?.name || 'Pasalho store'}</p>
        </div>
        <strong>{formatPrice(Number(order.grandTotal))}</strong>
      </div>

      <div className="order-detail-grid">
        <section className="checkout-panel">
          <h2>Items</h2>
          {order.items.map((item) => (
            <p className="order-item-line" key={item.id}>
              <span>
                {Number(item.quantity)} × {item.product.name}
                {item.unit?.symbol ? ` · ${item.unit.symbol}` : ''}
              </span>
              <b>{formatPrice(Number(item.lineTotal))}</b>
            </p>
          ))}
        </section>

        <section className="checkout-panel">
          <h2>Tracking</h2>
          <div className="order-timeline">
            {order.statusEvents.map((event) => (
              <div key={event.id}>
                <i />
                <span>
                  <b>{event.toStatus.replaceAll('_', ' ')}</b>
                  <small>{new Date(event.createdAt).toLocaleString('en-NP')}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
