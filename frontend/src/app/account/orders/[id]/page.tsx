'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/catalog';
import { resilientFetch } from '@/lib/resilientFetch';

type Event = { id: string; to_status?: string; created_at: string };
type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total_with_tax?: number;
  line_total: number;
};
type Order = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  shipping_name?: string | null;
  shipping_phone?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  items?: OrderItem[];
  events?: Event[];
};

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadOrder = useCallback(async () => {
    const response = await resilientFetch(`/api/customer/orders/${id}`, { credentials: 'include' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load order');
    setOrder(body as Order);
  }, [id]);

  useEffect(() => {
    loadOrder().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load order'));
  }, [loadOrder]);

  async function cancelOrder() {
    if (!order) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await resilientFetch(`/api/customer/orders/${order.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({ reason: 'Cancelled by customer' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not cancel order');
      await loadOrder();
      setNotice('Your order was cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel order');
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) return <div className="shell page"><p className="text-red-700">{error}</p></div>;
  if (!order) return <div className="shell page">Loading order…</div>;
  const address = [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_postal_code, order.shipping_country].filter(Boolean).join(', ');
  const canCancel = ['PENDING', 'PENDING_PAYMENT', 'CONFIRMED'].includes(order.status);

  return <div className="shell page">
    <Link href="/account/orders" className="text-emerald-700">← All orders</Link>
    <h1 className="mt-4">{order.order_number}</h1>
    <p className="mt-2 font-semibold">Status: {order.status}</p>
    <p className="text-slate-600">Total: {formatPrice(Number(order.total_amount))}</p>
    {error && <p role="alert" className="mt-4 rounded bg-amber-50 p-4 text-amber-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded bg-emerald-50 p-4 text-emerald-800">{notice}</p>}

    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Items</h2>
      <div className="mt-3 divide-y divide-slate-100">
        {order.items?.map((item) => <div className="flex justify-between gap-4 py-3" key={item.id}>
          <span>{item.product_name} <span className="text-slate-600">× {item.quantity}</span></span>
          <strong>{formatPrice(Number(item.line_total_with_tax ?? item.line_total))}</strong>
        </div>)}
      </div>
    </section>

    {address && <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Delivery address</h2>
      {order.shipping_name && <p className="mt-2">{order.shipping_name}</p>}
      <p>{address}</p>
      {order.shipping_phone && <p>{order.shipping_phone}</p>}
    </section>}

    {canCancel && <button type="button" disabled={busy} onClick={cancelOrder} className="mt-5 rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50">
      {busy ? 'Cancelling…' : 'Cancel order'}
    </button>}

    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Timeline</h2>
      {order.events?.map((event) => <p className="mt-3 text-sm" key={event.id}>{event.to_status} · {new Date(event.created_at).toLocaleString()}</p>)}
    </section>
  </div>;
}
