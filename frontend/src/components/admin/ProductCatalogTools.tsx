"use client";

import { ChangeEvent, FormEvent, useState } from "react";
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

type PreviewRow = {
  rowNumber: number;
  sku: string;
  name: string;
  category: string | null;
  sellingPrice: number | null;
  status: string;
  action: "CREATE" | "UPDATE" | "ERROR";
  errors: string[];
};

type ImportPreview = {
  summary: {
    total: number;
    create: number;
    update: number;
    error: number;
  };
  rows: PreviewRow[];
  priced?: number;
  error?: string;
};

const importFields = [
  { key: "sku", label: "SKU", required: true, aliases: ["sku", "product_sku", "item_code", "code"] },
  { key: "name", label: "Product name", required: true, aliases: ["name", "product_name", "name_en", "item_name"] },
  { key: "description", label: "Description", aliases: ["description", "description_en"] },
  { key: "category", label: "Category", aliases: ["category", "category_name", "department"] },
  { key: "pack_size", label: "Pack size", aliases: ["pack_size", "pack", "size"] },
  { key: "unit", label: "Unit", aliases: ["unit", "uom", "unit_en"] },
  { key: "selling_price", label: "Selling price (NPR)", aliases: ["selling_price", "price", "mrp", "retail_price"] },
  { key: "status", label: "Status", aliases: ["status", "publication_status"] },
  { key: "image_url", label: "Image URL", aliases: ["image_url", "image", "photo_url"] },
] as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  return rows;
}

function automaticMapping(headers: string[]) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const result: Record<string, string> = {};
  for (const field of importFields) {
    const match = field.aliases.find((alias) => normalized.has(alias));
    if (match) result[field.key] = normalized.get(match)!;
  }
  return result;
}

function downloadTemplate() {
  const template =
    "sku,name,description,category,pack_size,unit,selling_price,status,image_url\n" +
    'DAL001,Masoor Dal,"Red lentils",Pulses,1 kg,pack,180,DRAFT,https://example.com/masoor-dal.jpg\n';
  const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pasalho-product-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProductImportButton({
  onImported,
}: {
  onImported: (message: string) => void;
}) {
  const { selectedStoreId } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setPreview(null);
    setError("");
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setPreview(null);
    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error("CSV must be smaller than 4 MB");
      }
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error("CSV must contain a header row and at least one product");
      if (parsed.length - 1 > 2500) throw new Error("CSV import supports up to 2,500 products at a time");
      const nextHeaders = parsed[0].map((header) => header.replace(/^\uFEFF/, "").trim());
      if (new Set(nextHeaders.map(normalizeHeader)).size !== nextHeaders.length) {
        throw new Error("CSV contains duplicate column names");
      }
      setFileName(file.name);
      setHeaders(nextHeaders);
      setRawRows(parsed.slice(1));
      setMapping(automaticMapping(nextHeaders));
    } catch (fileError) {
      reset();
      setError(fileError instanceof Error ? fileError.message : "Unable to read CSV");
    } finally {
      event.target.value = "";
    }
  }

  function mappedRows(): Array<Record<string, string>> {
    const missing = importFields
      .filter((field) => field.required && !mapping[field.key])
      .map((field) => field.label);
    if (missing.length) throw new Error(`Map required columns: ${missing.join(", ")}`);

    return rawRows.map((values) => {
      const source = new Map(headers.map((header, index) => [header, values[index] || ""]));
      const output: Record<string, string> = {};
      for (const field of importFields) {
        const header = mapping[field.key];
        if (!header) continue;
        const value = (source.get(header) || "").trim();
        if (value) output[field.key] = value;
      }
      return output;
    });
  }

  async function requestPreview() {
    setBusy(true);
    setError("");
    try {
      const rows = mappedRows();
      const response = await resilientFetch("/api/admin/products/import/preview", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({
          rows,
          ...(selectedStoreId !== "all" ? { store_id: selectedStoreId } : {}),
        }),
      });
      const body = (await response.json()) as ImportPreview;
      if (!response.ok) throw new Error(body.error || "Unable to preview import");
      setPreview(body);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to preview import");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    setBusy(true);
    setError("");
    try {
      const rows = mappedRows();
      const response = await resilientFetch("/api/admin/products/import/commit", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({
          rows,
          ...(selectedStoreId !== "all" ? { store_id: selectedStoreId } : {}),
        }),
      });
      const body = (await response.json()) as ImportPreview;
      if (!response.ok) {
        setPreview(body.rows ? body : preview);
        throw new Error(body.error || "Product import failed");
      }
      onImported(
        `Import complete: ${body.summary.create} created, ${body.summary.update} updated, ${body.priced || 0} prices applied.`,
      );
      setOpen(false);
      reset();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Product import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-import-title"
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Catalog</p>
                <h2 id="product-import-title" className="mt-1 text-xl font-semibold text-slate-950">
                  Import products from CSV
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Preview every change before commit. SKU is the unique product key; stock is never changed by this import.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close import"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                Choose CSV
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile} />
              </label>
              <Button type="button" variant="secondary" onClick={downloadTemplate}>
                Download template
              </Button>
              <span className="text-sm text-slate-600">{fileName || "No file selected"}</span>
            </div>

            {headers.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-slate-950">Map CSV columns</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {importFields.map((field) => (
                    <label key={field.key} className="text-sm font-medium text-slate-700">
                      {field.label}{field.required ? " *" : ""}
                      <select
                        value={mapping[field.key] || ""}
                        onChange={(event) => {
                          setMapping((current) => ({ ...current, [field.key]: event.target.value }));
                          setPreview(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">Do not import</option>
                        {headers.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button busy={busy} onClick={() => void requestPreview()}>
                    Preview import
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {preview && (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ["Rows", preview.summary.total],
                    ["Create", preview.summary.create],
                    ["Update", preview.summary.update],
                    ["Errors", preview.summary.error],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 100).map((row) => (
                        <tr key={`${row.rowNumber}-${row.sku}`}>
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2 font-medium">{row.sku || "—"}</td>
                          <td className="px-3 py-2">{row.name || "—"}</td>
                          <td className="px-3 py-2">{row.sellingPrice == null ? "—" : `NPR ${row.sellingPrice.toFixed(2)}`}</td>
                          <td className="px-3 py-2">{row.action}</td>
                          <td className="max-w-md px-3 py-2 text-red-700">{row.errors.join("; ") || "Ready"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 100 && (
                  <p className="text-xs text-slate-500">
                    Showing the first 100 of {preview.rows.length} rows.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                busy={busy}
                disabled={!preview || preview.summary.error > 0}
                onClick={() => void commitImport()}
              >
                Confirm import
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ProductEditButton({
  id,
  record,
  onUpdated,
}: {
  id: string;
  record: AdminRecord;
  onUpdated: (record: AdminRecord) => void;
}) {
  const { hasCapability } = useStaffSession();
  const { selectedStoreId } = useAdminShell();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<AdminRecord[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!hasCapability("catalog.write")) return null;

  async function openEditor() {
    setOpen(true);
    setError("");
    if (categories.length) return;
    setLoadingCategories(true);
    try {
      const response = await resilientFetch("/api/admin/categories?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json()) as { items?: AdminRecord[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load categories");
      setCategories(body.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load categories");
    } finally {
      setLoadingCategories(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const priceText = String(form.get("price") || "").trim();
    const payload: Record<string, unknown> = {
      sku: String(form.get("sku") || "").trim(),
      name_en: String(form.get("name_en") || "").trim(),
      description_en: String(form.get("description_en") || "").trim() || null,
      category_id: String(form.get("category_id") || "").trim() || null,
      pack_size_en: String(form.get("pack_size_en") || "").trim() || null,
      unit_en: String(form.get("unit_en") || "").trim() || null,
      image_url: String(form.get("image_url") || "").trim() || null,
      status: String(form.get("status") || "DRAFT"),
      ...(priceText ? { price: Number(priceText) } : {}),
      ...(selectedStoreId !== "all" ? { store_id: selectedStoreId } : {}),
    };
    try {
      const response = await resilientFetch(`/api/admin/products/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as AdminRecord;
      if (!response.ok) throw new Error(asText(body.error, "Unable to update product"));
      onUpdated(body);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => void openEditor()}>
        Edit product
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-slate-950/50"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-product-title"
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Catalog</p>
                <h2 id="edit-product-title" className="mt-1 text-xl font-semibold text-slate-950">
                  Edit product
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Price applies to {selectedStoreId === "all" ? "the global catalog" : "the selected store"}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close editor"
              >
                ×
              </button>
            </div>

            <form onSubmit={save} className="mt-7 space-y-5">
              <label className="block text-sm font-medium text-slate-800">
                SKU *
                <input
                  name="sku"
                  required
                  defaultValue={asText(record.sku, "")}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-800">
                Product name *
                <input
                  name="name_en"
                  required
                  defaultValue={asText(record.name_en, "")}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-800">
                Description
                <textarea
                  name="description_en"
                  rows={4}
                  defaultValue={asText(record.description_en, "")}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-800">
                Category
                <select
                  name="category_id"
                  defaultValue={asText(record.category_id, "")}
                  disabled={loadingCategories}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={asText(category.id)} value={asText(category.id)}>
                      {asText(category.name_en)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Pack size
                  <input
                    name="pack_size_en"
                    defaultValue={asText(record.pack_size_en, "")}
                    placeholder="e.g. 1 kg"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Unit
                  <input
                    name="unit_en"
                    defaultValue={asText(record.unit_en, "")}
                    placeholder="e.g. pack"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-800">
                Image URL
                <input
                  name="image_url"
                  type="url"
                  defaultValue={asText(record.image_url, "")}
                  placeholder="https://..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Selling price (NPR)
                  <input
                    name="price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={record.price == null ? "" : String(record.price)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Status
                  <select
                    name="status"
                    defaultValue={asText(record.status, "DRAFT")}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    {["DRAFT", "REVIEW", "PUBLISHED", "SCHEDULED", "UNPUBLISHED"].map((status) => (
                      <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Inventory is intentionally not editable here. Stock must enter through receiving or an authorized inventory adjustment so the inventory trail stays auditable.
              </p>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" busy={busy}>
                  Save product
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
