"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/admin/AdminPrimitives";
import { resilientFetch } from "@/lib/resilientFetch";

export type AdminRecord = Record<string, unknown>;
export type Column = {
  key: string;
  label: string;
  className?: string;
  render?: (record: AdminRecord) => React.ReactNode;
};
export type FilterOption = { label: string; value: string };
export type TableFilter = {
  key: string;
  label: string;
  options: FilterOption[];
};

export function asText(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}
export function money(value: unknown, currency = "NPR") {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-NP", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount)
    : "—";
}
export function dateTime(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("en-NP", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

function csvValue(value: unknown) {
  const text =
    typeof value === "object" ? JSON.stringify(value) : asText(value, "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function AdminDataTable({
  endpoint,
  columns,
  filters = [],
  detailHref,
  emptyTitle,
  refreshKey = 0,
}: {
  endpoint: string;
  columns: Column[];
  filters?: TableFilter[];
  detailHref?: (record: AdminRecord) => string;
  emptyTitle?: string;
  refreshKey?: number;
}) {
  const { selectedStoreId } = useAdminShell();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      filters.map((filter) => [filter.key, searchParams.get(filter.key) || ""]),
    ),
  );
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const resetPage = () => setPage(1);
    window.addEventListener("storesync:store-scope", resetPage);
    return () => window.removeEventListener("storesync:store-scope", resetPage);
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set("limit", String(pageSize));
        url.searchParams.set("offset", String((page - 1) * pageSize));
        if (refreshKey) url.searchParams.set("_refresh", String(refreshKey));
        if (debouncedSearch) url.searchParams.set("search", debouncedSearch);
        const requestedDate = searchParams.get("date");
        if (requestedDate) {
          url.searchParams.set("date_from", `${requestedDate}T00:00:00.000Z`);
          url.searchParams.set("date_to", `${requestedDate}T23:59:59.999Z`);
        }
        if (selectedStoreId !== "all")
          url.searchParams.set("store_id", selectedStoreId);
        Object.entries(filterValues).forEach(([key, value]) => {
          if (value) url.searchParams.set(key, value);
        });
        const response = await resilientFetch(`${url.pathname}${url.search}`, {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        const body = (await response.json()) as
          | AdminRecord[]
          | { items?: AdminRecord[]; total?: number; error?: unknown };
        if (!response.ok)
          throw new Error(
            asText(
              !Array.isArray(body) ? body.error : undefined,
              "Unable to load records",
            ),
          );
        const items = Array.isArray(body) ? body : body.items || [];
        setRecords(items);
        setTotal(
          Array.isArray(body)
            ? (page - 1) * pageSize +
                items.length +
                (items.length === pageSize ? 1 : 0)
            : Number(body.total ?? items.length),
        );
      } catch (loadError) {
        if (!(
          loadError instanceof DOMException && loadError.name === "AbortError"
        ))
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load records",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      endpoint,
      page,
      debouncedSearch,
      filterValues,
      selectedStoreId,
      refreshKey,
      searchParams,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const exportRows = useMemo(
    () =>
      [
        columns.map((column) => csvValue(column.label)).join(","),
        ...records.map((record) =>
          columns.map((column) => csvValue(record[column.key])).join(","),
        ),
      ].join("\r\n"),
    [columns, records],
  );
  function downloadCsv() {
    const blob = new Blob([exportRows], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `admin-export-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1 lg:max-w-sm">
          <span className="sr-only">Search records</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search this view…"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </label>
        {filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            {filters.map((filter) => (
              <label key={filter.key}>
                <span className="sr-only">{filter.label}</span>
                <select
                  value={filterValues[filter.key] || ""}
                  onChange={(event) => {
                    setPage(1);
                    setFilterValues((current) => ({
                      ...current,
                      [filter.key]: event.target.value,
                    }));
                  }}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700"
                >
                  <option value="">All {filter.label.toLowerCase()}</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!records.length}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export view
        </button>
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : records.length === 0 ? (
        <EmptyState
          title={emptyTitle || "No records found"}
          description={
            search || Object.values(filterValues).some(Boolean)
              ? "Try changing your search or filters."
              : "Records will appear here when they are created."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`border-b border-slate-200 px-4 py-3 ${column.className || ""}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record, index) => {
                const href = detailHref?.(record);
                return (
                  <tr
                    key={asText(record.id || record.sku, String(index))}
                    className="group hover:bg-slate-50"
                  >
                    {columns.map((column, columnIndex) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 align-middle text-slate-600 ${column.className || ""}`}
                      >
                        {columnIndex === 0 && href ? (
                          <Link
                            href={href}
                            className="font-semibold text-slate-950 hover:text-emerald-700 hover:underline"
                          >
                            {column.render
                              ? column.render(record)
                              : asText(record[column.key])}
                          </Link>
                        ) : column.render ? (
                          column.render(record)
                        ) : /status/i.test(column.key) ? (
                          <StatusBadge value={record[column.key]} />
                        ) : (
                          asText(record[column.key])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : "0 records"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-20 text-center">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
