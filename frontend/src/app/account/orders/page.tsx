'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { commerceFetch } from '@/lib/commerceApi';
import { formatPrice } from '@/lib/market';

type Order = {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number;
  createdAt: string;
};
type OrderPage = { items: Order[]; total: number; page: number; limit: number };

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void commerceFetch<OrderPage>('/api/commerce/orders?page=1&limit=50')
      .then((page) => setOrders(page.items))
      .catch((exception: unknown) => setError(exception instanceof Error ? exception.message : 'Could not load orders.'));
  }, []);

  return <div className="shell page">
    <h1>Your orders</h1>
    {error && <p className="mt-4 rounded bg-amber-50 p-4 text-amber-800">{error}</p>}
    {!error && !orders.length && <p className="mt-4 text-slate-600">No orders yet.</p>}
    <div className="mt-6 grid gap-4">{orders.map((order) => <Link className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" href={`/account/orders/${order.id}`} key={order.id}><div className="flex items-center justify-between gap-4"><div><h2 className="font-bold">{order.orderNo}</h2><p className="mt-2 text-sm text-slate-600">{order.status.replaceAll('_', ' ')}</p></div><strong>{formatPrice(Number(order.grandTotal))}</strong></div></Link>)}</div>
  </div>;
}
