// frontend/src/components/operations/OperationsSidebar.tsx
// Sidebar for store-level operations interface

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  ArrowRightLeft, 
  Clock, 
  CreditCard, 
  Truck,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';
import { useStaffSession } from '@/components/StaffSessionProvider';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  capability?: string;
  children?: NavItem[];
}

export function OperationsSidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { session, hasCapability } = useStaffSession();

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const navigation: NavItem[] = [
    {
      title: 'Dashboard',
      href: '/operations/dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      capability: 'dashboard.read',
    },
    {
      title: 'POS',
      href: '/operations/pos',
      icon: <ShoppingCart className="h-5 w-5" />,
      capability: 'pos.execute',
    },
    {
      title: 'Orders',
      href: '/operations/orders',
      icon: <ShoppingCart className="h-5 w-5" />,
      capability: 'orders.read',
    },
    {
      title: 'Inventory',
      href: '/operations/inventory',
      icon: <Package className="h-5 w-5" />,
      capability: 'inventory.read',
      children: [
        { title: 'Overview', href: '/operations/inventory', icon: <Package className="h-4 w-4" />, capability: 'inventory.read' },
        { title: 'Batches', href: '/operations/inventory/batches', icon: <Package className="h-4 w-4" />, capability: 'inventory.read' },
        { title: 'Adjustments', href: '/operations/inventory/adjustments', icon: <Package className="h-4 w-4" />, capability: 'inventory.adjust' },
      ],
    },
    {
      title: 'Receiving',
      href: '/operations/receiving',
      icon: <Truck className="h-5 w-5" />,
      capability: 'procurement.read',
    },
    {
      title: 'Transfers',
      href: '/operations/transfers',
      icon: <ArrowRightLeft className="h-5 w-5" />,
      capability: 'transfers.request',
    },
    {
      title: 'Shifts',
      href: '/operations/shifts',
      icon: <Clock className="h-5 w-5" />,
      capability: 'shifts.manage',
    },
    {
      title: 'Reconciliation',
      href: '/operations/reconciliation',
      icon: <CreditCard className="h-5 w-5" />,
      capability: 'reconciliation.manage',
    },
    {
      title: 'Devices',
      href: '/operations/devices',
      icon: <Package className="h-5 w-5" />,
      capability: 'devices.manage',
    },
  ];

  const renderNavItem = (item: NavItem, level = 0) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.has(item.title);

    if (item.capability && !hasCapability(item.capability)) return null;
    return (<div key={item.href}>
        <Link
          href={hasChildren ? '#' : item.href}
          onClick={hasChildren ? (e) => { e.preventDefault(); toggleSection(item.title); } : undefined}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
            ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}
            ${level > 0 ? 'ml-4 text-sm' : ''}
          `}
        >
          {item.icon}
          <span className="flex-1">{item.title}</span>
          {hasChildren && (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          )}
        </Link>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children?.map(child => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">NOVA MART Operations</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navigation.map(item => renderNavItem(item))}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-sm font-medium text-green-700">OP</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{session?.storeAssignment?.name || session?.role?.name || 'Store Operations'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
