// frontend/src/components/admin/AdminTopbar.tsx
// Top bar with store switcher, command search, and account menu

'use client';

import { Search, Bell, User, LogOut, Settings, Store } from 'lucide-react';
import { useState } from 'react';
import { useStaffSession } from '@/components/StaffSessionProvider';

export function AdminTopbar() {
  const [commandSearchOpen, setCommandSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { session } = useStaffSession();
  const selectedStore = session?.storeAssignment?.name || 'All stores';
  const user = { name: session?.user?.name || 'Staff user', email: session?.user?.username || '', role: session?.role?.name || session?.role?.key || 'Staff' };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Breadcrumbs and Search */}
        <div className="flex items-center gap-4 flex-1">
          {/* Command Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search... (Ctrl+K)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onClick={() => setCommandSearchOpen(true)}
            />
          </div>
        </div>

        {/* Right side - Store switcher, notifications, account */}
        <div className="flex items-center gap-4">
          {/* Store Switcher */}
          {session?.storeAssignment && (
            <div className="relative">
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Store className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{selectedStore}</span>
              </button>
            </div>
          )}

          {/* Notifications */}
          <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
          </button>

          {/* Account Menu */}
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-sm font-medium text-blue-700">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role}</p>
              </div>
            </button>

            {accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2" onClick={() => setAccountMenuOpen(false)}>
                  <User className="h-4 w-4" />
                  Profile
                </button>
                <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2" onClick={() => setAccountMenuOpen(false)}>
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
                <div className="border-t border-gray-200 mt-1 pt-1">
                  <button type="button" className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Command Search Modal */}
      {commandSearchOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for anything..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-2">Quick Actions</p>
              <div className="space-y-1">
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                  Create new product
                </button>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                  View today's orders
                </button>
                <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                  Check inventory levels
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between items-center">
              <p className="text-xs text-gray-500">Press ESC to close</p>
              <button
                onClick={() => setCommandSearchOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
