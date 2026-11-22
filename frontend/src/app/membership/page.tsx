'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { resilientFetch } from '@/lib/resilientFetch';
import { useShop } from '@/components/CommerceClient';

type Membership = {
  id: string;
  membership_number: number;
  founding_number: number | null;
  tier_key: 'REGISTERED_MEMBER' | 'FOUNDING_1000';
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  enrolled_at: string;
};

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

export default function MembershipPage() {
  const { selectedStore, items, reloadMemberPricing, refreshPricingQuote } = useShop();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadMembership() {
    const response = await resilientFetch('/api/membership/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401) {
      setAuthenticated(false);
      setMembership(null);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not load membership.');
    setAuthenticated(true);
    setMembership(body.membership || null);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadMembership()
        .catch((reason) => {
          if (active) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not load membership.',
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const response = await resilientFetch('/api/membership/enroll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify(selectedStore ? { store_id: selectedStore.id } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Enrollment failed.');
      setMembership(body.membership);
      await reloadMemberPricing();
      if (items.length) {
        try {
          await refreshPricingQuote();
        } catch {
          setError('Membership is active, but pricing is temporarily unavailable. Checkout will remain blocked until a valid quote is available.');
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enrollment failed.');
    } finally {
      setBusy(false);
    }
  }

  const active = membership?.status === 'ACTIVE';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-100">Pasalho Membership</p>
          <h1 className="mt-3 text-3xl font-bold">Your membership card</h1>
          <p className="mt-3 max-w-xl text-emerald-50">Free membership for PASALHO customers. Member pricing is not active yet; current public offers are listed separately.</p>
        </section>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
        {loading && <p role="status" className="rounded-xl bg-white p-6">Loading membership…</p>}
        {!loading && authenticated === false && <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Sign in to continue</h2><p className="mt-2 text-slate-600">Membership enrollment is available after your mobile number is verified by OTP.</p><Link className="mt-5 inline-block rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white" href="/account?next=/membership">Sign in with OTP</Link></section>}
        {!loading && authenticated && !membership && <section className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Join for free</h2><p className="mt-2 text-slate-600">Enrollment uses your verified account and selected home store. Your tier and status are assigned by Pasalho.</p>{!selectedStore && <p role="alert" className="mt-3 text-amber-800">Choose an open store before enrolling.</p>}<button disabled={busy || !selectedStore} onClick={enroll} className="mt-5 rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Enrolling…' : 'Enroll for free'}</button></section>}
        {!loading && membership && <section className="grid gap-6 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Membership number</p>
            <p className="mt-1 text-3xl font-bold">{membership.membership_number}</p>
            <p className="mt-5"><span className="text-slate-500">Tier</span><strong className="ml-3">{membership.tier_key === 'FOUNDING_1000' ? 'Founding 1,000' : 'Registered Member'}</strong></p>
            {membership.founding_number !== null && <p className="mt-1 text-sm text-slate-600">Founding member #{membership.founding_number}</p>}
            <p className="mt-2"><span className="text-slate-500">Status</span><strong className={`ml-3 ${active ? 'text-emerald-700' : 'text-amber-700'}`}>{membership.status}</strong></p>
            <p className="mt-5 text-sm text-slate-600">{active ? 'Show this QR membership reference to PASALHO staff. Any active public offers are shown separately.' : 'Your membership is not active.'}</p>
          </div>
          <div className="justify-self-center rounded-xl border border-slate-200 bg-white p-4">
            <QRCodeSVG value={membership.id} size={160} level="M" aria-label="Membership QR reference" />
            <p className="mt-2 text-center text-xs text-slate-500">Membership reference</p>
          </div>
        </section>}
      </div>
    </main>
  );
}
