'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getCustomer,
  logoutCustomer,
  requestCustomerOtp,
  verifyCustomerOtp,
  type Customer,
} from '@/lib/pasalhoCommerce';

export default function AccountPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [nextPath, setNextPath] = useState('/account/orders');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next?.startsWith('/')) setNextPath(next);
    getCustomer()
      .then(setCustomer)
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await requestCustomerOtp(phone);
      setChallengeId(result.challengeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await verifyCustomerOtp(challengeId, phone, otp);
      setCustomer(result.customer);
      router.replace(nextPath);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not verify OTP.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await logoutCustomer();
    } catch {
      // The proxy clears local customer cookies on logout responses.
    } finally {
      setCustomer(null);
      setBusy(false);
      router.refresh();
    }
  }

  if (checking) {
    return <div className="shell page"><p>Checking your Pasalho account…</p></div>;
  }

  if (customer) {
    return (
      <div className="shell page">
        <div className="account-card">
          <p className="eyebrow">PASALHO ACCOUNT</p>
          <h1>{customer.fullName || 'Welcome back'}</h1>
          <p>{customer.phone}</p>
          <div className="account-actions">
            <Link className="primary-btn" href="/account/orders">View orders</Link>
            <Link className="secondary-btn" href="/checkout">Continue checkout</Link>
            <button className="secondary-btn" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell page account-auth-page">
      <div className="account-card">
        <p className="eyebrow">PASALHO ACCOUNT</p>
        <h1>Sign in with your phone</h1>
        <p>Use the Nepal mobile number you want attached to your Pasalho orders.</p>

        {!challengeId ? (
          <form onSubmit={requestOtp}>
            <label>
              Mobile number
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98XXXXXXXX"
                autoComplete="tel"
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <label>
              6-digit OTP
              <input
                inputMode="numeric"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="123456"
                autoComplete="one-time-code"
                required
              />
            </label>
            <button className="primary-btn" disabled={busy || otp.length !== 6}>
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setChallengeId('');
                setOtp('');
              }}
            >
              Change phone number
            </button>
          </form>
        )}

        {error ? (
          <p className="commerce-message error" role="alert">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
