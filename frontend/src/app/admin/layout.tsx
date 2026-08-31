// frontend/src/app/admin/layout.tsx
// Admin layout with role-aware sidebar, top bar, store switcher, command search, account menu

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { StaffSessionProvider } from "@/components/StaffSessionProvider";
import { AdminShellProvider } from "@/components/admin/AdminShellContext";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Administration", "/admin");

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffSessionProvider area="admin">
      <AdminShellProvider>
        <a
          href="#admin-main"
          className="sr-only z-[100] rounded-md bg-white px-4 py-2 font-semibold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to administration content
        </a>
        <div className="min-h-screen bg-slate-50">
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <AdminSidebar />

            {/* Main content area */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Topbar */}
              <AdminTopbar />

              {/* Page content */}
              <main
                id="admin-main"
                className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8"
              >
                {children}
              </main>
            </div>
          </div>
        </div>
      </AdminShellProvider>
    </StaffSessionProvider>
  );
}
