'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { commerceFetch } from '@/lib/commerceApi';
import { formatPrice } from '@/lib/market';

type Event = {
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
  grandTotal: number;
  cancellationReason?: string | null;
  statusEvents: Event[];
};
type Tracking = {
  status: string;
  placedAt?: string | null;
  pickingStartedAt?: string | null;
  packedAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  timeline: Event[];
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    try {
      const [nextOrder, nextTracking] = await Promise.all([
        commerceFetch<Order>(`/api/commerce/orders/${id}`),
        commerceFetch<Tracking>(`/api/commerce/orders/${id}/tracking`),
      ]);
      setOrder(nextOrder);
      setTracking(nextTracking);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load order.');
    }
  };

  useEffect(() => { void load(); }, [id]);

  async function cancel() {
    if (!order || !['PLACED', 'CONFIRMED'].includes(order.status)) return;
    const reason = window.prompt('Why are you cancelling this order?', 'Changed my mind');
    if (!reason?.trim()) return;
    setCancelling(true);
    setError('');
    try {
      await commerceFetch(`/api/commerce/orders/${id}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not cancel order.');
    } finally {
      setCancelling(false);
    }
  }

  if (error && !order) return <div className="shell page"><p className="text-red-700">{error}</p></div>;
  if (!order) return <div className="shell page">Loading order…</div>;

  const timeline = tracking?.timeline ?? order.statusEvents ?? [];
  return <div className="shell page">
    <Link href="/account/orders" className="text-emerald-700">← All orders</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
      <div><h1>{order.orderNo}</h1><p className="mt-2 font-semibold">Status: {order.status.replaceAll('_', ' ')}</p><p className="text-slate-600">Total: {formatPrice(Number(order.grandTotal))}</p></div>
      {['PLACED', 'CONFIRMED'].includes(order.status) && <button onClick={() => void cancel()} disabled={cancelling} className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700">{cancelling ? 'Cancelling…' : 'Cancel order'}</button>}
    </div>
    {error && <p className="mt-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Order timeline</h2>
      {timeline.map((event) => <div className="mt-4 border-l-2 border-emerald-200 pl-4" key={event.id}><b>{event.toStatus.replaceAll('_', ' ')}</b><p className="text-sm text-slate-500">{new Date(event.createdAt).toLocaleString('en-NP')}</p>{event.note && <p className="text-sm text-slate-600">{event.note}</p>}</div>)}
    </section>
  </div>;
}
