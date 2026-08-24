// frontend/src/app/admin/layout.tsx
// Admin layout with role-aware sidebar, top bar, store switcher, command search, account menu

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { StaffSessionProvider } from '@/components/StaffSessionProvider';
import { privateMetadata } from '@/lib/seo';

export const metadata = privateMetadata('Administration', '/admin');

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
