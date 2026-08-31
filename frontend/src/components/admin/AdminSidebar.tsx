"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  FileClock,
  FileText,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useStaffSession } from "@/components/StaffSessionProvider";
import { useAdminShell } from "@/components/admin/AdminShellContext";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  capability: string;
  children?: NavItem[];
};

const navigation: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin/dashboard",
    icon: CircleGauge,
    capability: "dashboard.read",
  },
  {
    title: "Catalog",
    href: "/admin/catalog/products",
    icon: Package,
    capability: "catalog.read",
    children: [
      {
        title: "Products",
        href: "/admin/catalog/products",
        icon: Package,
        capability: "catalog.read",
      },
      {
        title: "Categories",
        href: "/admin/catalog/categories",
        icon: Tags,
        capability: "catalog.read",
      },
    ],
  },
  {
    title: "Commerce",
    href: "/admin/commerce/orders",
    icon: ShoppingBag,
    capability: "orders.read",
    children: [
      {
        title: "Orders",
        href: "/admin/commerce/orders",
        icon: ShoppingBag,
        capability: "orders.read",
      },
      {
        title: "Customers",
        href: "/admin/customers",
        icon: Users,
        capability: "customers.read",
      },
    ],
  },
  {
    title: "Content",
    href: "/admin/content/pages",
    icon: FileText,
    capability: "content.read",
  },
  {
    title: "Stores",
    href: "/admin/stores",
    icon: Store,
    capability: "stores.read",
  },
  {
    title: "Inventory",
    href: "/admin/inventory",
    icon: Warehouse,
    capability: "inventory.read",
    children: [
      {
        title: "Overview",
        href: "/admin/inventory",
        icon: Boxes,
        capability: "inventory.read",
      },
      {
        title: "Batches",
        href: "/admin/inventory/batches",
        icon: ClipboardCheck,
        capability: "inventory.read",
      },
      {
        title: "Adjustments",
        href: "/admin/inventory/adjustments",
        icon: FileClock,
        capability: "inventory.adjust",
      },
    ],
  },
  {
    title: "Procurement",
    href: "/admin/procurement/purchase-orders",
    icon: Truck,
    capability: "procurement.read",
    children: [
      {
        title: "Suppliers",
        href: "/admin/procurement/suppliers",
        icon: Users,
        capability: "procurement.read",
      },
      {
        title: "Purchase orders",
        href: "/admin/procurement/purchase-orders",
        icon: ClipboardCheck,
        capability: "procurement.read",
      },
      {
        title: "Receiving",
        href: "/admin/procurement/receiving",
        icon: Truck,
        capability: "procurement.read",
      },
    ],
  },
  {
    title: "Organization",
    href: "/admin/organization/staff",
    icon: Users,
    capability: "staff.read",
    children: [
      {
        title: "Staff",
        href: "/admin/organization/staff",
        icon: Users,
        capability: "staff.read",
      },
      {
        title: "Roles",
        href: "/admin/organization/roles",
        icon: ShieldCheck,
        capability: "roles.manage",
      },
    ],
  },
  {
    title: "Audit log",
    href: "/admin/audit",
    icon: FileClock,
    capability: "audit.read",
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
    capability: "settings.manage",
  },
];

function initials(name?: string) {
  return (name || "Staff")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { session, hasCapability } = useStaffSession();
  const { collapsed, mobileOpen, setMobileOpen, toggleCollapsed } =
    useAdminShell();
  const visible = useMemo(
    () =>
      navigation
        .filter((item) => hasCapability(item.capability))
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) =>
            hasCapability(child.capability),
          ),
        })),
    [hasCapability],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const content = (
    <aside
      aria-label="Administration navigation"
      className={`flex h-full flex-col border-r border-slate-200 bg-slate-950 text-slate-200 transition-[width] duration-200 ${collapsed ? "w-[76px]" : "w-[260px]"}`}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-400 font-black text-slate-950">
          N
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">NOVA MART</p>
            <p className="text-[11px] text-slate-400">Retail administration</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="ml-auto rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            item.children?.some(
              (child) =>
                pathname === child.href ||
                pathname.startsWith(`${child.href}/`),
            );
          const open = Boolean(active) || expanded.has(item.title);
          const Icon = item.icon;
          if (!item.children?.length)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.title : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );
          return (
            <div key={item.title}>
              <button
                type="button"
                title={collapsed ? item.title : undefined}
                aria-expanded={open}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(item.title)) next.delete(item.title);
                    else next.add(item.title);
                    return next;
                  })
                }
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${active ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>
              {!collapsed && open && (
                <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive =
                      pathname === child.href ||
                      pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={childActive ? "page" : undefined}
                        className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm ${childActive ? "bg-white/10 font-semibold text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                      >
                        <ChildIcon className="h-4 w-4" />
                        {child.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-white">
            {initials(session?.user?.name)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {session?.user?.name}
              </p>
              <p className="truncate text-xs text-slate-400">
                {session?.role?.name || session?.role?.key}
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-2 hidden w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:flex"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-2 text-xs">Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-screen shrink-0 lg:block">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[260px] max-w-[88vw]">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
