"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Command,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  Settings,
  Store,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStaffSession } from "@/components/StaffSessionProvider";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { resilientFetch } from "@/lib/resilientFetch";

type CommandItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  capability: string;
  group: "Navigate" | "Quick actions" | "Results";
};
type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string;
  severity?: string;
  createdAt?: string;
  read?: boolean;
};

const commands: CommandItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Retail performance and exceptions",
    href: "/admin/dashboard",
    capability: "dashboard.read",
    group: "Navigate",
  },
  {
    id: "products",
    label: "Products",
    description: "Manage catalog products",
    href: "/admin/catalog/products",
    capability: "catalog.read",
    group: "Navigate",
  },
  {
    id: "orders",
    label: "Orders",
    description: "Review and fulfil orders",
    href: "/admin/commerce/orders",
    capability: "orders.read",
    group: "Navigate",
  },
  {
    id: "customers",
    label: "Customers",
    description: "Profiles and order history",
    href: "/admin/customers",
    capability: "customers.read",
    group: "Navigate",
  },
  {
    id: "stores",
    label: "Stores",
    description: "Store details and assignments",
    href: "/admin/stores",
    capability: "stores.read",
    group: "Navigate",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock levels and exceptions",
    href: "/admin/inventory",
    capability: "inventory.read",
    group: "Navigate",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Supplier directory",
    href: "/admin/procurement/suppliers",
    capability: "procurement.read",
    group: "Navigate",
  },
  {
    id: "staff",
    label: "Staff",
    description: "Team access and assignments",
    href: "/admin/organization/staff",
    capability: "staff.read",
    group: "Navigate",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Organization and retail configuration",
    href: "/admin/settings",
    capability: "settings.manage",
    group: "Navigate",
  },
  {
    id: "create-product",
    label: "Create product",
    description: "Add a product to the catalog",
    href: "/admin/catalog/products?create=1",
    capability: "catalog.write",
    group: "Quick actions",
  },
  {
    id: "today-orders",
    label: "Open today's orders",
    description: "Filter orders placed today",
    href: `/admin/commerce/orders?date=${new Date().toISOString().slice(0, 10)}`,
    capability: "orders.read",
    group: "Quick actions",
  },
  {
    id: "low-stock",
    label: "View low-stock products",
    description: "Open inventory exceptions",
    href: "/admin/inventory?stock=low",
    capability: "inventory.read",
    group: "Quick actions",
  },
];

function csrfToken() {
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrf_token="))
      ?.split("=")
      .slice(1)
      .join("=") || "",
  );
}
function fuzzy(value: string, query: string) {
  const haystack = value.toLowerCase();
  let position = 0;
  for (const char of query.toLowerCase().replace(/\s/g, "")) {
    position = haystack.indexOf(char, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AdminTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, hasCapability } = useStaffSession();
  const {
    stores,
    selectedStoreId,
    setSelectedStoreId,
    storeLoading,
    setMobileOpen,
  } = useAdminShell();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<CommandItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationError, setNotificationError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const allStoresAllowed =
    session?.scope?.type === "GLOBAL" ||
    session?.scope?.type === "ORGANIZATION";

  const visibleCommands = useMemo(
    () => [
      ...commands.filter(
        (item) =>
          hasCapability(item.capability) &&
          (!query || fuzzy(`${item.label} ${item.description}`, query)),
      ),
      ...remoteResults,
    ],
    [hasCapability, query, remoteResults],
  );
  const unread = notifications.filter((item) => !item.read).length;

  const loadNotifications = useCallback(async () => {
    setNotificationError("");
    try {
      const scope =
        selectedStoreId !== "all"
          ? `?store_id=${encodeURIComponent(selectedStoreId)}`
          : "";
      const response = await resilientFetch(
        `/api/admin/notifications${scope}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = (await response.json()) as { items?: NotificationItem[] };
      if (!response.ok) throw new Error("Operational alerts are unavailable");
      setNotifications(body.items || []);
    } catch {
      setNotificationError("Operational alerts could not be loaded.");
    }
  }, [selectedStoreId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    const timer = window.setInterval(() => void loadNotifications(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadNotifications]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setQuery("");
        setRemoteResults([]);
        setAccountOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!paletteOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [paletteOpen]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const store =
          selectedStoreId !== "all"
            ? `&store_id=${encodeURIComponent(selectedStoreId)}`
            : "";
        const response = await resilientFetch(
          `/api/admin/search?q=${encodeURIComponent(query.trim())}${store}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = (await response.json()) as {
          items?: Array<{
            id: string;
            label: string;
            description: string;
            href: string;
          }>;
        };
        if (response.ok)
          setRemoteResults(
            (body.items || []).map((item) => ({
              ...item,
              capability: "dashboard.read",
              group: "Results",
            })),
          );
      } catch {
        setRemoteResults([]);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedStoreId]);

  function closePalette() {
    setPaletteOpen(false);
    setQuery("");
    setRemoteResults([]);
    setActiveIndex(0);
  }
  function openCommand(item: CommandItem) {
    closePalette();
    router.push(item.href);
  }
  function onPaletteKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, visibleCommands.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && visibleCommands[activeIndex]) {
      event.preventDefault();
      openCommand(visibleCommands[activeIndex]);
    }
  }
  async function markAllRead() {
    const ids = notifications
      .filter((item) => !item.read)
      .map((item) => item.id);
    if (!ids.length) return;
    const response = await resilientFetch("/api/admin/notifications/read", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken(),
      },
      body: JSON.stringify({ ids }),
    });
    if (response.ok)
      setNotifications((items) =>
        items.map((item) => ({ ...item, read: true })),
      );
    else setNotificationError("Notifications could not be marked as read.");
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await resilientFetch("/api/operations-auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken() },
      });
    } finally {
      router.replace("/staff-login");
      router.refresh();
    }
  }

  const crumbs = pathname
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean);
  const userName = session?.user?.name || "Staff user";
  return (
    <header className="relative z-40 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav
          aria-label="Breadcrumb"
          className="hidden min-w-0 flex-1 items-center gap-2 text-sm text-slate-500 md:flex"
        >
          <Link href="/admin/dashboard" className="hover:text-slate-900">
            Admin
          </Link>
          {crumbs.map((crumb, index) => (
            <span
              key={`${crumb}-${index}`}
              className="flex min-w-0 items-center gap-2"
            >
              <span aria-hidden="true">/</span>
              <span
                className={`truncate capitalize ${index === crumbs.length - 1 ? "font-medium text-slate-900" : ""}`}
              >
                {crumb.replaceAll("-", " ")}
              </span>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm text-slate-500 shadow-sm hover:bg-white md:max-w-sm md:flex-none"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search or run a command</span>
          <kbd className="ml-auto hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
            ⌘ K
          </kbd>
        </button>
        <label className="flex items-center gap-2">
          <Store className="hidden h-4 w-4 text-slate-500 xl:block" />
          <span className="sr-only">Store scope</span>
          <select
            value={selectedStoreId}
            disabled={storeLoading}
            onChange={(event) => setSelectedStoreId(event.target.value)}
            className="w-[5.75rem] rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 focus:outline-2 focus:outline-emerald-600 sm:w-36 sm:text-sm xl:w-auto xl:max-w-44"
          >
            {allStoresAllowed && <option value="all">All stores</option>}
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative">
          <button
            type="button"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setAccountOpen(false);
            }}
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Notifications
                  </p>
                  <p className="text-xs text-slate-500">
                    Operational alerts in this scope
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={!unread}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all read
                </button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {notificationError ? (
                  <div
                    role="alert"
                    className="px-5 py-8 text-center text-sm text-red-700"
                  >
                    <p>{notificationError}</p>
                    <button
                      type="button"
                      onClick={() => void loadNotifications()}
                      className="mt-2 font-semibold underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">
                    You’re all caught up.
                  </p>
                ) : (
                  notifications.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setNotificationsOpen(false)}
                      className={`block border-b border-slate-100 px-4 py-3 hover:bg-slate-50 ${item.read ? "" : "bg-emerald-50/40"}`}
                    >
                      <div className="flex gap-3">
                        {!item.read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                        )}
                        <div className={item.read ? "pl-5" : ""}>
                          <p className="text-sm font-medium text-slate-900">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {item.message}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={accountOpen}
            onClick={() => {
              setAccountOpen((open) => !open);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {initials(userName)}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
          </button>
          {accountOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {userName}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {session?.user?.username}
                </p>
              </div>
              <Link
                href={`/admin/organization/staff/${session?.user?.id}`}
                onClick={() => setAccountOpen(false)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
              {hasCapability("settings.manage") && (
                <Link
                  href="/admin/settings"
                  onClick={() => setAccountOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              )}
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? "Signing out…" : "Logout"}
              </button>
            </div>
          )}
        </div>
      </div>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/55 p-3 pt-[8vh] backdrop-blur-sm sm:p-8 sm:pt-[12vh]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closePalette();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  if (next.trim().length < 2) setRemoteResults([]);
                  setActiveIndex(0);
                }}
                onKeyDown={onPaletteKeyDown}
                aria-controls="admin-command-results"
                aria-activedescendant={visibleCommands[activeIndex]?.id}
                placeholder="Search products, orders, customers, pages…"
                className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base outline-none"
              />
              <button
                type="button"
                aria-label="Close command palette"
                onClick={closePalette}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              id="admin-command-results"
              role="listbox"
              className="max-h-[56vh] overflow-y-auto p-2"
            >
              {visibleCommands.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  No authorized results found.
                </p>
              ) : (
                visibleCommands.map((item, index) => (
                  <button
                    key={`${item.group}-${item.id}`}
                    id={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openCommand(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index === activeIndex ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      {item.group === "Results" ? (
                        <ExternalLink className="h-4 w-4" />
                      ) : (
                        <Command className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {item.description}
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {item.group}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
