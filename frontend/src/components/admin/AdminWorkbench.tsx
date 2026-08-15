'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStaffSession } from '@/components/StaffSessionProvider';

type RecordValue = Record<string, unknown>;
type Resource = { title: string; endpoint?: string; capability?: string; fields?: string[]; unavailable?: string };

const resources: Record<string, Resource> = {
  dashboard: { title: 'Dashboard', endpoint: '/api/admin/dashboard', capability: 'dashboard.read' },
  'catalog/products': { title: 'Products', endpoint: '/api/admin/products', capability: 'catalog.read', fields: ['sku', 'name_en', 'description_en'] },
  'catalog/categories': { title: 'Categories', endpoint: '/api/public/categories', capability: 'catalog.read', unavailable: 'Category management is read-only until the category CRUD API is enabled.' },
  'catalog/media': { title: 'Media', endpoint: '/api/admin/products', capability: 'catalog.read', unavailable: 'Media management is not enabled yet; product media remains managed on product records.' },
  'content/pages': { title: 'Content Pages', endpoint: '/api/admin/pages', capability: 'content.read', fields: ['slug', 'title_en', 'content_en'] },
  'merchandising/promotions': { title: 'Promotions', endpoint: '/api/promotions', capability: 'promotions.read' },
  'commerce/orders': { title: 'Orders', endpoint: '/api/web-orders', capability: 'orders.read' },
  'commerce/returns': { title: 'Returns', endpoint: '/api/returns', capability: 'orders.read' },
  'commerce/payments': { title: 'Payments', endpoint: '/api/payments/intents', capability: 'payments.read' },
  customers: { title: 'Customers', endpoint: '/api/customers', capability: 'customers.read' },
  'customers/loyalty': { title: 'Customer Loyalty', endpoint: '/api/loyalty', capability: 'loyalty.manage' },
  stores: { title: 'Stores', endpoint: '/api/admin/stores', capability: 'stores.read', fields: ['name_en', 'address_en', 'phone', 'email'] },
  inventory: { title: 'Inventory', endpoint: '/api/batches', capability: 'inventory.read' },
  'procurement/suppliers': { title: 'Suppliers', endpoint: '/api/suppliers', capability: 'procurement.read' },
  'procurement/purchase-orders': { title: 'Purchase Orders', endpoint: '/api/purchase-orders', capability: 'procurement.read' },
  'procurement/receiving': { title: 'Receiving', endpoint: '/api/receiving', capability: 'procurement.read' },
  'organization/staff': { title: 'Staff', endpoint: '/api/staff', capability: 'staff.read' },
  'organization/roles': { title: 'Roles', endpoint: '/api/roles', capability: 'roles.manage', unavailable: 'Role management is currently read-only through the capability seed.' },
  reports: { title: 'Reports', endpoint: '/api/analytics/sales', capability: 'reports.sales' },
  audit: { title: 'Audit', endpoint: '/api/audit-reports', capability: 'audit.read' },
  settings: { title: 'Settings', endpoint: '/api/operations-auth/session', capability: 'settings.manage' },
};

function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function AdminWorkbench() {
  const pathname = usePathname();
  const { session, hasCapability } = useStaffSession();
  const key = pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '') || 'dashboard';
  const resource = resources[key] || { title: 'Admin workspace', unavailable: 'This admin destination is not configured yet.' };
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [dashboard, setDashboard] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(Boolean(resource.endpoint));
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!resource.endpoint) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(resource.endpoint, { credentials: 'include', cache: 'no-store' });
      const body = await response.json() as RecordValue | RecordValue[];
      if (!response.ok) throw new Error(String((body as RecordValue).error || 'Unable to load data'));
      if (key === 'dashboard') setDashboard(body as RecordValue);
      else setRecords(Array.isArray(body) ? body : Array.isArray((body as RecordValue).items) ? (body as RecordValue).items as RecordValue[] : [body]);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load data'); }
    finally { setLoading(false); }
  }, [key, resource.endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => records.filter((record) => JSON.stringify(record).toLowerCase().includes(search.toLowerCase())), [records, search]);
  const canWrite = Boolean(resource.fields?.length && resource.capability && hasCapability(resource.capability.replace('.read', '.write')));

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resource.endpoint || !resource.fields) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(resource.fields.map((field) => [field, String(form.get(field) || '')]));
    const csrf = document.cookie.split('; ').find((entry) => entry.startsWith('csrf_token='))?.split('=')[1];
    const response = await fetch(resource.endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf || '' }, body: JSON.stringify(payload) });
    const body = await response.json() as RecordValue;
    if (!response.ok) { setError(String(body.error || 'Create failed')); return; }
    setNotice(`${resource.title.slice(0, -1)} created successfully.`); (event.currentTarget as HTMLFormElement).reset(); await load();
  }

  if (resource.capability && !hasCapability(resource.capability)) return <div className="rounded-xl border border-red-200 bg-red-50 p-8"><h1 className="text-xl font-semibold text-red-900">Forbidden</h1><p className="mt-2 text-sm text-red-700">Your role does not include {resource.capability}.</p><Link className="mt-4 inline-block text-sm font-semibold text-red-900 underline" href="/admin/dashboard">Return to dashboard</Link></div>;

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-blue-600">NOVA MART ADMIN</p><h1 className="mt-1 text-3xl font-bold text-gray-950">{resource.title}</h1><p className="mt-2 text-sm text-gray-600">{session?.organization?.name || 'Nepal organization'} · {session?.organization?.currencyCode || 'NPR'} · {session?.organization?.locale || 'en-NP'}</p></div><Link href="/admin/dashboard" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Dashboard</Link></div>
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {resource.unavailable && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{resource.unavailable}</div>}
    {key === 'dashboard' && Boolean(dashboard?.metrics) && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(dashboard?.metrics as RecordValue).map(([metric, value]) => <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" key={metric}><p className="text-sm text-gray-500">{label(metric)}</p><p className="mt-2 text-3xl font-bold text-gray-950">{String(value)}</p></div>)}</div>}
    {resource.endpoint && key !== 'dashboard' && <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4"><input aria-label="Search records" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${resource.title.toLowerCase()}…`} className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm" /><span className="text-sm text-gray-500">{filtered.length} records</span></div>{canWrite && <form onSubmit={createRecord} className="grid gap-3 border-b border-gray-200 bg-gray-50 p-4 md:grid-cols-4">{resource.fields?.map((field) => <label className="text-xs font-semibold text-gray-600" key={field}>{label(field)}<input name={field} required={field !== 'description_en' && field !== 'email'} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal" /></label>)}<button className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Create</button></form>}{loading ? <p className="p-8 text-sm text-gray-500">Loading…</p> : error ? <p role="alert" className="p-8 text-sm text-red-700">{error}</p> : filtered.length === 0 ? <p className="p-8 text-sm text-gray-500">No records found.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Record</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{filtered.slice(0, 100).map((record, index) => <tr className="border-t border-gray-100" key={String(record.id || record.sku || index)}><td className="px-4 py-3 font-medium text-gray-900">{String(record.name_en || record.name || record.title_en || record.slug || record.supplier_name || record.username || record.id || `Record ${index + 1}`)}</td><td className="max-w-xl truncate px-4 py-3 text-gray-600">{Object.entries(record).filter(([field]) => !['id', 'name_en', 'name', 'title_en', 'slug', 'supplier_name', 'username'].includes(field)).slice(0, 3).map(([field, value]) => `${label(field)}: ${String(value ?? '—')}`).join(' · ')}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{String(record.status || record.approval_status || 'Active')}</span></td></tr>)}</tbody></table></div>}</div>}
  </section>;
}
