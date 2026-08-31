"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { resilientFetch } from "@/lib/resilientFetch";
import { useStaffSession } from "@/components/StaffSessionProvider";

export type StoreScope = { id: string; name: string; code?: string | null };

type AdminShellValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  stores: StoreScope[];
  selectedStoreId: string;
  storeLoading: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
  setSelectedStoreId: (id: string) => void;
};

const AdminShellContext = createContext<AdminShellValue | null>(null);
const STORE_KEY = "storesync.admin.store-scope";
const SIDEBAR_KEY = "storesync.admin.sidebar-collapsed";

export function AdminShellProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = useStaffSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stores, setStores] = useState<StoreScope[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState("all");
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "true");
      const saved = window.localStorage.getItem(STORE_KEY);
      if (saved) setSelectedStoreIdState(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadStores() {
      setStoreLoading(true);
      try {
        const response = await resilientFetch("/api/admin/context/stores", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as
          { items?: StoreScope[] } | StoreScope[];
        if (!response.ok) throw new Error("Unable to load store scope");
        const next = Array.isArray(body) ? body : body.items || [];
        setStores(next);
        const assigned = session?.storeAssignment?.id;
        setSelectedStoreIdState((current) => {
          const allAllowed =
            session?.scope?.type === "GLOBAL" ||
            session?.scope?.type === "ORGANIZATION";
          if (current === "all" && allAllowed) return current;
          if (next.some((store) => store.id === current)) return current;
          return assigned && next.some((store) => store.id === assigned)
            ? assigned
            : next[0]?.id || "all";
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          const assigned = session?.storeAssignment;
          setStores(
            assigned
              ? [{ id: assigned.id, name: assigned.name, code: assigned.code }]
              : [],
          );
          setSelectedStoreIdState(assigned?.id || "all");
        }
      } finally {
        if (!controller.signal.aborted) setStoreLoading(false);
      }
    }
    void loadStores();
    return () => controller.abort();
  }, [session]);

  const value = useMemo<AdminShellValue>(
    () => ({
      collapsed,
      mobileOpen,
      stores,
      selectedStoreId,
      storeLoading,
      toggleCollapsed: () =>
        setCollapsed((current) => {
          const next = !current;
          window.localStorage.setItem(SIDEBAR_KEY, String(next));
          return next;
        }),
      setMobileOpen,
      setSelectedStoreId: (id) => {
        if (id !== "all" && !stores.some((store) => store.id === id)) return;
        const allAllowed =
          session?.scope?.type === "GLOBAL" ||
          session?.scope?.type === "ORGANIZATION";
        if (id === "all" && !allAllowed) return;
        window.localStorage.setItem(STORE_KEY, id);
        setSelectedStoreIdState(id);
        window.dispatchEvent(
          new CustomEvent("storesync:store-scope", { detail: id }),
        );
      },
    }),
    [
      collapsed,
      mobileOpen,
      stores,
      selectedStoreId,
      storeLoading,
      session?.scope?.type,
    ],
  );

  return (
    <AdminShellContext.Provider value={value}>
      {children}
    </AdminShellContext.Provider>
  );
}

export function useAdminShell() {
  const value = useContext(AdminShellContext);
  if (!value)
    throw new Error("useAdminShell must be used inside AdminShellProvider");
  return value;
}
