'use client';

import { useCallback, useEffect, useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

type CreatorAnalytics = {
  period: { from: string; to: string };
  metrics: Record<string, number | string>;
  channels: Array<{ source_system: string; purchase_events: number; attributed_sales_npr: string; purchasing_customers: number }>;
  daily: Array<{ day: string; visits: number; registrations: number; purchase_events: number; attributed_sales_npr: string }>;
  leaderboard: Array<{ id: string; display_name: string; creator_code: string; status: string; visits: number; registered_customers: number; purchasing_customers: number; purchase_events: number; attributed_sales_npr: string; reward_cost_npr: string }>;
  profitability: { available: boolean; reason: string };
};

const npr = (value: unknown) => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value: unknown) => new Intl.NumberFormat('en-NP').format(Number(value || 0));
const dateValue = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function Metric({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>;
}

export function CreatorAnalyticsDashboard() {
  const [from, setFrom] = useState(dateValue(29));
  const [to, setTo] = useState(dateValue(0));
  const [data, setData] = useState<CreatorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ from, to });
      const response = await resilientFetch(`/api/creator-analytics?${query.toString()}`, { credentials: 'include', cache: 'no-store' });
      const body = await response.json() as CreatorAnalytics & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load creator analytics');
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load creator analytics');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const metrics = data?.metrics;
  const daily = data?.daily ?? [];
  const maxSales = Math.max(1, ...daily.map((item) => Number(item.attributed_sales_npr)));
  const maxTraffic = Math.max(1, ...daily.map((item) => Number(item.visits)));
  const formatPercent = (value: unknown) => `${Number(value || 0).toFixed(1)}%`;

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Marketing intelligence</p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">Creator performance overview</h2>
        <p className="mt-1 text-sm text-slate-600">Track creator acquisition, attributed commerce and reward exposure across online and POS.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>

    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {loading && !data ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading creator performance…</div> : data && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Attributed sales" value={npr(metrics?.attributed_sales_npr)} hint={`${number(metrics?.completed_purchase_events)} completed purchase events`} />
        <Metric title="Purchasing customers" value={number(metrics?.purchasing_customers)} hint={`${formatPercent(metrics?.registration_to_purchase_percent)} of registered referrals purchased`} />
        <Metric title="New registrations" value={number(metrics?.registrations)} hint={`${formatPercent(metrics?.visit_to_registration_percent)} visit-to-registration rate`} />
        <Metric title="Referral visits" value={number(metrics?.visits)} hint={`${number(metrics?.active_creators)} active creators`} />
        <Metric title="Pending rewards" value={npr(metrics?.pending_rewards_npr)} hint="Awaiting hold-period completion" />
        <Metric title="Approved rewards" value={npr(metrics?.approved_rewards_npr)} hint="Approved, not yet marked paid" />
        <Metric title="Paid rewards" value={npr(metrics?.paid_rewards_npr)} hint="Recorded as paid in reward events" />
        <Metric title="Creators in programme" value={number(metrics?.total_creators)} hint="All-time creator accounts" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Daily attributed sales</h3><span className="text-xs text-slate-500">NPR</span></div>
          <div className="mt-5 flex h-40 items-end gap-1 border-b border-slate-200 pb-1">
            {daily.map((item) => <div key={item.day} title={`${item.day}: ${npr(item.attributed_sales_npr)}`} className="group flex h-full min-w-0 flex-1 items-end"><div className="w-full rounded-t-sm bg-emerald-600 group-hover:bg-emerald-700" style={{ height: `${Math.max(2, Number(item.attributed_sales_npr) / maxSales * 100)}%` }} /></div>)}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>{daily[0]?.day ?? from}</span><span>{daily[daily.length - 1]?.day ?? to}</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Referral traffic and conversion</h3>
          <div className="mt-4 space-y-3">
            {daily.slice(-7).map((item) => <div key={item.day} className="grid grid-cols-[76px_1fr_54px] items-center gap-2 text-xs"><span className="text-slate-500">{item.day.slice(5)}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-600" style={{ width: `${Number(item.visits) / maxTraffic * 100}%` }} /></div><span className="text-right font-medium text-slate-700">{number(item.visits)}</span></div>)}
            {!daily.length && <p className="text-sm text-slate-500">No referral activity in this period.</p>}
          </div>
          <p className="mt-4 text-xs text-slate-500">Registrations: {number(metrics?.registrations)} · Purchasing customers: {number(metrics?.purchasing_customers)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Sales by channel</h3>
          <div className="mt-3 space-y-3">
            {data.channels.map((channel) => <div key={channel.source_system} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{channel.source_system === 'POS' ? 'Physical stores (POS)' : 'Online commerce'}</p><p className="text-xs text-slate-500">{number(channel.purchase_events)} purchases · {number(channel.purchasing_customers)} customers</p></div><p className="text-sm font-bold text-slate-900">{npr(channel.attributed_sales_npr)}</p></div>)}
            {!data.channels.length && <p className="text-sm text-slate-500">No attributed purchases in this period.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Profitability measurement</h3>
          <p className="mt-2 text-sm text-amber-900">Attributed revenue and creator reward cost are available. True creator-attributed gross profit, contribution margin and ROI are not yet measurable because order-level cost of goods sold is not connected to this reporting model.</p>
          <p className="mt-2 text-xs text-amber-800">Do not treat attributed sales minus creator rewards as profit. Add product-level cost snapshots and refund adjustments before using profitability to allocate creator budgets.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4"><h3 className="font-semibold text-slate-900">Creator leaderboard</h3><p className="mt-1 text-xs text-slate-500">Ranked by attributed net sales, then purchasing customers.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Creator</th><th className="px-4 py-3 text-right">Visits</th><th className="px-4 py-3 text-right">Registered</th><th className="px-4 py-3 text-right">Buyers</th><th className="px-4 py-3 text-right">Attributed sales</th><th className="px-4 py-3 text-right">Rewards accrued</th></tr></thead>
          <tbody>{data.leaderboard.map((creator, index) => <tr key={creator.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="font-semibold text-slate-900">{index + 1}. {creator.display_name}</div><div className="text-xs text-slate-500">{creator.creator_code} · {creator.status}</div></td><td className="px-4 py-3 text-right tabular-nums">{number(creator.visits)}</td><td className="px-4 py-3 text-right tabular-nums">{number(creator.registered_customers)}</td><td className="px-4 py-3 text-right tabular-nums">{number(creator.purchasing_customers)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{npr(creator.attributed_sales_npr)}</td><td className="px-4 py-3 text-right tabular-nums">{npr(creator.reward_cost_npr)}</td></tr>)}</tbody>
        </table></div>
        {!data.leaderboard.length && <p className="p-6 text-sm text-slate-500">No creators found for this period.</p>}
      </div>
      <p className="text-xs text-slate-500">Reporting window: {data.period.from} to {data.period.to}. Figures exclude purchase events marked REVERSED. Visit, registration and purchase events are counted from their recorded timestamps.</p>
    </>}
  </section>;
}
