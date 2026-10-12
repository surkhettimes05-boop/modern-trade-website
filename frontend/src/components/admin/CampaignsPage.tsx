"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Pencil, Plus, RefreshCw } from "lucide-react";
import { resilientFetch } from "@/lib/resilientFetch";
import { useStaffSession } from "@/components/StaffSessionProvider";
import {
  AdminPageHeader,
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/admin/AdminPrimitives";

type Choice = { id: string; name?: string; name_en?: string; sku?: string };

type Promotion = {
  promotion_type: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_X_GET_Y" | "FREE_SHIPPING";
  discount_value: number | string;
  minimum_order_value?: number | string | null;
  maximum_discount_amount?: number | string | null;
  buy_quantity?: number | string | null;
  get_quantity?: number | string | null;
  get_product_id?: string | null;
  can_combine_with_other_promotions?: boolean;
};

type Campaign = {
  id: string;
  name: string;
  title_en: string;
  title_ne?: string | null;
  subtitle_en?: string | null;
  subtitle_ne?: string | null;
  description_en: string;
  description_ne?: string | null;
  image_url?: string | null;
  banner_image_url?: string | null;
  mobile_banner_image_url?: string | null;
  cta_text_en?: string | null;
  cta_text_ne?: string | null;
  cta_url?: string | null;
  start_date: string;
  end_date: string;
  terms_en?: string | null;
  terms_ne?: string | null;
  status: string;
  is_featured: boolean;
  sort_order: number;
  channels: Array<"WEB" | "APP">;
  placements: Array<"HOME_HERO" | "OFFERS_PAGE" | "CATEGORY_BANNER" | "APP_HOME">;
  store_id?: string | null;
  product_ids: string[];
  category_ids: string[];
  promotion?: Promotion | null;
};

type FormState = {
  name: string;
  title_en: string;
  subtitle_en: string;
  description_en: string;
  start_date: string;
  end_date: string;
  status: string;
  image_url: string;
  banner_image_url: string;
  mobile_banner_image_url: string;
  cta_text_en: string;
  cta_url: string;
  terms_en: string;
  is_featured: boolean;
  sort_order: string;
  channels: Array<"WEB" | "APP">;
  placements: Array<"HOME_HERO" | "OFFERS_PAGE" | "CATEGORY_BANNER" | "APP_HOME">;
  store_id: string;
  product_ids: string[];
  category_ids: string[];
  promotion_type: "NONE" | Promotion["promotion_type"];
  discount_value: string;
  minimum_order_value: string;
  maximum_discount_amount: string;
  buy_quantity: string;
  get_quantity: string;
  get_product_id: string;
};

function localInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaults(): FormState {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    name: "",
    title_en: "",
    subtitle_en: "",
    description_en: "",
    start_date: localInputValue(start.toISOString()),
    end_date: localInputValue(end.toISOString()),
    status: "DRAFT",
    image_url: "",
    banner_image_url: "",
    mobile_banner_image_url: "",
    cta_text_en: "Shop now",
    cta_url: "/shop",
    terms_en: "",
    is_featured: false,
    sort_order: "0",
    channels: ["WEB", "APP"],
    placements: ["HOME_HERO", "OFFERS_PAGE", "APP_HOME"],
    store_id: "",
    product_ids: [],
    category_ids: [],
    promotion_type: "NONE",
    discount_value: "0",
    minimum_order_value: "",
    maximum_discount_amount: "",
    buy_quantity: "",
    get_quantity: "",
    get_product_id: "",
  };
}

function fromCampaign(campaign: Campaign): FormState {
  return {
    ...defaults(),
    name: campaign.name || campaign.title_en,
    title_en: campaign.title_en,
    subtitle_en: campaign.subtitle_en || "",
    description_en: campaign.description_en,
    start_date: localInputValue(campaign.start_date),
    end_date: localInputValue(campaign.end_date),
    status: campaign.status,
    image_url: campaign.image_url || "",
    banner_image_url: campaign.banner_image_url || "",
    mobile_banner_image_url: campaign.mobile_banner_image_url || "",
    cta_text_en: campaign.cta_text_en || "",
    cta_url: campaign.cta_url || "",
    terms_en: campaign.terms_en || "",
    is_featured: Boolean(campaign.is_featured),
    sort_order: String(campaign.sort_order || 0),
    channels: campaign.channels?.length ? campaign.channels : ["WEB", "APP"],
    placements: campaign.placements?.length
      ? campaign.placements
      : ["OFFERS_PAGE"],
    store_id: campaign.store_id || "",
    product_ids: campaign.product_ids || [],
    category_ids: campaign.category_ids || [],
    promotion_type: campaign.promotion?.promotion_type || "NONE",
    discount_value: String(campaign.promotion?.discount_value ?? 0),
    minimum_order_value: String(campaign.promotion?.minimum_order_value ?? ""),
    maximum_discount_amount: String(
      campaign.promotion?.maximum_discount_amount ?? "",
    ),
    buy_quantity: String(campaign.promotion?.buy_quantity ?? ""),
    get_quantity: String(campaign.promotion?.get_quantity ?? ""),
    get_product_id: campaign.promotion?.get_product_id || "",
  };
}

function csrfToken() {
  return (
    document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrf_token="))
      ?.split("=")[1] || ""
  );
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function numeric(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export function CampaignsPage() {
  const { hasCapability } = useStaffSession();
  const canWrite = hasCapability("content.write");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<Choice[]>([]);
  const [categories, setCategories] = useState<Choice[]>([]);
  const [stores, setStores] = useState<Choice[]>([]);
  const [form, setForm] = useState<FormState>(defaults);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignResponse, productResponse, categoryResponse, storeResponse] =
        await Promise.all([
          resilientFetch("/api/admin/campaigns", {
            credentials: "include",
            cache: "no-store",
          }),
          resilientFetch("/api/admin/products?limit=200", {
            credentials: "include",
            cache: "no-store",
          }),
          resilientFetch("/api/admin/categories?limit=200", {
            credentials: "include",
            cache: "no-store",
          }),
          resilientFetch("/api/admin/context/stores", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
      const campaignBody = (await campaignResponse.json()) as {
        items?: Campaign[];
        error?: string;
      };
      if (!campaignResponse.ok)
        throw new Error(campaignBody.error || "Unable to load campaigns");
      const productBody = (await productResponse.json()) as {
        items?: Choice[];
      };
      const categoryBody = (await categoryResponse.json()) as {
        items?: Choice[];
      };
      const storeBody = (await storeResponse.json()) as { items?: Choice[] };
      setCampaigns(campaignBody.items || []);
      setProducts(productBody.items || []);
      setCategories(categoryBody.items || []);
      setStores(storeBody.items || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load campaigns",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProductNames = useMemo(
    () =>
      form.product_ids
        .map((id) => products.find((item) => item.id === id))
        .filter(Boolean)
        .map((item) => item?.name_en || item?.name || item?.sku)
        .join(", "),
    [form.product_ids, products],
  );

  function reset() {
    setEditingId(null);
    setForm(defaults());
    setError("");
    setNotice("");
  }

  function edit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm(fromCampaign(campaign));
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.channels.length || !form.placements.length) {
      setError("Choose at least one channel and one placement.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const promotion =
      form.promotion_type === "NONE"
        ? null
        : {
            promotion_type: form.promotion_type,
            discount_value: Number(form.discount_value || 0),
            minimum_order_value: numeric(form.minimum_order_value),
            maximum_discount_amount: numeric(form.maximum_discount_amount),
            buy_quantity: numeric(form.buy_quantity),
            get_quantity: numeric(form.get_quantity),
            get_product_id: form.get_product_id || null,
            can_combine_with_other_promotions: false,
          };
    const payload = {
      name: form.name,
      title_en: form.title_en,
      subtitle_en: form.subtitle_en || null,
      description_en: form.description_en,
      image_url: form.image_url || null,
      banner_image_url: form.banner_image_url || null,
      mobile_banner_image_url: form.mobile_banner_image_url || null,
      cta_text_en: form.cta_text_en || null,
      cta_url: form.cta_url || null,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      terms_en: form.terms_en || null,
      status: form.status,
      is_featured: form.is_featured,
      sort_order: Number(form.sort_order || 0),
      channels: form.channels,
      placements: form.placements,
      store_id: form.store_id || null,
      product_ids: form.product_ids,
      category_ids: form.category_ids,
      promotion,
    };
    try {
      const response = await resilientFetch(
        editingId ? `/api/admin/campaigns/${editingId}` : "/api/admin/campaigns",
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as Campaign & { error?: string };
      if (!response.ok) throw new Error(body.error || "Campaign save failed");
      setNotice(editingId ? "Campaign updated." : "Campaign created.");
      setEditingId(body.id);
      setForm(fromCampaign(body));
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Campaign save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        eyebrow="Commerce content"
        title="Campaigns"
        description="Create one campaign and publish the same commercial content to Pasalho web and app, while each channel keeps its own layout."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={reset} disabled={!canWrite}>
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          </>
        }
      />

      {!canWrite && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          You can view campaigns, but your staff role does not include content.write.
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">
              {editingId ? "Edit campaign" : "Create campaign"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Marketing content is shared. Desktop and mobile creative can differ.
            </p>
          </div>
          <Button type="submit" busy={saving} disabled={!canWrite}>
            {editingId ? "Save changes" : "Create campaign"}
          </Button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Field label="Internal campaign name">
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="Dashain Mega Savings"
            />
          </Field>
          <Field label="Customer headline">
            <input
              required
              value={form.title_en}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title_en: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="Save more this Dashain"
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={form.subtitle_en}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subtitle_en: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="Festival essentials at better prices"
            />
          </Field>
          <Field label="Store scope">
            <select
              value={form.store_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  store_id: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">All stores / global</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name_en || store.name || store.id}
                </option>
              ))}
            </select>
          </Field>
          <div className="lg:col-span-2">
            <Field label="Description">
              <textarea
                required
                rows={3}
                value={form.description_en}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description_en: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="Explain the value of the campaign in one or two sentences."
              />
            </Field>
          </div>

          <Field label="Start date & time">
            <input
              required
              type="datetime-local"
              value={form.start_date}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </Field>
          <Field label="End date & time">
            <input
              required
              type="datetime-local"
              value={form.end_date}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  end_date: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {["DRAFT", "REVIEW", "PUBLISHED", "SCHEDULED", "UNPUBLISHED"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Display priority">
            <input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sort_order: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </Field>

          <div className="lg:col-span-2 grid gap-5 lg:grid-cols-3">
            <Field label="Desktop hero / banner URL">
              <input
                value={form.banner_image_url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    banner_image_url: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="https://res.cloudinary.com/..."
              />
            </Field>
            <Field label="Mobile hero / banner URL">
              <input
                value={form.mobile_banner_image_url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mobile_banner_image_url: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="https://res.cloudinary.com/..."
              />
            </Field>
            <Field label="Offer card image URL">
              <input
                value={form.image_url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    image_url: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="https://res.cloudinary.com/..."
              />
            </Field>
          </div>

          <Field label="CTA label">
            <input
              value={form.cta_text_en}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  cta_text_en: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="Shop the offer"
            />
          </Field>
          <Field label="CTA destination">
            <input
              value={form.cta_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  cta_url: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
              placeholder="/offers"
            />
          </Field>

          <CheckboxGroup
            label="Channels"
            values={form.channels}
            options={[
              ["WEB", "Website"],
              ["APP", "Customer app"],
            ]}
            onToggle={(value) =>
              setForm((current) => ({
                ...current,
                channels: toggleValue(current.channels, value as "WEB" | "APP"),
              }))
            }
          />
          <CheckboxGroup
            label="Placements"
            values={form.placements}
            options={[
              ["HOME_HERO", "Homepage hero"],
              ["OFFERS_PAGE", "Offers page"],
              ["APP_HOME", "App home"],
              ["CATEGORY_BANNER", "Category banner"],
            ]}
            onToggle={(value) =>
              setForm((current) => ({
                ...current,
                placements: toggleValue(
                  current.placements,
                  value as FormState["placements"][number],
                ),
              }))
            }
          />

          <div className="lg:col-span-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.is_featured}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_featured: event.target.checked,
                  }))
                }
              />
              Featured campaign
            </label>
          </div>

          <SelectionBox
            label="Included products"
            choices={products}
            selected={form.product_ids}
            onChange={(ids) =>
              setForm((current) => ({ ...current, product_ids: ids }))
            }
            format={(item) =>
              `${item.name_en || item.name || "Product"}${item.sku ? ` · ${item.sku}` : ""}`
            }
          />
          <SelectionBox
            label="Included categories"
            choices={categories}
            selected={form.category_ids}
            onChange={(ids) =>
              setForm((current) => ({ ...current, category_ids: ids }))
            }
            format={(item) => item.name_en || item.name || item.id}
          />

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Discount rule
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              This links the campaign to the existing promotion data model. It
              does not turn on the deferred checkout promotion engine.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="Rule type">
                <select
                  value={form.promotion_type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      promotion_type: event.target
                        .value as FormState["promotion_type"],
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="NONE">No discount rule</option>
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                  <option value="BUY_X_GET_Y">Buy X get Y</option>
                  <option value="FREE_SHIPPING">Free shipping</option>
                </select>
              </Field>
              <Field label="Discount value">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.promotion_type === "NONE"}
                  value={form.discount_value}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      discount_value: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </Field>
              <Field label="Minimum order">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.promotion_type === "NONE"}
                  value={form.minimum_order_value}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      minimum_order_value: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </Field>
              {form.promotion_type === "PERCENTAGE" && (
                <Field label="Maximum discount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maximum_discount_amount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maximum_discount_amount: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </Field>
              )}
              {form.promotion_type === "BUY_X_GET_Y" && (
                <>
                  <Field label="Buy quantity">
                    <input
                      type="number"
                      min="1"
                      value={form.buy_quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          buy_quantity: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </Field>
                  <Field label="Get quantity">
                    <input
                      type="number"
                      min="1"
                      value={form.get_quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          get_quantity: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </Field>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Field label="Terms">
              <textarea
                rows={2}
                value={form.terms_en}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    terms_en: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="Optional customer-facing terms"
              />
            </Field>
          </div>
        </div>
        {selectedProductNames && (
          <p className="mt-4 text-xs text-slate-500">
            Products: {selectedProductNames}
          </p>
        )}
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Campaign library</h2>
          <p className="mt-1 text-sm text-slate-500">
            Published campaigns become eligible for their selected channels and
            placements during the configured date window.
          </p>
        </div>
        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : error && !campaigns.length ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : !campaigns.length ? (
          <EmptyState
            title="No campaigns yet"
            description="Create the first campaign above."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((campaign) => (
              <article
                key={campaign.id}
                className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">
                      {campaign.title_en}
                    </h3>
                    <StatusBadge value={campaign.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {campaign.name} · {campaign.channels.join(" + ")} ·{" "}
                    {campaign.placements.join(", ").replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(campaign.start_date).toLocaleString("en-NP")} –{" "}
                    {new Date(campaign.end_date).toLocaleString("en-NP")}
                    {campaign.promotion
                      ? ` · ${campaign.promotion.promotion_type.replaceAll("_", " ")} ${campaign.promotion.discount_value}`
                      : ""}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => edit(campaign)} disabled={!canWrite}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckboxGroup({
  label,
  values,
  options,
  onToggle,
}: {
  label: string;
  values: string[];
  options: Array<[string, string]>;
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, text]) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={() => onToggle(value)}
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SelectionBox({
  label,
  choices,
  selected,
  onChange,
  format,
}: {
  label: string;
  choices: Choice[];
  selected: string[];
  onChange: (ids: string[]) => void;
  format: (choice: Choice) => string;
}) {
  return (
    <Field label={label}>
      <select
        multiple
        value={selected}
        onChange={(event) =>
          onChange(
            Array.from(event.currentTarget.selectedOptions).map(
              (option) => option.value,
            ),
          )
        }
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400 min-h-36"
      >
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {format(choice)}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-slate-400">
        Hold Ctrl/Cmd to select multiple.
      </span>
    </Field>
  );
}
