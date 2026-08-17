'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Consent {
  id: string;
  consent_type: string;
  consent_state: string;
  channel?: string;
  granted_at: string;
  withdrawn_at?: string;
}

export default function ConsentPage() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const customerResponse = await fetch('/api/auth/session/validate', {
      });

      if (!customerResponse.ok) {
        router.push('/account');
        return;
      }

      const customerData = await customerResponse.json();

      const response = await fetch(`/api/consent/customer/${customerData.customer.id}`);
      const data = await response.json();
      setConsents(data);
    } catch {
      setError('Failed to load consent preferences');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchConsents(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchConsents]);

  const handleGrantConsent = async (consentType: string, channel?: string) => {
    try {
      const customerResponse = await fetch('/api/auth/session/validate', {
      });
      const customerData = await customerResponse.json();

      const response = await fetch('/api/consent/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '' },
        body: JSON.stringify({
          customer_id: customerData.customer.id,
          consent_type: consentType,
          channel,
          source: 'CUSTOMER',
        }),
      });

      if (response.ok) {
        fetchConsents();
      }
    } catch {
      setError('Failed to grant consent');
    }
  };

  const handleWithdrawConsent = async (consentId: string) => {
    try {
      const response = await fetch('/api/consent/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_id: consentId,
          reason: 'Customer request',
        }),
      });

      if (response.ok) {
        fetchConsents();
      }
    } catch {
      setError('Failed to withdraw consent');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <a href="/account/dashboard" className="text-blue-600 hover:text-blue-700">
            ← Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Consent Preferences</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Communication Preferences</h2>
          <p className="text-gray-600 mb-6">
            Choose how you'd like us to communicate with you about promotions, offers, and updates.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Marketing SMS</h3>
                <p className="text-sm text-gray-600">Receive promotional offers via SMS</p>
              </div>
              {consents.find(c => c.consent_type === 'MARKETING' && c.channel === 'SMS' && c.consent_state === 'GRANTED') ? (
                <button
                  onClick={() => {
                    const consent = consents.find(c => c.consent_type === 'MARKETING' && c.channel === 'SMS');
                    if (consent) handleWithdrawConsent(consent.id);
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                >
                  Withdraw
                </button>
              ) : (
                <button
                  onClick={() => handleGrantConsent('MARKETING', 'SMS')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Grant
                </button>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Marketing Email</h3>
                <p className="text-sm text-gray-600">Receive promotional offers via email</p>
              </div>
              {consents.find(c => c.consent_type === 'MARKETING' && c.channel === 'EMAIL' && c.consent_state === 'GRANTED') ? (
                <button
                  onClick={() => {
                    const consent = consents.find(c => c.consent_type === 'MARKETING' && c.channel === 'EMAIL');
                    if (consent) handleWithdrawConsent(consent.id);
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                >
                  Withdraw
                </button>
              ) : (
                <button
                  onClick={() => handleGrantConsent('MARKETING', 'EMAIL')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Grant
                </button>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Transactional SMS</h3>
                <p className="text-sm text-gray-600">Receive transaction updates via SMS</p>
              </div>
              {consents.find(c => c.consent_type === 'TRANSACTIONAL' && c.channel === 'SMS' && c.consent_state === 'GRANTED') ? (
                <button
                  onClick={() => {
                    const consent = consents.find(c => c.consent_type === 'TRANSACTIONAL' && c.channel === 'SMS');
                    if (consent) handleWithdrawConsent(consent.id);
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                >
                  Withdraw
                </button>
              ) : (
                <button
                  onClick={() => handleGrantConsent('TRANSACTIONAL', 'SMS')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Grant
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Privacy</h2>
          <p className="text-gray-600 mb-4">
            You have the right to access, correct, or delete your personal data.
          </p>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              Request Data Access
            </button>
            <button className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50">
              Request Data Correction
            </button>
            <button className="w-full text-left px-4 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
              Request Data Deletion
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
