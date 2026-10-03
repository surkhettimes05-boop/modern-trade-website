'use client';

import Link from 'next/link';
import { useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const response = await resilientFetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send your message');
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send your message');
    }
  };

  if (submitted) {
    return (
      <div className="shell page max-w-2xl">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-900">Message received</h1>
          <p className="mt-3 text-emerald-800">The Pasalho team will review your message.</p>
          <Link className="primary-btn mt-6" href="/">Back to Pasalho</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="shell page max-w-5xl">
      <h1 className="text-4xl font-bold">Contact Pasalho</h1>
      <p className="mt-3 text-lg text-slate-600">
        Questions about an order, supplier partnership, store, or wholesale opportunity? Send us a message here.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <label className="grid gap-1 text-sm font-semibold">Name
            <input required maxLength={255} className="rounded-lg border border-slate-300 p-3" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Email
            <input required type="email" className="rounded-lg border border-slate-300 p-3" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Phone <span className="font-normal text-slate-500">(optional)</span>
            <input type="tel" className="rounded-lg border border-slate-300 p-3" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Subject
            <input required maxLength={255} className="rounded-lg border border-slate-300 p-3" value={formData.subject} onChange={(event) => setFormData({ ...formData, subject: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Message
            <textarea required maxLength={5000} rows={5} className="rounded-lg border border-slate-300 p-3" value={formData.message} onChange={(event) => setFormData({ ...formData, message: event.target.value })} />
          </label>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <button className="primary-btn w-full">Send message</button>
        </form>

        <aside className="rounded-2xl bg-slate-50 p-7">
          <h2 className="text-xl font-bold">Store-specific help</h2>
          <p className="mt-3 text-slate-600">
            Store addresses, published phone numbers, opening hours and temporary closures are shown from the live store directory.
          </p>
          <Link className="mt-5 inline-block font-bold text-emerald-800" href="/stores">View Pasalho stores →</Link>
          <h2 className="mt-8 text-xl font-bold">Order help</h2>
          <p className="mt-3 text-slate-600">Signed-in customers can view current order status from their account.</p>
          <Link className="mt-5 inline-block font-bold text-emerald-800" href="/account/orders">View my orders →</Link>
        </aside>
      </div>
    </div>
  );
}
