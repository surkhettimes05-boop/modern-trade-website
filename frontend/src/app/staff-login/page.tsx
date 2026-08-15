'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operations-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json')
        ? await response.json()
        : { error: 'The StoreSync server is unavailable. Please try again.' };
      if (!response.ok) throw new Error(result.error || 'Login failed');
      router.replace('/operations');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-xl font-bold text-white">S</div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Private access</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Staff sign in</h1>
          <p className="mt-2 text-sm text-slate-600">Authorized StoreSync staff only.</p>
        </div>
        <form onSubmit={login} className="space-y-5">
          <label className="block text-sm font-medium text-slate-700">Username<input name="username" autoComplete="username" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block text-sm font-medium text-slate-700">Password<input name="password" type="password" autoComplete="current-password" required minLength={8} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
