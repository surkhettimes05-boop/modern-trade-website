"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LocateFixed, MapPin, Plus, Trash2 } from "lucide-react";
import {
  addressMapUrl,
  addressSummary,
  createCustomerAddress,
  CustomerAddress,
  CustomerSession,
  deleteCustomerAddress,
  loadCustomerAddresses,
  loadCustomerSession,
} from "@/lib/customerAddresses";

type Coordinates = { latitude: number; longitude: number } | null;

export default function SavedAddressesPage() {
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await loadCustomerSession();
        if (controller.signal.aborted || !session) return;
        setCustomer(session);
        const saved = await loadCustomerAddresses(session.id);
        if (!controller.signal.aborted) setAddresses(saved);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load saved addresses",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setError("Location sharing is not supported by this browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError(
          "We could not access your location. You can still save the written address.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    try {
      const created = await createCustomerAddress({
        address_type: String(form.get("address_type")) as
          "HOME" | "WORK" | "OTHER",
        tole_locality: String(form.get("address") || "").trim(),
        landmark: String(form.get("landmark") || "").trim() || undefined,
        phone: String(form.get("phone") || "").trim(),
        delivery_instructions:
          String(form.get("instructions") || "").trim() || undefined,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        is_default: form.get("is_default") === "on",
      });
      setAddresses((current) =>
        created.is_default
          ? [
              created,
              ...current.map((address) => ({ ...address, is_default: false })),
            ]
          : [...current, created],
      );
      setCoordinates(null);
      formElement.reset();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the address",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(address: CustomerAddress) {
    if (
      !window.confirm(
        `Remove your ${address.address_type?.toLowerCase() || "saved"} address?`,
      )
    )
      return;
    setError("");
    try {
      await deleteCustomerAddress(address.id);
      setAddresses((current) =>
        current.filter((item) => item.id !== address.id),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove the address",
      );
    }
  }

  if (loading)
    return (
      <div className="shell page">
        <p>Loading saved addresses…</p>
      </div>
    );

  if (!customer) {
    return (
      <div className="shell page max-w-2xl">
        <h1>Saved delivery addresses</h1>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-8">
          <h2 className="text-xl font-bold">Sign in to save addresses</h2>
          <p className="mt-2 text-slate-600">
            Your Home and Work locations are attached to your verified customer
            account.
          </p>
          <Link className="primary-btn mt-6" href="/account">
            Sign in with your phone
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="shell page max-w-5xl">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/account/dashboard">Account</Link>
        <span>›</span>
        <span aria-current="page">Saved addresses</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">QUICK RETURN</p>
          <h1 className="text-4xl font-bold">Saved delivery addresses</h1>
          <p className="mt-2 text-slate-600">
            Save Home, Work, or another location for faster ordering.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={17} /> Verified account
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <section aria-labelledby="saved-addresses-heading">
          <h2 id="saved-addresses-heading" className="text-xl font-bold">
            Your locations
          </h2>
          <div className="mt-4 grid gap-4">
            {addresses.length ? (
              addresses.map((address) => {
                const mapUrl = addressMapUrl(address);
                return (
                  <article
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    key={address.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-xs font-black tracking-wider text-emerald-700">
                          {address.address_type || "OTHER"}
                          {address.is_default ? " · DEFAULT" : ""}
                        </span>
                        <h3 className="mt-2 font-bold">
                          {addressSummary(address) || "Saved delivery location"}
                        </h3>
                        {address.phone ? (
                          <p className="mt-2 text-sm text-slate-600">
                            Phone: {address.phone}
                          </p>
                        ) : null}
                        {address.delivery_instructions ? (
                          <p className="mt-1 text-sm text-slate-600">
                            {address.delivery_instructions}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(address)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:text-red-700"
                        aria-label={`Remove ${address.address_type?.toLowerCase() || "saved"} address`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    {mapUrl ? (
                      <a
                        className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700"
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MapPin size={16} /> View map location
                      </a>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <MapPin className="mx-auto text-slate-400" />
                <h3 className="mt-3 font-bold">No saved locations yet</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Add your first delivery address using the form.
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          aria-labelledby="add-address-heading"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-800">
              <Plus />
            </span>
            <div>
              <h2 id="add-address-heading" className="text-xl font-bold">
                Add a location
              </h2>
              <p className="text-sm text-slate-600">
                Add map coordinates for easier delivery.
              </p>
            </div>
          </div>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">
              Label
              <select
                name="address_type"
                className="rounded-lg border border-slate-300 bg-white p-3"
              >
                <option value="HOME">Home</option>
                <option value="WORK">Work</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Complete address
              <textarea
                required
                name="address"
                maxLength={300}
                rows={3}
                placeholder="Tole, street, municipality, district"
                className="rounded-lg border border-slate-300 p-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Landmark{" "}
              <span className="font-normal text-slate-500">(optional)</span>
              <input
                name="landmark"
                maxLength={120}
                placeholder="Near the school gate"
                className="rounded-lg border border-slate-300 p-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Delivery phone
              <input
                required
                name="phone"
                type="tel"
                inputMode="tel"
                maxLength={20}
                placeholder="98XXXXXXXX"
                className="rounded-lg border border-slate-300 p-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Delivery instructions{" "}
              <span className="font-normal text-slate-500">(optional)</span>
              <textarea
                name="instructions"
                maxLength={300}
                rows={2}
                placeholder="Call before arrival"
                className="rounded-lg border border-slate-300 p-3"
              />
            </label>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-700 px-4 py-3 font-bold text-emerald-800 disabled:opacity-60"
            >
              <LocateFixed size={18} />
              {locating
                ? "Finding location…"
                : coordinates
                  ? "Map location added"
                  : "Use my current map location"}
            </button>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="is_default"
                className="h-4 w-4 accent-emerald-700"
              />{" "}
              Make this my default address
            </label>
            <button disabled={saving} className="primary-btn mt-2">
              {saving ? "Saving…" : "Save delivery address"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
