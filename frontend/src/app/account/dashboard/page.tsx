'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resilientFetch } from '@/lib/resilientFetch';

interface Customer {
  id: string;
  phone_masked: string;
  preferred_name?: string;
  email?: string;
  language: string;
  verification_status: string;
  enrolled_at?: string;
}

interface Balance {
  available: number;
  pending: number;
  lifetime_earned: number;
}

interface LedgerEntry {
  id: string;
  points_signed: number;
  entry_type: string;
  effective_timestamp: string;
  reason?: string;
}

interface LoyaltySummary {
  enrolled: boolean;
  account?: {
    current_points: number;
    earned_points: number;
  };
  history?: Array<{
    id: string;
    points_signed: number;
    source_type: string;
    effective_timestamp: string;
    reason?: string;
  }>;
}

export default function AccountDashboard() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  const fetchAccountData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch customer profile
      const customerResponse = await resilientFetch('/api/auth/session/validate', {
      });

      if (!customerResponse.ok) {
        router.push('/account');
        return;
      }

      const customerData = await customerResponse.json();
      setCustomer(customerData.customer);

      const loyaltyResponse = await resilientFetch('/api/loyalty/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      const loyaltyData = await loyaltyResponse.json() as LoyaltySummary & { error?: string };
      if (!loyaltyResponse.ok) {
        throw new Error(loyaltyData.error || 'Failed to load loyalty account');
      }

      setBalance({
        available: loyaltyData.account?.current_points ?? 0,
        pending: 0,
        lifetime_earned: loyaltyData.account?.earned_points ?? 0,
      });
      setLedger((loyaltyData.history ?? []).map((entry) => ({
        id: entry.id,
        points_signed: entry.points_signed,
        entry_type: entry.source_type,
        effective_timestamp: entry.effective_timestamp,
        reason: entry.reason,
      })));
    } catch {
      setError('Failed to load account data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchAccountData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAccountData]);

  const handleLogout = async () => {
    try {
      await resilientFetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '' },
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    router.push('/account');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <p className="text-red-600 text-center mb-4">{error || 'Failed to load account'}</p>
          <button
            onClick={fetchAccountData}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">StoreSync</h1>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Points Balance Card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-lg font-medium mb-2">Available Points</h2>
          <p className="text-5xl font-bold mb-4">{balance?.available || 0}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-blue-200">Lifetime Earned</p>
              <p className="font-semibold">{balance?.lifetime_earned || 0}</p>
            </div>
            <div>
              <p className="text-blue-200">Pending</p>
              <p className="font-semibold">{balance?.pending || 0}</p>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Phone</span>
              <span className="font-medium">{customer.phone_masked}</span>
            </div>
            {customer.preferred_name && (
              <div className="flex justify-between">
                <span className="text-gray-600">Name</span>
                <span className="font-medium">{customer.preferred_name}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex justify-between">
                <span className="text-gray-600">Email</span>
                <span className="font-medium">{customer.email}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Verification Status</span>
              <span className={`font-medium ${
                customer.verification_status === 'VERIFIED' ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {customer.verification_status}
              </span>
            </div>
            {customer.enrolled_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">Member Since</span>
                <span className="font-medium">
                  {new Date(customer.enrolled_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>
          {ledger.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium text-gray-900">{entry.entry_type}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(entry.effective_timestamp).toLocaleDateString()}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-gray-400">{entry.reason}</p>
                    )}
                  </div>
                  <span
                    className={`font-semibold ${
                      entry.points_signed > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {entry.points_signed > 0 ? '+' : ''}{entry.points_signed}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/account/addresses"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <h3 className="font-semibold text-gray-900 mb-2">Saved Addresses</h3>
            <p className="text-sm text-gray-600">Manage Home, Work, and mapped delivery locations</p>
          </a>
          <a
            href="/account/consent"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <h3 className="font-semibold text-gray-900 mb-2">Consent Preferences</h3>
            <p className="text-sm text-gray-600">Manage your communication and data preferences</p>
          </a>
          <a
            href="/account/support"
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <h3 className="font-semibold text-gray-900 mb-2">Support</h3>
            <p className="text-sm text-gray-600">Report missing points or request help</p>
          </a>
        </div>
      </main>
    </div>
  );
}
