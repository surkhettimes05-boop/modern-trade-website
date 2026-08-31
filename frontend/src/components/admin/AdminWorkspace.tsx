"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  PackagePlus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Store,
  TriangleAlert,
  Users,
  Warehouse,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AdminDataTable,
  AdminRecord,
  Column,
  TableFilter,
  asText,
  dateTime,
  money,
} from "@/components/admin/AdminDataTable";
import {
  AdminPageHeader,
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/admin/AdminPrimitives";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { useStaffSession } from "@/components/StaffSessionProvider";
import { resilientFetch } from "@/lib/resilientFetch";

type FormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "textarea" | "select";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};
type ResourceConfig = {
  title: string;
  description: string;
  eyebrow: string;
  capability: string;
  endpoint: string;
  columns: Column[];
  filters?: TableFilter[];
  detailBase?: string;
  createCapability?: string;
  createLabel?: string;
  fields?: FormField[];
  detailEndpoint?: (id: string) => string;
  relatedEndpoint?: (id: string) => string;
  relatedTitle?: string;
};

const statusOptions = [
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "UNPUBLISHED",
].map((value) => ({ label: value.replaceAll("_", " "), value }));
const orderStatuses = [
  "PENDING",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PICKING",
  "PACKED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURN_REQUESTED",
  "RETURNED",
  "CANCELLED",
  "REFUNDED",
].map((value) => ({ label: value.replaceAll("_", " "), value }));

const resources: Record<string, ResourceConfig> = {
  "content/pages": {
    title: "Content pages",
    description:
      "Manage customer-facing information pages and publication timing.",
    eyebrow: "Content",
    capability: "content.read",
    endpoint: "/api/admin/pages",
    detailBase: "/admin/content/pages",
    createCapability: "content.write",
    createLabel: "Create page",
    fields: [
      { name: "slug", label: "Slug", required: true },
      { name: "title_en", label: "Page title", required: true },
      {
        name: "content_en",
        label: "Content",
        type: "textarea",
        required: true,
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: statusOptions,
      },
    ],
    columns: [
      { key: "title_en", label: "Page" },
      { key: "slug", label: "Slug" },
      { key: "status", label: "Status" },
      {
        key: "published_at",
        label: "Published",
        render: (row) => dateTime(row.published_at),
      },
      {
        key: "updated_at",
        label: "Updated",
        render: (row) => dateTime(row.updated_at),
      },
    ],
    filters: [{ key: "status", label: "Status", options: statusOptions }],
  },
  "catalog/products": {
    title: "Products",
    description:
      "Manage product identity, publication, categories, and stock visibility.",
    eyebrow: "Catalog",
    capability: "catalog.read",
    endpoint: "/api/admin/products",
    detailBase: "/admin/catalog/products",
    createCapability: "catalog.write",
    createLabel: "Create product",
    fields: [
      { name: "sku", label: "SKU", required: true },
      { name: "name_en", label: "Product name", required: true },
      { name: "description_en", label: "Description", type: "textarea" },
      { name: "image_url", label: "Image URL", type: "url" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: statusOptions,
      },
    ],
    columns: [
      {
        key: "name_en",
        label: "Product",
        render: (row) => (
          <div className="flex items-center gap-3">
            {row.image_url ? (
              <span className="relative h-9 w-9 overflow-hidden rounded-lg bg-slate-100">
                <Image
                  src={String(row.image_url)}
                  alt=""
                  fill
                  sizes="36px"
                  unoptimized
                  className="object-cover"
                />
              </span>
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                {asText(row.name_en).slice(0, 1)}
              </span>
            )}
            <span>{asText(row.name_en)}</span>
          </div>
        ),
      },
      { key: "sku", label: "SKU" },
      { key: "category_name", label: "Category" },
      {
        key: "price",
        label: "Price",
        render: (row) => money(row.price, asText(row.currency_code, "NPR")),
      },
      { key: "stock", label: "Stock" },
      { key: "status", label: "Status" },
      {
        key: "updated_at",
        label: "Updated",
        render: (row) => dateTime(row.updated_at),
      },
    ],
    filters: [
      { key: "status", label: "Status", options: statusOptions },
      {
        key: "stock",
        label: "Stock",
        options: [
          { label: "In stock", value: "in" },
          { label: "Low stock", value: "low" },
          { label: "Out of stock", value: "out" },
        ],
      },
    ],
  },
  "catalog/categories": {
    title: "Categories",
    description: "Organize the catalog and control category publication.",
    eyebrow: "Catalog",
    capability: "catalog.read",
    endpoint: "/api/admin/categories",
    detailBase: "/admin/catalog/categories",
    createCapability: "catalog.write",
    createLabel: "Create category",
    fields: [
      { name: "name_en", label: "Category name", required: true },
      { name: "slug", label: "Slug", required: true },
      { name: "description_en", label: "Description", type: "textarea" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: statusOptions,
      },
    ],
    columns: [
      { key: "name_en", label: "Category" },
      { key: "slug", label: "Slug" },
      { key: "parent_name", label: "Parent" },
      { key: "product_count", label: "Products" },
      { key: "sort_order", label: "Order" },
      { key: "status", label: "Status" },
    ],
  },
  "commerce/orders": {
    title: "Orders",
    description:
      "Review payments, fulfilment progress, and orders requiring action.",
    eyebrow: "Commerce",
    capability: "orders.read",
    endpoint: "/api/admin/orders",
    detailBase: "/admin/commerce/orders",
    relatedEndpoint: (id) => `/api/admin/orders/${id}/items`,
    relatedTitle: "Line items",
    columns: [
      { key: "order_number", label: "Order" },
      {
        key: "customer_name",
        label: "Customer",
        render: (row) => asText(row.customer_name || row.shipping_name),
      },
      { key: "store_name", label: "Store" },
      {
        key: "order_date",
        label: "Placed",
        render: (row) => dateTime(row.order_date),
      },
      { key: "payment_status", label: "Payment" },
      { key: "status", label: "Order status" },
      {
        key: "total_amount",
        label: "Total",
        render: (row) => money(row.total_amount, asText(row.currency, "NPR")),
      },
    ],
    filters: [
      { key: "status", label: "Status", options: orderStatuses },
      {
        key: "payment_status",
        label: "Payment",
        options: ["PENDING", "PAID", "FAILED", "REFUNDED"].map((value) => ({
          label: value,
          value,
        })),
      },
    ],
  },
  customers: {
    title: "Customers",
    description: "Customer profiles, verification state, and commerce history.",
    eyebrow: "Commerce",
    capability: "customers.read",
    endpoint: "/api/admin/customers",
    detailBase: "/admin/customers",
    relatedEndpoint: (id) => `/api/admin/customers/${id}/orders`,
    relatedTitle: "Order history",
    columns: [
      {
        key: "preferred_name",
        label: "Customer",
        render: (row) => asText(row.preferred_name, "Unnamed customer"),
      },
      { key: "email", label: "Email" },
      { key: "phone_masked", label: "Phone" },
      { key: "order_count", label: "Orders" },
      {
        key: "total_spend",
        label: "Total spend",
        render: (row) => money(row.total_spend),
      },
      {
        key: "last_order_at",
        label: "Last order",
        render: (row) => dateTime(row.last_order_at),
      },
      { key: "status", label: "Status" },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: ["ACTIVE", "SUSPENDED", "DELETED"].map((value) => ({
          label: value,
          value,
        })),
      },
    ],
  },
  stores: {
    title: "Stores",
    description: "Authorized locations, contact details, and operating status.",
    eyebrow: "Organization",
    capability: "stores.read",
    endpoint: "/api/admin/stores",
    detailBase: "/admin/stores",
    createCapability: "stores.manage",
    createLabel: "Create store",
    fields: [
      { name: "name_en", label: "Store name", required: true },
      {
        name: "address_en",
        label: "Address",
        type: "textarea",
        required: true,
      },
      { name: "phone", label: "Phone", required: true },
      { name: "email", label: "Email", type: "email" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: statusOptions,
      },
    ],
    columns: [
      { key: "name_en", label: "Store" },
      { key: "address_en", label: "Address" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "staff_count", label: "Staff" },
      { key: "status", label: "Status" },
    ],
  },
  inventory: {
    title: "Inventory",
    description:
      "On-hand quantities, cost value, expiry risk, and reorder exceptions by store.",
    eyebrow: "Retail operations",
    capability: "inventory.read",
    endpoint: "/api/admin/inventory",
    detailBase: "/admin/catalog/products",
    columns: [
      { key: "product_name", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "store_name", label: "Store" },
      { key: "on_hand", label: "On hand" },
      { key: "incoming", label: "Incoming" },
      {
        key: "inventory_value",
        label: "Value",
        render: (row) => money(row.inventory_value),
      },
      { key: "stock_status", label: "Stock state" },
      {
        key: "nearest_expiry",
        label: "Nearest expiry",
        render: (row) =>
          row.nearest_expiry
            ? new Intl.DateTimeFormat("en-NP", { dateStyle: "medium" }).format(
                new Date(String(row.nearest_expiry)),
              )
            : "—",
      },
    ],
    filters: [
      {
        key: "stock",
        label: "Stock",
        options: [
          { label: "In stock", value: "in" },
          { label: "Low stock", value: "low" },
          { label: "Out of stock", value: "out" },
        ],
      },
    ],
  },
  "inventory/batches": {
    title: "Inventory batches",
    description: "Trace batch quantities, costs, receiving dates, and expiry.",
    eyebrow: "Inventory",
    capability: "inventory.read",
    endpoint: "/api/admin/batches",
    columns: [
      { key: "batch_id", label: "Batch" },
      { key: "product_name", label: "Product" },
      { key: "store_name", label: "Store" },
      { key: "quantity", label: "Quantity" },
      {
        key: "cost",
        label: "Unit cost",
        render: (row) => money(row.cost || row.unit_cost),
      },
      { key: "received_date", label: "Received" },
      { key: "expiry_date", label: "Expiry" },
    ],
  },
  "inventory/adjustments": {
    title: "Inventory adjustments",
    description:
      "Immutable history of manual stock changes and responsible staff.",
    eyebrow: "Inventory",
    capability: "inventory.adjust",
    endpoint: "/api/admin/inventory-adjustments",
    columns: [
      {
        key: "created_at",
        label: "Timestamp",
        render: (row) => dateTime(row.created_at),
      },
      { key: "product_name", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "store_name", label: "Store" },
      { key: "quantity_change", label: "Change" },
      { key: "reason", label: "Reason" },
      { key: "staff_name", label: "Staff" },
    ],
  },
  "procurement/suppliers": {
    title: "Suppliers",
    description: "Manage supplier relationships and purchasing readiness.",
    eyebrow: "Procurement",
    capability: "procurement.read",
    endpoint: "/api/admin/suppliers",
    detailBase: "/admin/procurement/suppliers",
    columns: [
      { key: "supplier_name", label: "Supplier" },
      { key: "contact_person", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "city", label: "City" },
      { key: "approval_status", label: "Approval" },
      { key: "status", label: "Status" },
    ],
  },
  "procurement/purchase-orders": {
    title: "Purchase orders",
    description: "Track supplier orders from draft through receiving.",
    eyebrow: "Procurement",
    capability: "procurement.read",
    endpoint: "/api/admin/purchase-orders",
    detailBase: "/admin/procurement/purchase-orders",
    relatedEndpoint: (id) => `/api/admin/purchase-orders/${id}/items`,
    relatedTitle: "Ordered items",
    columns: [
      { key: "po_number", label: "PO number" },
      { key: "supplier_name", label: "Supplier" },
      { key: "store_name", label: "Store" },
      { key: "status", label: "Status" },
      { key: "expected_delivery_date", label: "Expected" },
      {
        key: "total_amount",
        label: "Total",
        render: (row) => money(row.total_amount, asText(row.currency, "NPR")),
      },
      {
        key: "created_at",
        label: "Created",
        render: (row) => dateTime(row.created_at),
      },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: [
          "DRAFT",
          "PENDING_APPROVAL",
          "APPROVED",
          "SENT",
          "ACKNOWLEDGED",
          "PARTIAL_RECEIVED",
          "RECEIVED",
          "CANCELLED",
        ].map((value) => ({ label: value.replaceAll("_", " "), value })),
      },
    ],
  },
  "procurement/receiving": {
    title: "Receiving",
    description:
      "Record deliveries, discrepancies, and completed inventory receipts.",
    eyebrow: "Procurement",
    capability: "procurement.read",
    endpoint: "/api/admin/receiving",
    detailBase: "/admin/procurement/receiving",
    relatedEndpoint: (id) => `/api/admin/receiving/${id}/items`,
    relatedTitle: "Received items",
    columns: [
      { key: "receiving_number", label: "Receipt" },
      { key: "po_number", label: "Purchase order" },
      { key: "supplier_name", label: "Supplier" },
      { key: "store_name", label: "Store" },
      { key: "status", label: "Status" },
      {
        key: "received_date",
        label: "Received",
        render: (row) => dateTime(row.received_date || row.created_at),
      },
      { key: "received_by", label: "Received by" },
    ],
  },
  "organization/staff": {
    title: "Staff",
    description:
      "Team identities, roles, store assignments, and access status.",
    eyebrow: "Organization",
    capability: "staff.read",
    endpoint: "/api/admin/staff",
    detailBase: "/admin/organization/staff",
    columns: [
      {
        key: "full_name",
        label: "Staff member",
        render: (row) =>
          asText(
            row.full_name ||
              `${asText(row.first_name, "")} ${asText(row.last_name, "")}`.trim(),
          ),
      },
      { key: "username", label: "Username" },
      { key: "staff_number", label: "Staff number" },
      {
        key: "role_name",
        label: "Role",
        render: (row) => asText(row.role_name || row.role),
      },
      { key: "store_name", label: "Store" },
      { key: "status", label: "Status" },
      {
        key: "updated_at",
        label: "Last activity",
        render: (row) => dateTime(row.last_activity_at || row.updated_at),
      },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        options: ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"].map(
          (value) => ({ label: value, value }),
        ),
      },
    ],
  },
  "organization/roles": {
    title: "Roles and permissions",
    description:
      "Review role levels, capability assignments, and staff coverage.",
    eyebrow: "Organization",
    capability: "roles.manage",
    endpoint: "/api/admin/roles",
    detailBase: "/admin/organization/roles",
    columns: [
      { key: "role_name", label: "Role" },
      { key: "role_key", label: "Key" },
      { key: "role_level", label: "Access level" },
      { key: "capability_count", label: "Capabilities" },
      { key: "staff_count", label: "Assigned staff" },
      {
        key: "is_active",
        label: "Status",
        render: (row) => (
          <StatusBadge value={row.is_active ? "Active" : "Inactive"} />
        ),
      },
    ],
  },
  audit: {
    title: "Audit log",
    description:
      "Immutable security and business activity across authorized scope.",
    eyebrow: "Governance",
    capability: "audit.read",
    endpoint: "/api/admin/audit",
    detailBase: "/admin/audit",
    columns: [
      {
        key: "created_at",
        label: "Timestamp",
        render: (row) => dateTime(row.created_at),
      },
      { key: "actor_name", label: "Staff" },
      { key: "event_type", label: "Action" },
      { key: "entity_type", label: "Resource" },
      { key: "entity_id", label: "Resource ID" },
      { key: "store_name", label: "Store" },
      { key: "ip_address", label: "IP address" },
    ],
    filters: [
      {
        key: "event_type",
        label: "Action",
        options: [
          "CREATE",
          "UPDATE",
          "DELETE",
          "LOGIN",
          "LOGOUT",
          "OPERATION_MUTATION",
          "PERMISSION_DENIED",
        ].map((value) => ({ label: value.replaceAll("_", " "), value })),
      },
    ],
  },
};

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

const nextOrderStatus: Record<string, { status: string; label: string }> = {
  PENDING: { status: "CONFIRMED", label: "Confirm order" },
  PENDING_PAYMENT: { status: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { status: "PICKING", label: "Start picking" },
  PICKING: { status: "PACKED", label: "Mark packed" },
  PACKED: { status: "OUT_FOR_DELIVERY", label: "Send for delivery" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Mark delivered" },
  DELIVERED: { status: "RETURN_REQUESTED", label: "Request return" },
  RETURN_REQUESTED: { status: "RETURNED", label: "Mark returned" },
};

function OrderActions({
  id,
  record,
  onUpdated,
}: {
  id: string;
  record: AdminRecord;
  onUpdated: (record: AdminRecord) => void;
}) {
  const { hasCapability } = useStaffSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const transition = nextOrderStatus[asText(record.status, "")];
  async function change(status: string, reason?: string, cancel = false) {
    setBusy(true);
    setError("");
    try {
      const response = await resilientFetch(
        `/api/web-orders/${id}${cancel ? "/cancel" : "/status"}`,
        {
          method: cancel ? "POST" : "PUT",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify(cancel ? { reason } : { status, reason }),
        },
      );
      const body = (await response.json()) as AdminRecord;
      if (!response.ok)
        throw new Error(asText(body.error, "Order update failed"));
      onUpdated(body);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Order update failed",
      );
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    if (
      !window.confirm(
        "Cancel this order? This releases active stock reservations and records the cancellation in the order history.",
      )
    )
      return;
    const reason = window.prompt("Enter a cancellation reason.");
    if (!reason?.trim()) return;
    void change("CANCELLED", reason.trim(), true);
  }
  const cancellable = ![
    "DELIVERED",
    "RETURNED",
    "CANCELLED",
    "REFUNDED",
  ].includes(asText(record.status, ""));
  return (
    <div className="space-y-2">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {transition && hasCapability("orders.fulfil") && (
          <Button busy={busy} onClick={() => void change(transition.status)}>
            {transition.label}
          </Button>
        )}
        {cancellable && hasCapability("orders.cancel") && (
          <Button busy={busy} variant="danger" onClick={cancel}>
            Cancel order
          </Button>
        )}
      </div>
    </div>
  );
}

function ResourcePage({ config }: { config: ResourceConfig }) {
  const { hasCapability } = useStaffSession();
  const searchParams = useSearchParams();
  const [formOpen, setFormOpen] = useState(searchParams.get("create") === "1");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const canCreate = Boolean(
    config.createCapability &&
    config.fields &&
    hasCapability(config.createCapability),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      config
        .fields!.map((field) => [
          field.name,
          String(form.get(field.name) || ""),
        ])
        .filter(([, value]) => value !== ""),
    );
    try {
      const response = await resilientFetch(config.endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as AdminRecord;
      if (!response.ok)
        throw new Error(asText(body.error, "Unable to create record"));
      setFormOpen(false);
      setNotice(`${config.createLabel || "Record"} created successfully.`);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to create record",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <AdminPageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        actions={
          canCreate ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              {config.createLabel}
            </Button>
          ) : undefined
        }
      />
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <AdminDataTable
        endpoint={config.endpoint}
        columns={config.columns}
        filters={config.filters}
        refreshKey={refreshKey}
        detailHref={
          config.detailBase
            ? (record) => `${config.detailBase}/${record.id}`
            : undefined
        }
      />
      {formOpen && (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !submitting)
              setFormOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                  {config.eyebrow}
                </p>
                <h2
                  id="create-title"
                  className="mt-1 text-xl font-semibold text-slate-950"
                >
                  {config.createLabel}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close form"
              >
                ×
              </button>
            </div>
            <form onSubmit={submit} className="mt-7 space-y-5">
              {config.fields?.map((field) => (
                <label
                  key={field.name}
                  className="block text-sm font-medium text-slate-800"
                >
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-red-600" aria-hidden="true">
                      *
                    </span>
                  )}
                  {field.type === "textarea" ? (
                    <textarea
                      name={field.name}
                      required={field.required}
                      rows={4}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                    />
                  ) : field.type === "select" ? (
                    <select
                      name={field.name}
                      required={field.required}
                      defaultValue={field.options?.[0]?.value || ""}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={field.name}
                      type={field.type || "text"}
                      required={field.required}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                    />
                  )}
                </label>
              ))}
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" busy={submitting}>
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard() {
  const { selectedStoreId } = useAdminShell();
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period });
      if (selectedStoreId !== "all") params.set("store_id", selectedStoreId);
      const response = await resilientFetch(`/api/admin/dashboard?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json()) as AdminRecord;
      if (!response.ok)
        throw new Error(asText(body.error, "Unable to load dashboard"));
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, [period, selectedStoreId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const metrics = (data?.metrics || {}) as AdminRecord;
  const cards = [
    {
      label: "Revenue",
      value: money(metrics.revenue, asText(data?.currencyCode, "NPR")),
      detail: `${asText(metrics.orders, "0")} orders`,
      icon: CircleDollarSign,
    },
    {
      label: "Average order value",
      value: money(
        metrics.average_order_value,
        asText(data?.currencyCode, "NPR"),
      ),
      detail: `${asText(metrics.cancelled_orders, "0")} cancelled`,
      icon: ShoppingCart,
    },
    {
      label: "Low stock",
      value: asText(metrics.low_stock, "0"),
      detail: `${asText(metrics.out_of_stock, "0")} out of stock`,
      icon: Warehouse,
    },
    {
      label: "Open purchase orders",
      value: asText(metrics.open_purchase_orders, "0"),
      detail: `${asText(metrics.overdue_purchase_orders, "0")} overdue`,
      icon: PackagePlus,
    },
    {
      label: "New customers",
      value: asText(metrics.new_customers, "0"),
      detail: `${asText(metrics.returning_customers, "0")} returning`,
      icon: Users,
    },
    {
      label: "Inventory value",
      value: money(metrics.inventory_value, asText(data?.currencyCode, "NPR")),
      detail: `${asText(metrics.incoming_units, "0")} incoming units`,
      icon: Store,
    },
  ];
  const trend = Array.isArray(data?.revenueTrend)
    ? (data.revenueTrend as AdminRecord[])
    : [];
  const maxTrend = Math.max(1, ...trend.map((row) => Number(row.revenue) || 0));
  return (
    <section className="space-y-6">
      <AdminPageHeader
        eyebrow="Retail overview"
        title="Dashboard"
        description={`Live operational performance · ${asText(data?.scopeLabel, selectedStoreId === "all" ? "All authorized stores" : "Selected store")}`}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span className="sr-only">Reporting period</span>
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="h-9 border-0 bg-transparent text-sm font-semibold outline-none"
              >
                <option value="today">Today</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="month">This month</option>
              </select>
            </label>
            <Button
              variant="secondary"
              onClick={() => void load()}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : error ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ label, value, detail, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {value}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{detail}</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-950">
                    Revenue trend
                  </h2>
                  <p className="text-xs text-slate-500">
                    Captured order revenue for the selected period
                  </p>
                </div>
                <Link
                  href="/admin/commerce/orders"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"
                >
                  View orders <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              {trend.length ? (
                <div
                  className="mt-6 flex h-52 items-end gap-2"
                  aria-label="Revenue trend chart"
                >
                  {trend.map((row) => (
                    <div
                      key={asText(row.date)}
                      className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    >
                      <span className="sr-only">
                        {asText(row.date)}: {money(row.revenue)}
                      </span>
                      <div
                        className="w-full rounded-t bg-emerald-600/80 transition hover:bg-emerald-600"
                        style={{
                          height: `${Math.max(3, (Number(row.revenue) / maxTrend) * 100)}%`,
                        }}
                        title={`${asText(row.date)} · ${money(row.revenue)}`}
                      />
                      <span className="hidden text-[10px] text-slate-400 sm:block">
                        {String(row.date).slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No sales in this period"
                  description="Revenue will appear when orders are captured."
                />
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">Needs attention</h2>
              <p className="text-xs text-slate-500">
                Operational exceptions in the current scope
              </p>
              <div className="mt-5 space-y-3">
                {Number(metrics.out_of_stock) > 0 && (
                  <Link
                    href="/admin/inventory?stock=out"
                    className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3"
                  >
                    <TriangleAlert className="h-5 w-5 text-red-600" />
                    <span>
                      <span className="block text-sm font-semibold text-red-900">
                        {asText(metrics.out_of_stock)} products out of stock
                      </span>
                      <span className="text-xs text-red-700">
                        Review replenishment needs
                      </span>
                    </span>
                  </Link>
                )}
                {Number(metrics.overdue_purchase_orders) > 0 && (
                  <Link
                    href="/admin/procurement/purchase-orders"
                    className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3"
                  >
                    <TriangleAlert className="h-5 w-5 text-amber-700" />
                    <span>
                      <span className="block text-sm font-semibold text-amber-900">
                        {asText(metrics.overdue_purchase_orders)} overdue
                        purchase orders
                      </span>
                      <span className="text-xs text-amber-700">
                        Follow up with suppliers
                      </span>
                    </span>
                  </Link>
                )}
                {Number(metrics.out_of_stock || 0) === 0 &&
                  Number(metrics.overdue_purchase_orders || 0) === 0 && (
                    <EmptyState
                      title="No urgent exceptions"
                      description="This scope has no out-of-stock or overdue purchasing alerts."
                    />
                  )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DetailPage({ config, id }: { config: ResourceConfig; id: string }) {
  const [record, setRecord] = useState<AdminRecord | null>(null);
  const [related, setRelated] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const endpoint =
          config.detailEndpoint?.(id) || `${config.endpoint}/${id}`;
        const [response, relatedResponse] = await Promise.all([
          resilientFetch(endpoint, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }),
          config.relatedEndpoint
            ? resilientFetch(config.relatedEndpoint(id), {
                credentials: "include",
                cache: "no-store",
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ]);
        const body = (await response.json()) as AdminRecord;
        if (!response.ok)
          throw new Error(asText(body.error, "Unable to load record"));
        setRecord(body);
        if (relatedResponse?.ok) {
          const relatedBody = (await relatedResponse.json()) as
            AdminRecord[] | { items?: AdminRecord[] };
          setRelated(
            Array.isArray(relatedBody) ? relatedBody : relatedBody.items || [],
          );
        }
      } catch (loadError) {
        if (!(
          loadError instanceof DOMException && loadError.name === "AbortError"
        ))
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load record",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [config, id]);
  if (loading) return <LoadingSkeleton rows={8} />;
  if (error || !record)
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <ErrorState message={error || "Record not found"} />
      </div>
    );
  const heading = asText(
    record.name_en ||
      record.order_number ||
      record.preferred_name ||
      record.supplier_name ||
      record.po_number ||
      record.receiving_number ||
      record.full_name ||
      record.role_name ||
      record.id,
  );
  const hidden = new Set(["metadata", "images", "capabilities", "permissions"]);
  const entries = Object.entries(record).filter(
    ([key, value]) =>
      !hidden.has(key) && value !== null && typeof value !== "object",
  );
  return (
    <section className="space-y-6">
      <Link
        href={config.detailBase || "/admin/dashboard"}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {config.title.toLowerCase()}
      </Link>
      <AdminPageHeader
        eyebrow={config.eyebrow}
        title={heading}
        description={`Record ${asText(record.id)}`}
        actions={
          Boolean(record.status || record.payment_status) ? (
            <div className="flex gap-2">
              {Boolean(record.payment_status) && (
                <StatusBadge value={record.payment_status} />
              )}
              <StatusBadge value={record.status} />
            </div>
          ) : undefined
        }
      />
      {config.title === "Orders" && (
        <OrderActions id={id} record={record} onUpdated={setRecord} />
      )}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Details</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <div key={key} className="border-t border-slate-100 pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="mt-1 break-words text-sm text-slate-900">
                  {/(_at|date)$/.test(key)
                    ? dateTime(value)
                    : /amount|price|subtotal|tax|discount|shipping|spend|cost|value/.test(
                          key,
                        )
                      ? money(value, asText(record.currency, "NPR"))
                      : asText(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Activity</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This record is protected by your current role and store scope.
            Sensitive changes are recorded by the audit system.
          </p>
          {Boolean(record.created_at) && (
            <p className="mt-4 text-xs text-slate-500">
              Created {dateTime(record.created_at)}
            </p>
          )}
          {Boolean(record.updated_at) && (
            <p className="mt-1 text-xs text-slate-500">
              Updated {dateTime(record.updated_at)}
            </p>
          )}
        </div>
      </div>
      {config.relatedEndpoint && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">
            {config.relatedTitle}
          </h2>
          {related.length === 0 ? (
            <EmptyState title={`No ${config.relatedTitle?.toLowerCase()}`} />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    {Object.keys(related[0])
                      .filter((key) => !["metadata", "id"].includes(key))
                      .slice(0, 7)
                      .map((key) => (
                        <th key={key} className="px-3 py-2">
                          {key.replaceAll("_", " ")}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {related.map((row, index) => (
                    <tr key={asText(row.id, String(index))}>
                      {Object.keys(related[0])
                        .filter((key) => !["metadata", "id"].includes(key))
                        .slice(0, 7)
                        .map((key) => (
                          <td key={key} className="px-3 py-3 text-slate-700">
                            {asText(row[key])}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SettingsPage() {
  const { session } = useStaffSession();
  const sections = [
    {
      title: "Organization",
      description: "Business identity and market defaults",
      fields: [
        ["Name", session?.organization?.name],
        ["Country", session?.organization?.countryCode],
        ["Currency", session?.organization?.currencyCode],
      ],
    },
    {
      title: "Localization",
      description: "Locale and timezone used for staff views",
      fields: [
        ["Locale", session?.organization?.locale],
        ["Timezone", session?.organization?.timezone],
      ],
    },
    {
      title: "Security",
      description: "Current authorization context; secrets are never displayed",
      fields: [
        ["Role", session?.role?.name || session?.role?.key],
        ["Scope", session?.scope?.type],
        ["Staff number", session?.user?.staffNumber],
      ],
    },
  ];
  return (
    <section className="space-y-6">
      <AdminPageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Organization, localization, commerce, inventory, notification, and security configuration supported by the current platform."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-slate-950">{section.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{section.description}</p>
            <dl className="mt-5 space-y-3">
              {section.fields.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3"
                >
                  <dt className="text-sm text-slate-500">{label}</dt>
                  <dd className="text-right text-sm font-medium text-slate-900">
                    {asText(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Environment variables, database credentials, signing secrets, and
        private provider keys are intentionally excluded from the administration
        interface.
      </div>
    </section>
  );
}

export function AdminWorkspace() {
  const pathname = usePathname();
  const { hasCapability } = useStaffSession();
  const key =
    pathname.replace(/^\/admin\/?/, "").replace(/\/$/, "") || "dashboard";
  if (key === "dashboard") return <Dashboard />;
  if (key === "settings")
    return hasCapability("settings.manage") ? <SettingsPage /> : <Forbidden />;
  const direct = resources[key];
  if (direct)
    return hasCapability(direct.capability) ? (
      <ResourcePage config={direct} />
    ) : (
      <Forbidden />
    );
  const match = Object.entries(resources).find(
    ([resourceKey, config]) =>
      config.detailBase && key.startsWith(`${resourceKey}/`),
  );
  if (match) {
    const [resourceKey, config] = match;
    const id = key.slice(resourceKey.length + 1).split("/")[0];
    return hasCapability(config.capability) ? (
      <DetailPage config={config} id={id} />
    ) : (
      <Forbidden />
    );
  }
  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Page not found"
        description="This administration destination does not exist."
      />
      <div className="rounded-xl border border-slate-200 bg-white">
        <EmptyState
          title="Unknown administration page"
          action={
            <Link
              href="/admin/dashboard"
              className="text-sm font-semibold text-emerald-700"
            >
              Return to dashboard
            </Link>
          }
        />
      </div>
    </section>
  );
}

function Forbidden() {
  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Forbidden"
        description="Your staff role does not include access to this administration area."
      />
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-800">
          Ask an authorized administrator if you believe you need access. Your
          current permissions have not been changed.
        </p>
        <Link
          href="/admin/dashboard"
          className="mt-4 inline-flex text-sm font-semibold text-red-900 underline"
        >
          Return to dashboard
        </Link>
      </div>
    </section>
  );
}
