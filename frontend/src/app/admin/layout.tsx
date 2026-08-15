// frontend/src/app/admin/layout.tsx
// Admin layout with role-aware sidebar, top bar, store switcher, command search, account menu

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { StaffSessionProvider } from '@/components/StaffSessionProvider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Add authentication check and redirect to /staff-login if not authenticated
  // TODO: Fetch session data from /api/operations-auth/session
  // TODO: Check capabilities and redirect if user doesn't have admin access

  return (<StaffSessionProvider area="admin">
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <AdminSidebar />
        
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <AdminTopbar />
          
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
