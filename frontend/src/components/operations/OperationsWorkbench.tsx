'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useStaffSession } from '@/components/StaffSessionProvider';
import { MARKET } from '@/lib/market';

type Row = Record<string, unknown>;
type Module = { title: string; endpoint?: string; capability: string; description: string; create?: { endpoint: string; label: string; fields: Array<{ name: string; label: string; type?: string; defaultValue?: string }> } };

const modules: Record<string, Module> = {
  dashboard: { title: 'Operations dashboard', capability: 'dashboard.read', description: 'Live store activity, open shifts, receiving, transfers, and reconciliation queues.', endpoint: '/api/shifts/summary' },
  pos: { title: 'Point of sale', capability: 'pos.execute', description: 'Create cash sales and review recent receipts.', endpoint: '/api/pos/sales', create: { endpoint: '/api/pos/sale', label: 'Create cash sale', fields: [{ name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1' }, { name: 'price', label: 'Unit price', type: 'number', defaultValue: '250' }] } },
  orders: { title: 'Orders', capability: 'orders.read', description: 'Review orders available to the store operations team.', endpoint: '/api/web-orders' },
  inventory: { title: 'Inventory overview', capability: 'inventory.read', description: 'Review on-hand batches, expiry, and movement-ready inventory.', endpoint: '/api/batches/inventory' },
  'inventory/batches': { title: 'Inventory batches', capability: 'inventory.read', description: 'Track batch IDs, expiry dates, and quantities.', endpoint: '/api/batches/inventory' },
  'inventory/adjustments': { title: 'Inventory adjustments', capability: 'inventory.adjust', description: 'Adjust stock with an auditable reason and batch reference.', endpoint: '/api/batches/inventory' },
  receiving: { title: 'Receiving', capability: 'procurement.read', description: 'Review purchase-order receipts, partials, damage, and variances.', endpoint: '/api/receiving' },
  transfers: { title: 'Transfers', capability: 'transfers.request', description: 'Review transfer requests and their approval, dispatch, and receipt state.', endpoint: '/api/transfers' },
  shifts: { title: 'Shifts', capability: 'shifts.manage', description: 'Open, monitor, close, and reconcile cash shifts.', endpoint: '/api/shifts', create: { endpoint: '/api/shifts', label: 'Open shift', fields: [{ name: 'opening_cash', label: 'Opening cash', type: 'number', defaultValue: '5000' }] } },
  reconciliation: { title: 'Tender reconciliation', capability: 'reconciliation.manage', description: 'Review tender reconciliation records and variances.', endpoint: '/api/tender-reconciliations' },
  devices: { title: 'Devices and sync', capability: 'devices.manage', description: 'Monitor POS device registration and offline-sync health.', endpoint: '/api/pos-devices/offline' },
};

function text(row: Row, ...keys: string[]) { for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]); return '—'; }

export function OperationsWorkbench({ route }: { route: string }) {
  const { session, hasCapability } = useStaffSession();
  const moduleConfig = modules[route] || modules.dashboard;
  const assignedStoreId = session?.storeAssignment?.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (url: string, options?: RequestInit) => {
    const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
    return body;
  }, []);
  const load = useCallback(async () => {
    if (!moduleConfig.endpoint) return;
    setLoading(true); setError('');
    try {
      const separator = moduleConfig.endpoint.includes('?') ? '&' : '?';
      const scopedEndpoint = assignedStoreId && !moduleConfig.endpoint.includes('/pos-devices/offline')
        ? `${moduleConfig.endpoint}${separator}store_id=${encodeURIComponent(assignedStoreId)}`
        : moduleConfig.endpoint;
      const body = await request(scopedEndpoint); setRows(Array.isArray(body) ? body : [body]);
    }
    catch (err) { setRows([]); setError(err instanceof Error ? err.message : 'Could not load this module'); }
    finally { setLoading(false); }
  }, [assignedStoreId, moduleConfig.endpoint, request]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const summary = useMemo(() => ({ records: rows.length, store: session?.storeAssignment?.name || 'Assigned store', role: session?.role?.name || 'Staff' }), [rows.length, session]);
  if (!hasCapability(moduleConfig.capability)) return <section className="rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">Access unavailable</h1><p className="mt-2 text-slate-600">This staff account does not have <code>{moduleConfig.capability}</code>.</p></section>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      const payload: Row = { store_id: session?.storeAssignment?.id, created_by: session?.user?.id, opened_by: session?.user?.id };
      data.forEach((value, key) => { payload[key] = value === '' ? undefined : Number.isNaN(Number(value)) ? value : Number(value); });
      if (route === 'pos') { payload.sale_number = `OPS-${Date.now()}`; payload.total_amount = Number(payload.quantity) * Number(payload.price); payload.currency = session?.organization?.currencyCode || MARKET.currencyCode; payload.payment_method = 'CASH'; payload.items = [{ quantity: Number(payload.quantity), unit_price: Number(payload.price), line_total: Number(payload.total_amount) }]; }
      await request(moduleConfig.create!.endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setNotice('Action completed successfully.'); event.currentTarget.reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
  }

  return <div className="space-y-6"><div><p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Store operations</p><h1 className="mt-1 text-3xl font-bold text-slate-950">{moduleConfig.title}</h1><p className="mt-2 text-slate-600">{moduleConfig.description}</p></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Records</p><p className="mt-1 text-2xl font-bold">{summary.records}</p></div><div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Store</p><p className="mt-1 font-semibold">{summary.store}</p></div><div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Role</p><p className="mt-1 font-semibold">{summary.role}</p></div></div>{moduleConfig.create && <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-3">{moduleConfig.create.fields.map(field => <label key={field.name} className="text-sm font-medium text-slate-700">{field.label}<input required name={field.name} type={field.type || 'text'} defaultValue={field.defaultValue} min={field.type === 'number' ? '0' : undefined} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>)}<button className="self-end rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">{moduleConfig.create.label}</button></form>}{(error || notice) && <div className={`rounded-lg border px-4 py-3 ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</div>}<section className="rounded-2xl bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Live records</h2><button onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Refresh</button></div>{loading ? <p className="py-8 text-center text-slate-500">Loading…</p> : rows.length === 0 ? <p className="rounded-lg bg-slate-50 py-8 text-center text-slate-500">No records are available for this store.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.slice(0, 30).map((row, index) => <article key={`${text(row, 'id', 'uuid')}-${index}`} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{text(row, 'sale_number', 'shift_number', 'transfer_number', 'receiving_number', 'device_id', 'batch_id', 'id')}</h3><p className="mt-2 text-sm text-slate-600">Status: {text(row, 'status', 'sale_status', 'shift_status', 'transfer_status', 'sync_status')}</p><p className="text-sm text-slate-600">Amount / quantity: {text(row, 'total_amount', 'opening_cash', 'quantity', 'available_quantity')}</p></article>)}</div>}</section></div>;
}
