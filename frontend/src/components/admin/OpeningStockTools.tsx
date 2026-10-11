"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/admin/AdminPrimitives";
import { AdminRecord, asText } from "@/components/admin/AdminDataTable";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { useStaffSession } from "@/components/StaffSessionProvider";
import { resilientFetch } from "@/lib/resilientFetch";

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

function localIsoDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function OpeningStockButton({
  onCreated,
}: {
  onCreated: (message: string) => void;
}) {
  const { selectedStoreId } = useAdminShell();
  const { hasCapability } = useStaffSession();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<AdminRecord[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = useMemo(() => localIsoDate(), []);

  const canAdjust = hasCapability("inventory.adjust");
  const hasStore = selectedStoreId !== "all";

  const loadProducts = useCallback(
    async (search = "") => {
      if (!hasStore) return;
      setLoadingProducts(true);
      setError("");
      try {
        const params = new URLSearchParams({
          store_id: selectedStoreId,
          limit: "100",
        });
        if (search.trim()) params.set("search", search.trim());
        const response = await resilientFetch(
          `/api/admin/products?${params.toString()}`,
          { credentials: "include", cache: "no-store" },
        );
        const body = (await response.json()) as {
          items?: AdminRecord[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "Unable to load products");
        }
        setProducts(body.items || []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load products",
        );
      } finally {
        setLoadingProducts(false);
      }
    },
    [hasStore, selectedStoreId],
  );

  useEffect(() => {
    if (!open || !hasStore) return;
    setOperationId((current) => current || crypto.randomUUID());
    const timer = window.setTimeout(() => void loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [open, hasStore, loadProducts]);

  if (!canAdjust) return null;

  function close(force = false) {
    if (busy && !force) return;
    setOpen(false);
    setError("");
    setProductSearch("");
    setProducts([]);
    setSelectedProductId("");
    setOperationId("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !hasStore) return;
    const form = new FormData(event.currentTarget);
    if (!selectedProductId) {
      setError("Select a product.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        operation_id: operationId || crypto.randomUUID(),
        store_id: selectedStoreId,
        product_id: selectedProductId,
        batch_code: String(form.get("batch_code") || "").trim(),
        quantity: Number(form.get("quantity")),
        unit_cost: Number(form.get("unit_cost")),
        expiry_date: String(form.get("expiry_date") || "").trim() || null,
        stock_date: String(form.get("stock_date") || "").trim() || today,
        reason: String(form.get("reason") || "").trim(),
      };
      const response = await resilientFetch("/api/admin/inventory/opening-stock", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        error?: string;
        idempotent?: boolean;
        batch?: AdminRecord;
      };
      if (!response.ok) {
        throw new Error(body.error || "Unable to add opening stock");
      }

      const product = products.find(
        (item) => asText(item.id) === selectedProductId,
      );
      const quantity = asText(body.batch?.quantity, String(payload.quantity));
      onCreated(
        `${asText(product?.name_en, "Product")} opening stock recorded: ${quantity} units.`,
      );
      close(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to add opening stock",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          if (!hasStore) return;
          setOperationId(crypto.randomUUID());
          setOpen(true);
        }}
        disabled={!hasStore}
        title={
          hasStore
            ? "Record opening inventory"
            : "Choose a store in the header first"
        }
      >
        Add opening stock
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-slate-950/50"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opening-stock-title"
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                  Inventory
                </p>
                <h2
                  id="opening-stock-title"
                  className="mt-1 text-xl font-semibold text-slate-950"
                >
                  Add opening stock
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Creates a new batch plus an immutable opening-stock transaction.
                  Use this only to establish the starting physical quantity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => close()}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close opening stock form"
              >
                ×
              </button>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-800">
                  Find product
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Name or SKU"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    busy={loadingProducts}
                    onClick={() => void loadProducts(productSearch)}
                  >
                    Search
                  </Button>
                </div>
              </div>

              <label className="block text-sm font-medium text-slate-800">
                Product *
                <select
                  required
                  value={selectedProductId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  disabled={loadingProducts}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={asText(product.id)} value={asText(product.id)}>
                      {asText(product.name_en)} · {asText(product.sku)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Quantity *
                  <input
                    name="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="10"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Unit cost (NPR) *
                  <input
                    name="unit_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="150"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-800">
                Batch code *
                <input
                  name="batch_code"
                  required
                  maxLength={100}
                  placeholder="OPENING-001"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  A new unique code for this product at this store.
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Stock as of *
                  <input
                    name="stock_date"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Expiry date
                  <input
                    name="expiry_date"
                    type="date"
                    min={today}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-800">
                Reason *
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  defaultValue="Opening inventory / pilot stock"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Confirm the physical count before saving. Opening stock is recorded
                as audit evidence; corrections should be entered as a separate
                adjustment rather than rewriting this entry.
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => close()}
                >
                  Cancel
                </Button>
                <Button type="submit" busy={busy}>
                  Record opening stock
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
