"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStaffSession } from "@/components/StaffSessionProvider";
import {
  AdminPageHeader,
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/admin/AdminPrimitives";
import { resilientFetch } from "@/lib/resilientFetch";

type Tier = "REGISTERED_MEMBER" | "FOUNDING_1000";
type Channel = "POS" | "WEB" | "APP" | "COD";
type ProductPrice = { sku: string; member_price: string };
type Promotion = {
  id: string;
  organization_id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";
  starts_at: string;
  ends_at: string;
  reason: string;
  version: number;
  products: Array<{ sku: string; member_price: string }>;
  tiers: Tier[];
  channels: Channel[];
};
type PreviewIssue = { code?: string; sku?: string; message?: string };
type PromotionPreview = {
  valid: boolean;
  promotion: { version: number };
  issues: PreviewIssue[];
};
type PromotionForm = {
  name: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  products: ProductPrice[];
  tiers: Tier[];
  channels: Channel[];
};

const tiers: Array<{ value: Tier; label: string }> = [
  { value: "REGISTERED_MEMBER", label: "Registered member" },
  { value: "FOUNDING_1000", label: "Founding 1,000" },
];
const channels: Array<{ value: Channel; label: string }> = [
  { value: "POS", label: "POS" },
  { value: "WEB", label: "Website" },
  { value: "APP", label: "App" },
  { value: "COD", label: "COD orders" },
];

function csrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrf_token="))
      ?.split("=")[1] || ""
  );
}

function defaultForm(): PromotionForm {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  return {
    name: "",
    startsAt: localValue(startsAt),
    endsAt: localValue(endsAt),
    reason: "",
    products: [{ sku: "", member_price: "" }],
    tiers: [],
    channels: [],
  };
}

function apiError(body: { error?: string; details?: unknown }, fallback: string) {
  const details = Array.isArray(body.details)
    ? body.details
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const issue = item as PreviewIssue;
          return [issue.sku, issue.message].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("; ")
    : "";
  return [body.error || fallback, details].filter(Boolean).join(" — ");
}

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function localDate(value: string) {
  return new Date(value).toLocaleString();
}

export function MemberPricingPage() {
  const { session, hasCapability } = useStaffSession();
  const scopedOrganizationId =
    session?.scope?.organizationId || session?.organization?.id || "";
  const globalScope = session?.scope?.type === "GLOBAL";
  const canWrite = hasCapability("pricing.write");
  const canApprove = hasCapability("pricing.approve");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const organizationId = globalScope
    ? selectedOrganizationId
    : scopedOrganizationId;
  const [form, setForm] = useState<PromotionForm>(defaultForm);
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [previews, setPreviews] = useState<Record<string, PromotionPreview>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPromotionId, setBusyPromotionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await resilientFetch(
        "/api/admin/member-pricing/promotions?limit=100",
        { credentials: "include", cache: "no-store" },
      );
      const body = (await response.json()) as {
        items?: Promotion[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to load promotions");
      if (!Array.isArray(body.items)) {
        throw new Error("The pricing service returned an invalid promotion list");
      }
      setPromotions(body.items);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load promotions",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function updateProduct(index: number, patch: Partial<ProductPrice>) {
    setForm((current) => ({
      ...current,
      products: current.products.map((product, productIndex) =>
        productIndex === index ? { ...product, ...patch } : product,
      ),
    }));
  }

  function editPromotion(promotion: Promotion) {
    const localValue = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    };
    setEditingPromotionId(promotion.id);
    setForm({
      name: promotion.name,
      startsAt: localValue(promotion.starts_at),
      endsAt: localValue(promotion.ends_at),
      reason: promotion.reason,
      products: promotion.products.map(({ sku, member_price }) => ({ sku, member_price })),
      tiers: [...promotion.tiers],
      channels: [...promotion.channels],
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!editingPromotionId && !organizationId.trim()) {
      setError("An organization ID is required.");
      return;
    }
    if (!form.tiers.length || !form.channels.length) {
      setError("Choose at least one membership tier and one channel.");
      return;
    }
    const products = form.products.map((product) => ({
      sku: product.sku.trim(),
      member_price: product.member_price.trim(),
    }));
    if (
      products.length === 0 ||
      products.some((product) => !product.sku || !product.member_price)
    ) {
      setError("Enter a SKU and member price for every product.");
      return;
    }
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setError("The end date must be later than the start date.");
      return;
    }

    setSaving(true);
    try {
      const response = await resilientFetch(
        editingPromotionId
          ? `/api/admin/member-pricing/promotions/${editingPromotionId}`
          : "/api/admin/member-pricing/promotions",
        {
          method: editingPromotionId ? "PUT" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({
            ...(!editingPromotionId ? { organization_id: organizationId.trim() } : {}),
            name: form.name.trim(),
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            reason: form.reason.trim(),
            products,
            category_ids: [],
            tiers: form.tiers,
            channels: form.channels,
          }),
        },
      );
      const body = (await response.json()) as {
        promotion?: Promotion;
        error?: string;
        details?: unknown;
      };
      if (!response.ok) {
        throw new Error(apiError(body, "Promotion creation failed"));
      }
      if (!body.promotion?.id) {
        throw new Error("The pricing service returned an invalid promotion");
      }
      if (editingPromotionId) {
        setPreviews((current) => {
          const next = { ...current };
          delete next[editingPromotionId];
          return next;
        });
      }
      setNotice(editingPromotionId ? "Promotion draft updated. Preview it again before activating." : "Draft created. Preview it before activating.");
      setForm(defaultForm());
      setEditingPromotionId(null);
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Promotion creation failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function preview(promotion: Promotion) {
    setBusyPromotionId(promotion.id);
    setError("");
    setNotice("");
    try {
      const response = await resilientFetch(
        `/api/admin/member-pricing/promotions/${promotion.id}/preview`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: "{}",
        },
      );
      const body = (await response.json()) as PromotionPreview & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Promotion preview failed");
      if (typeof body.valid !== "boolean" || !Array.isArray(body.issues)) {
        throw new Error("The pricing service returned an invalid preview");
      }
      setPreviews((current) => ({ ...current, [promotion.id]: body }));
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Promotion preview failed",
      );
    } finally {
      setBusyPromotionId(null);
    }
  }

  async function transition(
    promotion: Promotion,
    action: "activate" | "pause" | "archive",
  ) {
    if (
      action === "activate" &&
      (!previews[promotion.id]?.valid ||
        previews[promotion.id]?.promotion.version !== promotion.version)
    ) {
      setError("Preview the current promotion version before activating it.");
      return;
    }
    setBusyPromotionId(promotion.id);
    setError("");
    setNotice("");
    try {
      const response = await resilientFetch(
        `/api/admin/member-pricing/promotions/${promotion.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({ reason: promotion.reason }),
        },
      );
      const body = (await response.json()) as {
        promotion?: Promotion;
        error?: string;
        details?: unknown;
      };
      if (!response.ok) {
        throw new Error(apiError(body, "Promotion status update failed"));
      }
      if (!body.promotion?.id) {
        throw new Error("The pricing service returned an invalid promotion");
      }
      setPreviews((current) => {
        const next = { ...current };
        delete next[promotion.id];
        return next;
      });
      setNotice(`Promotion ${action}d.`);
      await load();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : "Promotion status update failed",
      );
    } finally {
      setBusyPromotionId(null);
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        eyebrow="Membership"
        title="Member pricing"
        description="Create and review product-specific member prices. The server validates price, margin, overlap, tier, channel, and date rules."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        Promotion activation is separate from the server-side member-pricing
        rollout flag. Activating a promotion does not enable member pricing.
      </p>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {canWrite && (
        <form
          onSubmit={submit}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="font-semibold text-slate-950">
              {editingPromotionId ? "Edit a draft" : "Create a draft"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              New promotions are drafts. A separately authorized approver must
              preview and activate them.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {globalScope && (
              <label className="text-sm font-medium text-slate-700">
                Organization ID
                <input
                  required
                  value={organizationId}
                  onChange={(event) =>
                    setSelectedOrganizationId(event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Organization UUID"
                />
              </label>
            )}
            <label className="text-sm font-medium text-slate-700">
              Promotion name
              <input
                required
                maxLength={255}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Starts at
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ends at
              <input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800">
              Product prices
            </legend>
            <div className="mt-2 space-y-2">
              {form.products.map((product, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]"
                >
                  <label className="text-xs text-slate-600">
                    SKU
                    <input
                      required
                      value={product.sku}
                      onChange={(event) =>
                        updateProduct(index, { sku: event.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Member price (NPR)
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={product.member_price}
                      onChange={(event) =>
                        updateProduct(index, {
                          member_price: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Remove product ${index + 1}`}
                    className="self-end"
                    disabled={form.products.length === 1}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        products: current.products.filter(
                          (_, productIndex) => productIndex !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  products: [
                    ...current.products,
                    { sku: "", member_price: "" },
                  ],
                }))
              }
            >
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">
                Eligible tiers
              </legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {tiers.map((tier) => (
                  <label key={tier.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.tiers.includes(tier.value)}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          tiers: toggle(current.tiers, tier.value),
                        }))
                      }
                    />
                    {tier.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">
                Eligible channels
              </legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {channels.map((channel) => (
                  <label
                    key={channel.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.channels.includes(channel.value)}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          channels: toggle(current.channels, channel.value),
                        }))
                      }
                    />
                    {channel.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Business reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={2}
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({ ...current, reason: event.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" busy={saving}>
              {editingPromotionId ? "Save draft" : "Create draft"}
            </Button>
            {editingPromotionId && (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setEditingPromotionId(null);
                  setForm(defaultForm());
                  setError("");
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-semibold text-slate-950">Pricing promotions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Activation rechecks margin and promotion conflicts on the server.
          </p>
        </div>
        {loading ? (
          <LoadingSkeleton />
        ) : error && promotions.length === 0 ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : promotions.length === 0 ? (
          <EmptyState
            title="No pricing promotions"
            description="Create a product-specific draft to begin."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {promotions.map((promotion) => {
              const previewResult = previews[promotion.id];
              const previewIsCurrent =
                previewResult?.promotion.version === promotion.version;
              return (
                <article key={promotion.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">
                          {promotion.name}
                        </h3>
                        <StatusBadge value={promotion.status} />
                        <span className="text-xs text-slate-500">
                          Version {promotion.version}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {localDate(promotion.starts_at)} –{" "}
                        {localDate(promotion.ends_at)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {promotion.products
                          .map(
                            (product) =>
                              `${product.sku}: NPR ${product.member_price}`,
                          )
                          .join(" · ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {promotion.tiers.join(", ")} ·{" "}
                        {promotion.channels.join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["DRAFT", "PAUSED"].includes(promotion.status) && canWrite && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyPromotionId === promotion.id || saving}
                          onClick={() => editPromotion(promotion)}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        busy={busyPromotionId === promotion.id}
                        onClick={() => void preview(promotion)}
                      >
                        Preview
                      </Button>
                      {["DRAFT", "PAUSED"].includes(promotion.status) &&
                        canApprove && (
                        <Button
                          type="button"
                          busy={busyPromotionId === promotion.id}
                          disabled={!previewResult?.valid || !previewIsCurrent}
                          onClick={() =>
                            void transition(promotion, "activate")
                          }
                        >
                          Activate
                        </Button>
                      )}
                      {promotion.status === "ACTIVE" && canWrite && (
                        <Button
                          type="button"
                          variant="secondary"
                          busy={busyPromotionId === promotion.id}
                          onClick={() => void transition(promotion, "pause")}
                        >
                          Pause
                        </Button>
                      )}
                      {["DRAFT", "ACTIVE", "PAUSED", "EXPIRED"].includes(
                        promotion.status,
                      ) &&
                        canWrite && (
                          <Button
                            type="button"
                            variant="danger"
                            busy={busyPromotionId === promotion.id}
                            onClick={() =>
                              void transition(promotion, "archive")
                            }
                          >
                            Archive
                          </Button>
                        )}
                    </div>
                  </div>
                  {previewResult && previewIsCurrent && (
                    <div
                      className={`rounded-lg p-3 text-sm ${
                        previewResult.valid
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {previewResult.valid
                        ? "Preview passed. Server activation still revalidates the promotion."
                        : "Preview found issues:"}
                      {!previewResult.valid && (
                        <ul className="mt-2 list-inside list-disc">
                          {previewResult.issues.map((issue, index) => (
                            <li key={`${issue.code || "issue"}-${index}`}>
                              {[issue.sku, issue.message || issue.code]
                                .filter(Boolean)
                                .join(": ")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {!canWrite && (
                    <p className="text-xs text-slate-500">
                      Read-only access. Your role cannot edit or transition
                      promotions.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
