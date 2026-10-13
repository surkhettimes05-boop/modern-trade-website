'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FirebaseGoogleSignInButton } from '@/components/GoogleSignInButton';
import { resilientFetch } from '@/lib/resilientFetch';

async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!body) return {};

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {
      error: response.ok
        ? 'The backend returned an invalid response'
        : `Backend request failed (HTTP ${response.status})`,
    };
  }
}

function nextDestination(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') ? next : '/account/dashboard';
}

export default function AccountPage() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [googleCredential, setGoogleCredential] = useState('');
  const [googleName, setGoogleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await resilientFetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Google sign-in failed',
        );
      }

      if (data.requires_phone_verification === true) {
        const profile =
          data.google_profile && typeof data.google_profile === 'object'
            ? (data.google_profile as Record<string, unknown>)
            : {};
        setGoogleCredential(credential);
        setGoogleName(
          typeof profile.preferred_name === 'string' ? profile.preferred_name : '',
        );
        setPhone('');
        setOtp('');
        setOtpSent(false);
        return;
      }

      router.push(nextDestination());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await resilientFetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'LOGIN' }),
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to send OTP');
      }

      const returnedOtp = typeof data.otp === 'string' ? data.otp : '';
      setDevelopmentOtp(returnedOtp);
      if (returnedOtp) setOtp(returnedOtp);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isGoogleLink = Boolean(googleCredential);
      const response = await resilientFetch(
        isGoogleLink ? '/api/auth/google/link' : '/api/auth/otp/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isGoogleLink
              ? { credential: googleCredential, phone, otp_code: otp }
              : { phone, otp_code: otp, purpose: 'LOGIN' },
          ),
        },
      );

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to verify OTP');
      }

      router.push(nextDestination());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Pasalho Account</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          Sign in to manage orders, addresses and your Pasalho account.
        </p>

        {!googleCredential && !otpSent && (
          <>
            <div className="flex justify-center min-h-11">
              <FirebaseGoogleSignInButton
                disabled={loading}
                onCredential={handleGoogleCredential}
                onError={setError}
              />
            </div>
            {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && (
              <div className="flex items-center gap-3 my-5" aria-hidden="true">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  or
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            )}
          </>
        )}

        {googleCredential && !otpSent && (
          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {googleName ? `Hi ${googleName}. ` : ''}
            Verify your Nepal mobile number once to link Google with your Pasalho account.
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                autoComplete="tel"
                inputMode="tel"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {googleCredential
                  ? 'This keeps your Google login, delivery details and existing orders on one customer account.'
                  : 'Enter your Nepal mobile number. New customers are created after OTP verification.'}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>

            {googleCredential && (
              <button
                type="button"
                onClick={() => {
                  setGoogleCredential('');
                  setGoogleName('');
                  setError('');
                }}
                className="w-full text-blue-600 hover:text-blue-700 py-2"
              >
                Use another sign-in method
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                Enter OTP
              </label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {developmentOtp
                  ? 'Local development code returned by the backend'
                  : googleCredential
                    ? 'Enter the 6-digit code to link this phone with Google.'
                    : 'Enter the 6-digit code sent to your phone'}
              </p>
            </div>

            {developmentOtp && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
                Development OTP: <strong>{developmentOtp}</strong>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Verifying...' : googleCredential ? 'Verify & Link Google' : 'Verify & Login'}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp('');
                setDevelopmentOtp('');
                setError('');
              }}
              className="w-full text-blue-600 hover:text-blue-700 py-2"
            >
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
