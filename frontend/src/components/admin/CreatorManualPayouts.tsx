'use client';

import { useCallback, useEffect, useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

type Eligible = { creator_id: string; display_name: string; creator_code: string; approved_balance_npr: string; approved_purchase_events: number };
type Settlement = { id: string; creator_id: string; display_name: string; creator_code: string; amount_npr: string; payment_method: string; payment_reference: string; note: string | null; created_by: string; settled_at: string };
type Payload = { eligible: Eligible[]; settlements: Settlement[]; payoutsEnabled: boolean };
const money = (value: string) => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(Number(value || 0));

export function CreatorManualPayouts() {
  const [data, setData] = useState<Payload>({ eligible: [], settlements: [], payoutsEnabled: false });
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await resilientFetch('/api/creator-payouts', { credentials: 'include', cache: 'no-store' });
    const body = await response.json() as Payload & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load creator payouts');
    setData(body);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(load).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load payouts');
    });
    return () => { active = false; };
  }, [load]);

  async function recordSettlement(creator: Eligible) {
    const reference = (refs[creator.creator_id] || '').trim();
    if (reference.length < 2) { setError('Enter the bank, wallet or cash receipt reference before recording payment.'); return; }
    const confirmed = window.confirm(`Confirm that NPR ${Number(creator.approved_balance_npr).toFixed(2)} has already been paid to ${creator.display_name}? This records the settlement; it does not transfer money.`);
    if (!confirmed) return;
    setBusy(creator.creator_id); setError(''); setNotice('');
    try {
      const csrf = document.cookie.split('; ').find((entry) => entry.startsWith('csrf_token='))?.split('=')[1];
      const response = await resilientFetch(`/api/creators/${creator.creator_id}/payouts`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf || '' },
        body: JSON.stringify({
          payment_method: methods[creator.creator_id] || 'BANK_TRANSFER',
          payment_reference: reference,
          note: notes[creator.creator_id] || undefined,
          idempotency_key: `manual-payout:${crypto.randomUUID()}`,
        }),
      });
      const body = await response.json() as { error?: string; payout?: Settlement };
      if (!response.ok) throw new Error(body.error || 'Unable to record payout');
      setNotice(`Recorded ${money(body.payout?.amount_npr || creator.approved_balance_npr)} settlement for ${creator.display_name}.`);
      setRefs((current) => ({ ...current, [creator.creator_id]: '' }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to record payout'); }
    finally { setBusy(''); }
  }

  return <section className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Finance operations</p><h3 className="mt-1 text-lg font-bold text-slate-950">Manual creator settlements</h3><p className="mt-1 text-sm text-slate-600">Only rewards already approved after the hold period are eligible. Pay the creator outside this dashboard, then record the actual payment reference here. This screen does not transfer money.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!data.payoutsEnabled && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Creator payouts are disabled pending an approved payment and reconciliation procedure. Reward balances remain visible in creator reports.</p>}
    {data.payoutsEnabled && <div className="space-y-3">
      <h4 className="font-semibold text-slate-900">Approved balances awaiting settlement</h4>
      {!data.eligible.length && <p className="text-sm text-slate-500">No approved creator rewards are awaiting payment.</p>}
      {data.eligible.map((creator) => <div key={creator.creator_id} className="grid gap-3 rounded-xl border border-slate-200 p-3 lg:grid-cols-[1fr_1fr_1.2fr_1fr_auto] lg:items-end">
        <div><p className="font-semibold text-slate-900">{creator.display_name}</p><p className="text-xs text-slate-500">{creator.creator_code} · {creator.approved_purchase_events} approved purchases</p><p className="mt-1 font-bold text-slate-900">{money(creator.approved_balance_npr)}</p></div>
        <label className="text-xs font-semibold text-slate-600">Payment method<select value={methods[creator.creator_id] || 'BANK_TRANSFER'} onChange={(event) => setMethods((current) => ({ ...current, [creator.creator_id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="WALLET">Wallet</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Actual payment reference<input value={refs[creator.creator_id] || ''} onChange={(event) => setRefs((current) => ({ ...current, [creator.creator_id]: event.target.value }))} placeholder="Bank txn ID / receipt no." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Note (optional)<input value={notes[creator.creator_id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [creator.creator_id]: event.target.value }))} placeholder="Settlement note" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <button type="button" disabled={busy === creator.creator_id || !refs[creator.creator_id]?.trim()} onClick={() => void recordSettlement(creator)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === creator.creator_id ? 'Recording…' : 'Record paid'}</button>
      </div>)}
    </div>}
    <div className="overflow-x-auto"><h4 className="mb-2 font-semibold text-slate-900">Recent settlements</h4><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Creator</th><th className="p-3">Amount</th><th className="p-3">Method / reference</th><th className="p-3">Recorded by</th><th className="p-3">Date</th></tr></thead><tbody>{data.settlements.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-3 font-medium">{item.display_name}</td><td className="p-3 font-semibold">{money(item.amount_npr)}</td><td className="p-3">{item.payment_method} · {item.payment_reference}</td><td className="p-3">{item.created_by}</td><td className="p-3">{new Date(item.settled_at).toLocaleString('en-NP')}</td></tr>)}{!data.settlements.length && <tr><td colSpan={5} className="p-4 text-sm text-slate-500">No settlements recorded yet.</td></tr>}</tbody></table></div>
  </section>;
}
