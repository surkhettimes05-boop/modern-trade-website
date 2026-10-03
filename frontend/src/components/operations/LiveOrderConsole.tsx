'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, PackageCheck, Truck, Volume2, VolumeX } from 'lucide-react';
import { useStaffSession } from '@/components/StaffSessionProvider';
import { resilientFetch } from '@/lib/resilientFetch';

type OrderRow = Record<string, unknown>;

const terminalStatuses = new Set(['DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED']);
const alertStatuses = new Set(['PENDING', 'PENDING_PAYMENT']);

const nextStatus: Record<string, { status: string; label: string }> = {
  PENDING: { status: 'CONFIRMED', label: 'Accept & start' },
  PENDING_PAYMENT: { status: 'CONFIRMED', label: 'Accept & start' },
  CONFIRMED: { status: 'PICKING', label: 'Start picking' },
  PICKING: { status: 'PACKED', label: 'Mark packed' },
  PACKED: { status: 'OUT_FOR_DELIVERY', label: 'Send for delivery' },
  OUT_FOR_DELIVERY: { status: 'DELIVERED', label: 'Mark delivered' },
};

function value(row: OrderRow, key: string, fallback = '—') {
  const current = row[key];
  return current === undefined || current === null || current === '' ? fallback : String(current);
}

function readCsrfToken() {
  if (typeof document === 'undefined') return '';
  return document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] || '';
}

function formatMoney(amount: unknown, currency: unknown) {
  const number = Number(amount || 0);
  const code = String(currency || 'NPR');
  try {
    return new Intl.NumberFormat('en-NP', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(number);
  } catch {
    return `${code} ${number.toFixed(0)}`;
  }
}

async function playAlarmTone() {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  await context.resume();
  const now = context.currentTime;
  [0, 0.26, 0.52].forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.2);
  });
  window.setTimeout(() => void context.close(), 1100);
}

export function LiveOrderConsole() {
  const { session, hasCapability } = useStaffSession();
  const storeId = session?.storeAssignment?.id;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const firstLoad = useRef(true);
  const lastAlertId = useRef('');

  const loadOrders = useCallback(async (silent = false) => {
    if (!storeId) return;
    if (!silent) setLoading(true);
    try {
      const response = await resilientFetch(
        `/api/web-orders?store_id=${encodeURIComponent(storeId)}&limit=100`,
        { credentials: 'include', cache: 'no-store', timeoutMs: 8000, retries: 1 },
      );
      const body = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(body.error || 'Could not load orders');
      setOrders(Array.isArray(body) ? body : []);
      setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load orders');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    const saved = window.localStorage.getItem('pasalho-order-sound-enabled');
    const restoreSound = window.setTimeout(() => setSoundEnabled(saved === 'true'), 0);
    void loadOrders();
    const interval = window.setInterval(() => void loadOrders(true), 2000);
    const onVisible = () => { if (document.visibilityState === 'visible') void loadOrders(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(restoreSound);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadOrders]);

  const openOrders = useMemo(
    () => orders.filter((order) => !terminalStatuses.has(value(order, 'status', ''))),
    [orders],
  );
  const alertOrder = useMemo(
    () => openOrders.find((order) => alertStatuses.has(value(order, 'status', ''))) || null,
    [openOrders],
  );

  useEffect(() => {
    const id = alertOrder ? value(alertOrder, 'id', '') : '';
    if (!id) {
      lastAlertId.current = '';
      firstLoad.current = false;
      return;
    }
    const changed = id !== lastAlertId.current;
    lastAlertId.current = id;
    if (soundEnabled && (changed || firstLoad.current)) void playAlarmTone();
    firstLoad.current = false;
  }, [alertOrder, soundEnabled]);

  useEffect(() => {
    if (!alertOrder || !soundEnabled) return;
    const interval = window.setInterval(() => void playAlarmTone(), 10000);
    return () => window.clearInterval(interval);
  }, [alertOrder, soundEnabled]);

  const enableSound = useCallback(async () => {
    try {
      await playAlarmTone();
      setSoundEnabled(true);
      window.localStorage.setItem('pasalho-order-sound-enabled', 'true');
    } catch {
      setError('Browser blocked sound. Click the sound button again and allow audio.');
    }
  }, []);

  const disableSound = useCallback(() => {
    setSoundEnabled(false);
    window.localStorage.setItem('pasalho-order-sound-enabled', 'false');
  }, []);

  const transition = useCallback(async (order: OrderRow, status: string) => {
    const id = value(order, 'id', '');
    if (!id) return;
    setBusyOrderId(id);
    setError('');
    try {
      const response = await resilientFetch(`/api/web-orders/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': readCsrfToken(),
        },
        body: JSON.stringify({ status }),
        timeoutMs: 10000,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Order update failed');
      await loadOrders(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order update failed');
    } finally {
      setBusyOrderId('');
    }
  }, [loadOrders]);

  if (!storeId) {
    return <section className="rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">Orders</h1><p className="mt-2 text-slate-600">This staff account needs a store assignment before it can receive orders.</p></section>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Pasalho store console</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Live online orders</h1>
          <p className="mt-2 text-slate-600">New orders appear automatically. No refresh is required.</p>
        </div>
        <button
          type="button"
          onClick={() => void (soundEnabled ? disableSound() : enableSound())}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {soundEnabled ? 'Order sound on' : 'Enable order sound'}
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Open orders</p><p className="mt-1 text-3xl font-bold">{openOrders.length}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Waiting acceptance</p><p className="mt-1 text-3xl font-bold">{openOrders.filter((order) => alertStatuses.has(value(order, 'status', ''))).length}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Store</p><p className="mt-2 font-semibold">{session?.storeAssignment?.name || 'Assigned store'}</p></div>
      </div>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="text-xl font-bold">Fulfilment queue</h2><p className="text-sm text-slate-500">Auto-refreshes every 2 seconds.</p></div>
          <button type="button" onClick={() => void loadOrders()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Refresh now</button>
        </div>
        {loading ? <p className="py-10 text-center text-slate-500">Loading orders…</p> : openOrders.length === 0 ? (
          <div className="rounded-xl bg-slate-50 py-12 text-center"><CheckCircle2 className="mx-auto text-emerald-600" /><h3 className="mt-3 font-semibold">No open orders</h3><p className="mt-1 text-sm text-slate-500">The next customer order will appear here automatically.</p></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {openOrders.map((order) => {
              const status = value(order, 'status', '');
              const action = nextStatus[status];
              const id = value(order, 'id', '');
              return (
                <article key={id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order</p><h3 className="mt-1 text-lg font-bold">{value(order, 'order_number')}</h3></div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-slate-500">Customer</p><p className="font-semibold">{value(order, 'shipping_name')}</p></div>
                    <div><p className="text-slate-500">Total</p><p className="font-semibold">{formatMoney(order.total_amount, order.currency)}</p></div>
                    <div><p className="text-slate-500">Payment</p><p className="font-semibold">{value(order, 'payment_method')} · {value(order, 'payment_status')}</p></div>
                    <div><p className="text-slate-500">Fulfilment</p><p className="font-semibold">{value(order, 'delivery_type')}</p></div>
                  </div>
                  {action && hasCapability('orders.fulfil') && (
                    <button
                      type="button"
                      disabled={busyOrderId === id}
                      onClick={() => void transition(order, action.status)}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-60"
                    >
                      {status === 'PACKED' ? <Truck size={18} /> : <PackageCheck size={18} />}
                      {busyOrderId === id ? 'Updating…' : action.label}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {alertOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="new-order-title">
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600"><BellRing className="animate-pulse" size={30} /><p className="text-sm font-black uppercase tracking-[0.18em]">New order</p></div>
            <h2 id="new-order-title" className="mt-4 text-3xl font-black text-slate-950">{value(alertOrder, 'order_number')}</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5">
              <div><p className="text-xs uppercase text-slate-500">Customer</p><p className="mt-1 font-bold">{value(alertOrder, 'shipping_name')}</p></div>
              <div><p className="text-xs uppercase text-slate-500">Total</p><p className="mt-1 font-bold">{formatMoney(alertOrder.total_amount, alertOrder.currency)}</p></div>
              <div><p className="text-xs uppercase text-slate-500">Payment</p><p className="mt-1 font-bold">{value(alertOrder, 'payment_method')}</p></div>
              <div><p className="text-xs uppercase text-slate-500">Type</p><p className="mt-1 font-bold">{value(alertOrder, 'delivery_type')}</p></div>
            </div>
            {!soundEnabled && <button type="button" onClick={() => void enableSound()} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><Volume2 size={17} /> Enable repeating order sound</button>}
            <button
              type="button"
              disabled={busyOrderId === value(alertOrder, 'id', '') || !hasCapability('orders.fulfil')}
              onClick={() => void transition(alertOrder, 'CONFIRMED')}
              className="mt-6 w-full rounded-2xl bg-emerald-700 px-5 py-4 text-lg font-black text-white disabled:opacity-60"
            >
              {busyOrderId === value(alertOrder, 'id', '') ? 'Accepting…' : 'ACCEPT & START ORDER'}
            </button>
            {!hasCapability('orders.fulfil') && <p className="mt-3 text-center text-sm text-red-700">Your role can view orders but cannot fulfil them.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
