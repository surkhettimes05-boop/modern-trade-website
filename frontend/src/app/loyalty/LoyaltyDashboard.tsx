'use client';

import { useEffect, useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

type Entry = { id: string; points_signed: number; effective_timestamp: string; source_type: string; source_amount: string | null; balance_after: number; reason: string };
type LoyaltyData = {
  enrolled: boolean;
  currency: 'NPR';
  account?: { current_points: number; earned_points: number; redeemed_points: number; program_name: string; earn_npr_per_point: number; redemption_min_points: number; redemption_max_points: number };
  history?: Entry[];
  explanation?: string;
};

const csrfToken = () => decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');

export default function LoyaltyDashboard() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    resilientFetch('/api/loyalty/me', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) throw new Error('Sign in with your Nepal mobile number and OTP to view loyalty.');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load loyalty');
        if (active) setData(payload);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load loyalty'); });
    return () => { active = false; };
  }, []);

  async function enroll() {
    setBusy(true); setError('');
    try {
      const response = await resilientFetch('/api/loyalty/enroll', { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': csrfToken() } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Enrollment failed');
      setData(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enrollment failed'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-gradient-to-br from-red-700 via-red-600 to-rose-500 p-8 text-white shadow-xl sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-100">Nepal pilot · NPR</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">StoreSync Rewards</h1>
          <p className="mt-4 max-w-2xl text-lg text-red-50">Earn points only after a POS sale is completed or a cash-on-delivery order is delivered. Every adjustment remains visible in your history.</p>
        </section>
        {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">{error}</div>}
        {!data && !error && <p role="status" className="rounded-xl bg-white p-6 shadow-sm">Loading your loyalty account…</p>}
        {data && !data.enrolled && <section className="rounded-2xl bg-white p-8 shadow-sm"><h2 className="text-2xl font-semibold">Join Nepal Rewards</h2><p className="mt-2 text-slate-600">Your verified Nepal mobile session identifies your account. One membership is created for your home store’s organization.</p><button onClick={enroll} disabled={busy} className="mt-6 rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60">{busy ? 'Enrolling…' : 'Enroll with verified mobile'}</button></section>}
        {data?.enrolled && data.account && <>
          <section aria-label="Points summary" className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Available</p><p className="mt-2 text-4xl font-bold">{data.account.current_points}</p><p className="text-sm text-slate-500">points</p></div>
            <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Lifetime earned</p><p className="mt-2 text-3xl font-bold">{data.account.earned_points}</p></div>
            <div className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">Redeemed</p><p className="mt-2 text-3xl font-bold">{data.account.redeemed_points}</p></div>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">How points work</h2><p className="mt-2 text-slate-600">{data.explanation}</p><p className="mt-2 text-sm text-slate-500">Redemptions: {data.account.redemption_min_points}–{data.account.redemption_max_points} points, never more than the linked sale total.</p></section>
          <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Points history</h2>
            {!data.history?.length ? <p className="mt-4 text-slate-600">No points activity yet.</p> : <ul className="mt-4 divide-y divide-slate-200">{data.history.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-4 py-4"><div><p className="font-medium">{entry.reason}</p><p className="text-sm text-slate-500">{entry.source_type.replaceAll('_', ' ')} · {new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' }).format(new Date(entry.effective_timestamp))}</p>{entry.source_amount && <p className="text-sm text-slate-500">Purchase: NPR {Number(entry.source_amount).toLocaleString('en-NP')}</p>}</div><div className="text-right"><p className={`text-lg font-bold ${entry.points_signed >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{entry.points_signed >= 0 ? '+' : ''}{entry.points_signed}</p><p className="text-xs text-slate-500">Balance {entry.balance_after}</p></div></li>)}</ul>}
          </section>
        </>}
      </div>
    </main>
  );
}
