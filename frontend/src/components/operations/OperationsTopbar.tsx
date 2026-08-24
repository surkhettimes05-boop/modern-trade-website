'use client';

import { LogOut, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useStaffSession } from '@/components/StaffSessionProvider';
import { resilientFetch } from '@/lib/resilientFetch';

export function OperationsTopbar() {
  const router = useRouter();
  const { session } = useStaffSession();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const store = session?.storeAssignment;
  const name = session?.user?.name || 'Staff member';
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2);

  async function logout() {
    const csrf = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('csrf_token='))
      ?.split('=')[1];
    setLoggingOut(true);
    try {
      await resilientFetch('/api/operations-auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf || '' },
      });
    } finally {
      router.replace('/staff-login');
      router.refresh();
    }
  }

  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
          <Store className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-blue-900">{store?.name || 'Assigned Nepal store'}</p>
            <p className="text-xs text-blue-600">{store?.code || 'Store assignment required'}</p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="Open staff account menu"
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((open) => !open)}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-gray-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-medium text-green-700">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-gray-900">{name}</span>
              <span className="block text-xs text-gray-500">{session?.role?.name || session?.role?.key}</span>
            </span>
          </button>

          {accountMenuOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <div className="border-b border-gray-200 px-4 py-2">
                <p className="text-sm font-medium text-gray-900">{name}</p>
                <p className="text-xs text-gray-500">{session?.user?.username}</p>
              </div>
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 disabled:text-gray-400"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
