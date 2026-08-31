"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { resilientFetch } from "@/lib/resilientFetch";
import { UnauthorizedState } from "@/components/admin/UnauthorizedState";

export type StaffSession = {
  authenticated: boolean;
  user?: { id: string; username: string; name: string; staffNumber: string };
  role?: { key: string | null; name: string | null; level: number | null };
  capabilities?: string[];
  scope?: { type: string; organizationId: string | null; storeIds: string[] };
  storeAssignment?: {
    id: string;
    name: string;
    code: string;
    currencyCode: string;
    locale: string;
    timezone: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    countryCode: string;
    currencyCode: string;
    locale: string;
    timezone: string;
  } | null;
  featureFlags?: Record<string, boolean>;
};

type SessionContextValue = {
  session: StaffSession | null;
  loading: boolean;
  hasCapability: (capability: string) => boolean;
  refresh: () => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);

export function StaffSessionProvider({
  children,
  area,
}: {
  children: React.ReactNode;
  area: "admin" | "operations";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await resilientFetch("/api/operations-auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      const next = (await response.json()) as StaffSession;
      setSession(response.ok && next.authenticated ? next : null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!loading && !session)
      router.replace(`/staff-login?next=${encodeURIComponent(pathname)}`);
  }, [loading, session, pathname, router]);

  const value = useMemo(
    () => ({
      session,
      loading,
      hasCapability: (capability: string) =>
        Boolean(
          session?.role?.key === "platform_admin" ||
          session?.capabilities?.includes("system.manage") ||
          session?.capabilities?.includes(capability),
        ),
      refresh,
    }),
    [session, loading, refresh],
  );
  if (loading || !session)
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-50"
        aria-busy="true"
      >
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-pulse rounded-xl bg-emerald-700" />
          <p className="mt-3 text-sm text-slate-600">Checking staff session…</p>
        </div>
      </div>
    );
  if (area === "admin" && !value.hasCapability("dashboard.read"))
    return (
      <UnauthorizedState message="Your staff account does not have administration dashboard access." />
    );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useStaffSession() {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error("useStaffSession must be used inside StaffSessionProvider");
  return value;
}
