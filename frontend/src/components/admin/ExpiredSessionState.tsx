// frontend/src/components/admin/ExpiredSessionState.tsx
// Component for displaying expired session state

'use client';

import { Clock, LogIn } from 'lucide-react';
import Link from 'next/link';

export function ExpiredSessionState() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mx-auto h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
          <Clock className="h-8 w-8 text-yellow-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Expired</h1>
        <p className="text-gray-600 mb-6">
          Your session has expired due to inactivity. Please log in again to continue.
        </p>
        <Link
          href="/staff-login"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Log In Again
        </Link>
      </div>
    </div>
  );
}
