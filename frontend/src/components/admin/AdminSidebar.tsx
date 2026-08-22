// frontend/src/components/admin/AdminSidebar.tsx
// Role-aware sidebar for admin interface

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Package, 
  Tag, 
  ShoppingCart, 
  Users, 
  Store, 
  Warehouse, 
  FileText,
  Settings,
  Shield,
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

export function AdminSidebar() {
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
      href: '/admin/dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      capability: 'dashboard.read',
    },
    {
      title: 'Catalog',
      href: '/admin/catalog',
      icon: <Package className="h-5 w-5" />,
      capability: 'catalog.read',
      children: [
        { title: 'Products', href: '/admin/catalog/products', icon: <Package className="h-4 w-4" />, capability: 'catalog.read' },
        { title: 'Categories', href: '/admin/catalog/categories', icon: <Tag className="h-4 w-4" />, capability: 'catalog.read' },
      ],
    },
    {
      title: 'Content',
      href: '/admin/content',
      icon: <FileText className="h-5 w-5" />,
      capability: 'content.read',
      children: [
        { title: 'Pages', href: '/admin/content/pages', icon: <FileText className="h-4 w-4" />, capability: 'content.read' },
      ],
    },
    {
      title: 'Commerce',
      href: '/admin/commerce',
      icon: <ShoppingCart className="h-5 w-5" />,
      capability: 'orders.read',
      children: [
        { title: 'Orders', href: '/admin/commerce/orders', icon: <ShoppingCart className="h-4 w-4" />, capability: 'orders.read' },
      ],
    },
    {
      title: 'Customers',
      href: '/admin/customers',
      icon: <Users className="h-5 w-5" />,
      capability: 'customers.read',
      children: [
        { title: 'All Customers', href: '/admin/customers', icon: <Users className="h-4 w-4" />, capability: 'customers.read' },
      ],
    },
    {
      title: 'Stores',
      href: '/admin/stores',
      icon: <Store className="h-5 w-5" />,
      capability: 'stores.read',
    },
    {
      title: 'Inventory',
      href: '/admin/inventory',
      icon: <Warehouse className="h-5 w-5" />,
      capability: 'inventory.read',
      children: [
        { title: 'Overview', href: '/admin/inventory', icon: <Warehouse className="h-4 w-4" />, capability: 'inventory.read' },
        { title: 'Batches', href: '/admin/inventory/batches', icon: <Warehouse className="h-4 w-4" />, capability: 'inventory.read' },
        { title: 'Adjustments', href: '/admin/inventory/adjustments', icon: <Warehouse className="h-4 w-4" />, capability: 'inventory.adjust' },
      ],
    },
    {
      title: 'Procurement',
      href: '/admin/procurement',
      icon: <Warehouse className="h-5 w-5" />,
      capability: 'procurement.read',
      children: [
        { title: 'Suppliers', href: '/admin/procurement/suppliers', icon: <Warehouse className="h-4 w-4" />, capability: 'procurement.read' },
        { title: 'Purchase Orders', href: '/admin/procurement/purchase-orders', icon: <Warehouse className="h-4 w-4" />, capability: 'procurement.read' },
        { title: 'Receiving', href: '/admin/procurement/receiving', icon: <Warehouse className="h-4 w-4" />, capability: 'procurement.read' },
      ],
    },
    {
      title: 'Organization',
      href: '/admin/organization',
      icon: <Users className="h-5 w-5" />,
      capability: 'staff.read',
      children: [
        { title: 'Staff', href: '/admin/organization/staff', icon: <Users className="h-4 w-4" />, capability: 'staff.read' },
        { title: 'Roles', href: '/admin/organization/roles', icon: <Shield className="h-4 w-4" />, capability: 'roles.manage' },
      ],
    },
    {
      title: 'Audit',
      href: '/admin/audit',
      icon: <Shield className="h-5 w-5" />,
      capability: 'audit.read',
    },
    {
      title: 'Settings',
      href: '/admin/settings',
      icon: <Settings className="h-5 w-5" />,
      capability: 'settings.manage',
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
        <h1 className="text-xl font-bold text-gray-900">NOVA MART Admin</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navigation.map(item => renderNavItem(item))}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-sm font-medium text-blue-700">AD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{session?.role?.name || session?.role?.key}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
