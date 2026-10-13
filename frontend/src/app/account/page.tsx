'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resilientFetch } from '@/lib/resilientFetch';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      width?: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

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

function safeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/account/dashboard';
}

export default function AccountPage() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [googleLinkToken, setGoogleLinkToken] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    if (!googleClientId || googleLinkToken) return;

    let cancelled = false;
    const scriptId = 'google-identity-services';

    const handleCredential = async (credentialResponse: GoogleCredentialResponse) => {
      const credential = credentialResponse.credential;
      if (!credential || cancelled) {
        if (!cancelled) setError('Google did not return a valid sign-in credential.');
        return;
      }

      setGoogleLoading(true);
      setError('');
      try {
        const response = await resilientFetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: credential }),
        });
        const data = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Google sign-in failed',
          );
        }

        if (data.link_required === true) {
          const linkToken = typeof data.link_token === 'string' ? data.link_token : '';
          const profile =
            data.google_profile && typeof data.google_profile === 'object'
              ? (data.google_profile as Record<string, unknown>)
              : {};
          if (!linkToken) throw new Error('Google linking session could not be created.');
          setGoogleLinkToken(linkToken);
          setGoogleEmail(typeof profile.email === 'string' ? profile.email : '');
          setOtpSent(false);
          setOtp('');
          setDevelopmentOtp('');
          return;
        }

        router.push(safeNextPath());
        router.refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
        }
      } finally {
        if (!cancelled) setGoogleLoading(false);
      }
    };

    const initializeGoogle = () => {
      if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: 352,
      });
    };

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) initializeGoogle();
      else existing.addEventListener('load', initializeGoogle, { once: true });
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', initializeGoogle, { once: true });
      script.addEventListener(
        'error',
        () => {
          if (!cancelled) setError('Google sign-in could not be loaded. You can still use your mobile number.');
        },
        { once: true },
      );
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      existing?.removeEventListener('load', initializeGoogle);
    };
  }, [googleClientId, googleLinkToken, router]);

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
      const endpoint = googleLinkToken ? '/api/auth/google/link' : '/api/auth/otp/verify';
      const body = googleLinkToken
        ? { link_token: googleLinkToken, phone, otp_code: otp }
        : { phone, otp_code: otp, purpose: 'LOGIN' };

      const response = await resilientFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to verify OTP');
      }

      router.push(safeNextPath());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const resetGoogleLink = () => {
    setGoogleLinkToken('');
    setGoogleEmail('');
    setOtpSent(false);
    setOtp('');
    setDevelopmentOtp('');
    setPhone('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-2">Pasalho Account</h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          {googleLinkToken
            ? `Verify your mobile number once to connect ${googleEmail || 'your Google account'}.`
            : 'Sign in to checkout, view orders and keep your Pasalho account in sync.'}
        </p>

        {!googleLinkToken && !otpSent && googleClientId && (
          <>
            <div
              ref={googleButtonRef}
              className={`min-h-11 flex justify-center ${googleLoading ? 'opacity-60 pointer-events-none' : ''}`}
              aria-label="Continue with Google"
            />
            <div className="flex items-center gap-3 my-5" aria-hidden="true">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs font-medium text-gray-500">OR</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>
          </>
        )}

        {!otpSent ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Mobile number
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
                autoComplete="tel"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {googleLinkToken
                  ? 'We use your verified Nepal number to link Google to the same orders and loyalty account.'
                  : 'New customers are created only after mobile verification.'}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Sending...' : googleLinkToken ? 'Send verification code' : 'Continue with mobile'}
            </button>

            {googleLinkToken && (
              <button
                type="button"
                onClick={resetGoogleLink}
                disabled={loading}
                className="w-full text-gray-600 hover:text-gray-900 py-2"
              >
                Use another sign-in method
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                Enter verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                {developmentOtp
                  ? 'Local development code returned by the backend'
                  : `Enter the 6-digit code sent to ${phone}.`}
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
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading
                ? 'Verifying...'
                : googleLinkToken
                  ? 'Verify & connect Google'
                  : 'Verify & sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp('');
                setDevelopmentOtp('');
                setError('');
              }}
              disabled={loading}
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
