'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { commerceFetch, setCommerceSession } from '@/lib/commerceApi';

type OtpChallenge = { challengeId: string; expiresInSeconds: number };
type AuthResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  customer: { id: string; phone: string; fullName?: string | null };
};

export default function AccountPage() {
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const challenge = await commerceFetch<OtpChallenge>(
        '/api/commerce/auth/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({ phone }),
        },
        { auth: false },
      );
      setChallengeId(challenge.challengeId);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await commerceFetch<AuthResult>(
        '/api/commerce/auth/verify-otp',
        {
          method: 'POST',
          body: JSON.stringify({
            phone,
            challengeId,
            otp,
            deviceId: 'pasalho-web',
          }),
        },
        { auth: false },
      );
      setCommerceSession(result);
      const next = searchParams.get('next');
      router.replace(next?.startsWith('/') ? next : '/account/orders');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not verify OTP.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
      <p className="eyebrow">PASALHO ACCOUNT</p>
      <h1 className="text-2xl font-bold mb-2">Sign in with your phone</h1>
      <p className="text-sm text-slate-600 mb-6">Your phone number is your Pasalho customer ID.</p>

      {!challengeId ? <form onSubmit={requestOtp} className="space-y-4">
        <label className="block text-sm font-medium">Nepal mobile number
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+97798XXXXXXXX" className="mt-2 w-full rounded-lg border px-4 py-3" required />
        </label>
        {error && <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
        <button type="submit" disabled={loading} className="primary-btn w-full">{loading ? 'Sending…' : 'Send OTP'}</button>
      </form> : <form onSubmit={verifyOtp} className="space-y-4">
        <label className="block text-sm font-medium">6-digit OTP
          <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} className="mt-2 w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-widest" required />
        </label>
        {error && <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
        <button type="submit" disabled={loading} className="primary-btn w-full">{loading ? 'Verifying…' : 'Verify and continue'}</button>
        <button type="button" className="w-full py-2 text-emerald-800" onClick={() => { setChallengeId(''); setOtp(''); setError(''); }}>Change phone number</button>
      </form>}
    </div>
  </div>;
}
