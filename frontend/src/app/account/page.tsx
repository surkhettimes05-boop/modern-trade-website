'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, PackageSearch, ShieldCheck, Smartphone } from 'lucide-react';
import { commerceRequest } from '@/lib/pasalhoCommerce';

type Customer = {
  id: string;
  phone: string;
  fullName?: string | null;
  email?: string | null;
  status: string;
};

type SessionResponse = {
  success?: boolean;
  data?: {
    customer?: Customer;
    challengeId?: string;
    expiresInSeconds?: number;
  };
  error?: string | { message?: string };
};

function responseMessage(value: SessionResponse, fallback: string) {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error === 'object' && value.error.message) {
    return value.error.message;
  }
  return fallback;
}

export default function AccountPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [checking, setChecking] = useState(true);
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCustomer = async () => {
    try {
      setCustomer(await commerceRequest<Customer>('me'));
    } catch {
      setCustomer(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void loadCustomer();
  }, []);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer-session/request-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const value = (await response.json()) as SessionResponse;
      if (!response.ok) {
        throw new Error(responseMessage(value, 'Could not send OTP'));
      }
      const id = value.data?.challengeId;
      if (!id) throw new Error('OTP challenge was not returned');
      setChallengeId(id);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/customer-session/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, phone, otp }),
      });
      const value = (await response.json()) as SessionResponse;
      if (!response.ok) {
        throw new Error(responseMessage(value, 'OTP verification failed'));
      }
      await loadCustomer();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch('/api/customer-session/logout', { method: 'POST' }).catch(
      () => undefined,
    );
    setCustomer(null);
    setChallengeId('');
    setOtp('');
    setBusy(false);
  }

  if (checking) {
    return <div className="shell page account-shell">Checking your Pasalho account…</div>;
  }

  if (customer) {
    return (
      <div className="shell page account-shell">
        <section className="account-card">
          <div className="account-icon"><ShieldCheck /></div>
          <p className="eyebrow">PASALHO ACCOUNT</p>
          <h1>{customer.fullName || 'Your account'}</h1>
          <p className="account-phone">{customer.phone}</p>
          <div className="account-actions">
            <Link href="/account/orders"><PackageSearch /> My orders</Link>
            <Link href="/checkout">Continue checkout</Link>
            <button onClick={logout} disabled={busy}><LogOut /> Sign out</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="shell page account-shell">
      <section className="account-card">
        <div className="account-icon"><Smartphone /></div>
        <p className="eyebrow">SIGN IN TO PASALHO</p>
        <h1>Continue with your phone</h1>
        <p>
          Phone OTP connects your addresses, orders and delivery history to one
          customer account.
        </p>

        {!challengeId ? (
          <form onSubmit={requestOtp} className="account-form">
            <label>
              Nepal mobile number
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98XXXXXXXX"
                inputMode="tel"
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-btn" disabled={busy}>
              {busy ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="account-form">
            <label>
              6-digit OTP
              <input
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-btn" disabled={busy || otp.length !== 6}>
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setChallengeId('');
                setOtp('');
                setError('');
              }}
            >
              Change phone number
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
