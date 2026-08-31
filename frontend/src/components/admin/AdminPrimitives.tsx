"use client";

import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      aria-label="Loading"
      aria-busy="true"
      className="animate-pulse space-y-3 p-5"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-11 rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "There are no records matching this view.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <Inbox className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-sm font-semibold text-slate-900">
        Unable to load this view
      </h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ value }: { value: unknown }) {
  const text = String(value || "Unknown").replaceAll("_", " ");
  const normalized = text.toLowerCase();
  const tone =
    /active|paid|published|approved|delivered|received|complete|verified|available/.test(
      normalized,
    )
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : /failed|cancel|reject|out of stock|expired|terminated|overdue/.test(
            normalized,
          )
        ? "bg-red-50 text-red-700 ring-red-600/20"
        : /pending|draft|processing|partial|low|review|scheduled|sent/.test(
              normalized,
            )
          ? "bg-amber-50 text-amber-800 ring-amber-600/20"
          : "bg-slate-100 text-slate-700 ring-slate-600/20";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}
    >
      {text.toLowerCase()}
    </span>
  );
}

export function Button({
  children,
  busy,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const tones =
    variant === "primary"
      ? "bg-emerald-700 text-white hover:bg-emerald-800"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 ${tones} ${props.className || ""}`}
    >
      {busy && (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
