'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/catalog';
import {
  cancelCustomerOrder,
  getCustomerOrder,
  type CustomerOrder,
} from '@/lib/pasalhoCommerce';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setOrder(await getCustomerOrder(id));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not load order.',
      );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel() {
    if (!order || !window.confirm('Cancel this Pasalho order?')) return;
    setBusy(true);
    setError('');
    try {
      await cancelCustomerOrder(order.id, 'Customer requested cancellation');
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not cancel order.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) {
    return (
      <div className="shell page">
        <p className="commerce-message error">{error}</p>
        <Link href="/account?next=/account/orders">Sign in</Link>
      </div>
    );
  }

  if (!order) {
    return <div className="shell page">Loading order…</div>;
  }

  const cancellable = ['PLACED', 'CONFIRMED'].includes(order.status);

  return (
    <div className="shell page order-detail">
      <Link href="/account/orders" className="text-btn">← All orders</Link>
      <div className="order-detail-head">
        <div>
          <p className="eyebrow">PASALHO ORDER</p>
          <h1>{order.orderNo}</h1>
          <p>{order.status.replaceAll('_', ' ')}</p>
        </div>
        <strong>{formatPrice(Number(order.grandTotal))}</strong>
      </div>

      {error ? <p className="commerce-message error">{error}</p> : null}

      <div className="order-detail-grid">
        <section className="checkout-card">
          <h2>Items</h2>
          <div className="order-items">
            {order.items?.map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.product.name}</b>
                  <small>
                    {Number(item.quantity)} {item.unit?.symbol || item.unit?.name || ''}
                  </small>
                </span>
                <strong>{formatPrice(Number(item.lineTotal))}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="checkout-card">
          <h2>Tracking</h2>
          <div className="order-timeline">
            {order.statusEvents?.map((event) => (
              <div key={event.id}>
                <i />
                <span>
                  <b>{event.toStatus.replaceAll('_', ' ')}</b>
                  <small>{new Date(event.createdAt).toLocaleString('en-NP')}</small>
                  {event.note ? <em>{event.note}</em> : null}
                </span>
              </div>
            ))}
          </div>
          {cancellable ? (
            <button
              className="secondary-btn danger-button"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? 'Cancelling…' : 'Cancel order'}
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
