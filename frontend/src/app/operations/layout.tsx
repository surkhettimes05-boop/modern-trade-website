// frontend/src/app/operations/layout.tsx
// Operations layout with proper routing for store-level operations

import { OperationsSidebar } from '@/components/operations/OperationsSidebar';
import { OperationsTopbar } from '@/components/operations/OperationsTopbar';
import { StaffSessionProvider } from '@/components/StaffSessionProvider';
import { privateMetadata } from '@/lib/seo';

export const metadata = privateMetadata('Store operations', '/operations');

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Add authentication check and redirect to /staff-login if not authenticated
  // TODO: Fetch session data from /api/operations-auth/session
  // TODO: Check capabilities and redirect if user doesn't have operations access

  return (<StaffSessionProvider area="operations">
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <OperationsSidebar />
        
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <OperationsTopbar />
          
          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
    </StaffSessionProvider>
  );
}
