// frontend/src/components/admin/UnauthorizedState.tsx
// Component for displaying unauthorized access state

'use client';

import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export function UnauthorizedState({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">
          {message || "You don't have permission to access this resource. Please contact your administrator if you believe this is an error."}
        </p>
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
