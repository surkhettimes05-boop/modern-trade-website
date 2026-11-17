'use client';

import { useCallback, useEffect, useState } from 'react';

type Creator = { id: string; code: string; name: string; phone_masked: string; referral_slug: string; referral_url: string };
type Purchase = { source_system: string; source_transaction_number: string; eligible_spend_npr: string; reward_amount_npr: string; event_status: string; eligible_at: string; available_at: string };
type Dashboard = {
  summary: { clicks: number; registrations: number; purchases: number; purchasing_customers: number; attributed_sales_npr: string; gross_rewards_npr: string };
  ledger: { balance_npr: string; earned_npr: string; reversed_npr: string; paid_npr: string };
  purchases: Purchase[];
  profitability_status: string;
};
const money = (v: string | number) => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 2 }).format(Number(v || 0));

export default function CreatorPortalPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp' | 'dashboard'>('phone');
  const [creator, setCreator] = useState<Creator | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch('/api/creator-portal/me', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/creator-portal/overview', { credentials: 'include', cache: 'no-store' }),
    ]);
    if (!a.ok || !b.ok) throw new Error('Creator login required.');
    const me = await a.json(); const overview = await b.json();
    setCreator(me.creator); setData(overview); setStage('dashboard');
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/creator-portal/otp/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Unable to request a login code.');
      setStage('otp');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to request a login code.'); }
    finally { setBusy(false); }
  }
  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/creator-portal/otp/verify', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, otp_code: code }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Invalid or expired code.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to verify code.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    const raw = document.cookie.split('; ').find((v) => v.startsWith('pasalho_creator_csrf='))?.split('=').slice(1).join('=') || '';
    await fetch('/api/creator-portal/logout', { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': decodeURIComponent(raw) } });
    setCreator(null); setData(null); setStage('phone');
  }

  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-slate-900">
    {stage !== 'dashboard' ? <section className="mx-auto mt-12 max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Pasalho Creator Programme</p>
      <h1 className="mt-3 text-3xl font-bold">Creator sign in</h1>
      <p className="mt-2 text-sm text-slate-600">Use the Nepal mobile number registered with your creator profile.</p>
      {stage === 'phone' ? <form onSubmit={requestOtp} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Mobile number<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" autoComplete="tel" inputMode="tel" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3" required /></label>
        <button disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send login code'}</button>
      </form> : <form onSubmit={verifyOtp} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">6-digit code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-widest" required /></label>
        <button disabled={busy || code.length !== 6} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and continue'}</button>
        <button type="button" onClick={() => setStage('phone')} className="w-full text-sm text-slate-600">Change number</button>
      </form>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section> : creator && data && <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Pasalho Creator Programme</p><h1 className="mt-2 text-3xl font-bold">Welcome, {creator.name}</h1><p className="mt-1 text-sm text-slate-500">Creator ID: {creator.code} · {creator.phone_masked}</p></div>
        <button onClick={logout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Sign out</button>
      </header>
      <section className="mt-8 rounded-2xl bg-slate-900 p-6 text-white">
        <p className="text-sm text-slate-300">Your referral link</p><p className="mt-2 break-all text-lg font-semibold">{creator.referral_url || `/r/\${creator.referral_slug}`}</p>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={() => void navigator.clipboard.writeText(creator.referral_url)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900">Copy link</button><a href={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=\${encodeURIComponent(creator.referral_url)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/40 px-4 py-2 text-sm">Open QR code</a></div>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Referral clicks', data.summary.clicks],
          ['Registered customers', data.summary.registrations],
          ['Attributed purchases', data.summary.purchases],
          ['Attributed sales', money(data.summary.attributed_sales_npr)],
        ].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></article>)}
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Net rewards ledger (includes pending)</p><p className="mt-2 text-3xl font-bold">{money(data.ledger.balance_npr)}</p><p className="mt-2 text-xs text-slate-500">Earned {money(data.ledger.earned_npr)} · Reversed {money(data.ledger.reversed_npr)} · Paid {money(data.ledger.paid_npr)} · Cash-out settlement is not enabled yet</p></article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="font-semibold text-amber-900">Profitability reporting is not ready</p><p className="mt-2 text-sm text-amber-800">Sales and reward figures are separate. Pasalho has not completed order-level COGS and refund reconciliation, so this dashboard does not claim creator profit or ROI.</p></article>
      </section>
      <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5"><h2 className="font-bold">Recent attributed purchases</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Channel</th><th className="p-3">Order</th><th className="p-3">Sales</th><th className="p-3">Reward</th><th className="p-3">Status</th></tr></thead><tbody>{data.purchases.map((p, i) => <tr key={p.source_system + p.source_transaction_number + i} className="border-t border-slate-100"><td className="p-3">{new Date(p.eligible_at).toLocaleDateString('en-NP')}</td><td className="p-3">{p.source_system}</td><td className="p-3">{p.source_transaction_number || '—'}</td><td className="p-3">{money(p.eligible_spend_npr)}</td><td className="p-3">{money(p.reward_amount_npr)}</td><td className="p-3">{p.event_status}</td></tr>)}</tbody></table></div>
        {!data.purchases.length && <p className="p-5 text-sm text-slate-500">No attributed purchases yet. Share your link to start tracking.</p>}
      </section>
    </>}
  </main>;
}
