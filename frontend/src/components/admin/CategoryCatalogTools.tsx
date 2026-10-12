"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { AdminRecord, apiErrorMessage, asText } from "@/components/admin/AdminDataTable";
import { Button } from "@/components/admin/AdminPrimitives";
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

export function CategoryEditButton({
  id,
  record,
  onUpdated,
}: {
  id: string;
  record: AdminRecord;
  onUpdated: (record: AdminRecord) => void;
}) {
  const { hasCapability } = useStaffSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState(asText(record.image_url, ""));
  const [error, setError] = useState("");

  if (!hasCapability("catalog.write")) return null;

  function openEditor() {
    setImageUrl(asText(record.image_url, ""));
    setError("");
    setOpen(true);
  }

  async function uploadCategoryImage(file: File) {
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WebP category image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Category image must be 3 MB or smaller.");
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Unable to read image file"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      const encoded = dataUrl.split(",", 2)[1];
      if (!encoded) throw new Error("Unable to read image file");

      const response = await resilientFetch("/api/admin/categories/image-upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type,
          data_base64: encoded,
        }),
      });
      const body = (await response.json()) as {
        image_url?: string;
        error?: string;
      };
      if (!response.ok || !body.image_url) {
        throw new Error(apiErrorMessage(body, "Unable to upload category image"));
      }
      setImageUrl(body.image_url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload category image",
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploadingImage) return;

    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name_en: String(form.get("name_en") || "").trim(),
      slug: String(form.get("slug") || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      description_en:
        String(form.get("description_en") || "").trim() || null,
      image_url: imageUrl.trim() || null,
      sort_order: Number(form.get("sort_order") || 0),
      status: String(form.get("status") || "DRAFT"),
    };

    try {
      const response = await resilientFetch(`/api/admin/categories/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as AdminRecord;
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Unable to update category"));
      }
      onUpdated({ ...record, ...body });
      setOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update category",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openEditor}>
        Edit category
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-slate-950/50"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busy && !uploadingImage) {
              setOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-category-title"
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                  Catalog
                </p>
                <h2
                  id="edit-category-title"
                  className="mt-1 text-xl font-semibold text-slate-950"
                >
                  Edit category
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  The category image appears in Shop by category on the website and app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy || uploadingImage}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close editor"
              >
                ×
              </button>
            </div>

            <form onSubmit={save} className="mt-7 space-y-5">
              <label className="block text-sm font-medium text-slate-800">
                Category name *
                <input
                  name="name_en"
                  required
                  defaultValue={asText(record.name_en, "")}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium text-slate-800">
                Slug *
                <input
                  name="slug"
                  required
                  defaultValue={asText(record.slug, "")}
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

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Category image
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Use a clean category-level image, not a photo of one specific SKU.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative h-32 w-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={asText(record.name_en, "Category image")}
                        fill
                        sizes="160px"
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center px-4 text-center text-xs text-slate-400">
                        No category image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                      {uploadingImage
                        ? "Uploading…"
                        : imageUrl
                          ? "Replace image"
                          : "Upload image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploadingImage || busy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadCategoryImage(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {imageUrl && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={uploadingImage || busy}
                        onClick={() => setImageUrl("")}
                      >
                        Remove image
                      </Button>
                    )}
                    <input
                      name="image_url"
                      type="url"
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="Or paste an HTTPS image URL"
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-500">
                      JPG, PNG, or WebP · max 3 MB.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-800">
                  Sort order
                  <input
                    name="sort_order"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={asText(record.sort_order, "0")}
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
                    {["DRAFT", "REVIEW", "PUBLISHED", "SCHEDULED", "UNPUBLISHED"].map(
                      (status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ),
                    )}
                  </select>
                </label>
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
                  disabled={busy || uploadingImage}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  busy={busy}
                  disabled={uploadingImage}
                >
                  Save category
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
