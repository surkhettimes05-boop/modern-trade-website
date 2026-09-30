'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { resilientFetch } from '@/lib/resilientFetch';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response = await resilientFetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Could not send your message.');
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send your message.');
    }
  }

  if (submitted) {
    return (
      <div className="shell page max-w-2xl">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-900">Message received</h1>
          <p className="mt-3 text-emerald-800">The Pasalho team can now review your request.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell page max-w-5xl">
      <p className="eyebrow">CONTACT PASALHO</p>
      <h1 className="text-4xl font-bold text-gray-900">How can we help?</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">
        Use this form for customer support, order questions, supplier enquiries or business discussions.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_.7fr]">
        <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-7">
          <label>Name<input required className="mt-1 w-full rounded-lg border p-3" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></label>
          <label>Email<input type="email" required className="mt-1 w-full rounded-lg border p-3" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></label>
          <label>Phone<input type="tel" className="mt-1 w-full rounded-lg border p-3" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></label>
          <label>Subject<input required className="mt-1 w-full rounded-lg border p-3" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} /></label>
          <label>Message<textarea required rows={5} className="mt-1 w-full rounded-lg border p-3" value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} /></label>
          {error ? <p className="commerce-message error" role="alert">{error}</p> : null}
          <button className="primary-btn" type="submit">Send message</button>
        </form>

        <aside className="rounded-2xl bg-emerald-950 p-7 text-white">
          <MapPin />
          <h2 className="mt-5 text-2xl font-semibold">Surkhet, Nepal</h2>
          <p className="mt-3 leading-7 text-emerald-100">
            Pasalho is being built around Birendranagar and the wider Surkhet market. Current delivery coverage is determined by the serviceability checker, not by a fixed citywide promise.
          </p>
          <p className="mt-6 text-sm text-emerald-200">
            We do not publish an unverified phone number, email address or opening-hour promise on this page.
          </p>
        </aside>
      </div>
    </div>
  );
}
