"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  LocateFixed,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useShop } from "@/components/CommerceClient";
import { formatPrice } from "@/lib/catalog";
import {
  addressMapUrl,
  addressSummary,
  createCustomerAddress,
  CustomerAddress,
  CustomerSession,
  loadCustomerAddresses,
  loadCustomerSession,
} from "@/lib/customerAddresses";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  createWhatsAppReference,
  isValidNepaliMobile,
  loadRememberedDetails,
  saveRememberedDetails,
  WHATSAPP_ORDER_DISPLAY_NUMBER,
  WhatsAppOrderDetails,
} from "@/lib/whatsappOrder";

type Coordinates = { latitude: number; longitude: number } | null;
type PreparedOrder = {
  details: WhatsAppOrderDetails;
  message: string;
  url: string;
};

export default function WhatsAppOrderPage() {
  const { items, selectedStore } = useShop();
  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.qty,
    0,
  );
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>(null);
  const [notes, setNotes] = useState("");
  const [addressType, setAddressType] = useState<"HOME" | "WORK" | "OTHER">(
    "HOME",
  );
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedOrder | null>(null);

  useEffect(() => {
    const rememberedTimer = window.setTimeout(() => {
      const remembered = loadRememberedDetails();
      if (remembered) {
        setName(remembered.customerName);
        setPhone(remembered.phone);
        setAddress(remembered.address);
        setMapUrl(remembered.mapUrl);
      }
    }, 0);

    let active = true;
    void (async () => {
      try {
        const session = await loadCustomerSession();
        if (!active || !session) return;
        setCustomer(session);
        if (session.preferred_name)
          setName((current) => current || session.preferred_name || "");
        const saved = await loadCustomerAddresses(session.id);
        if (!active) return;
        setAddresses(saved);
        const defaultAddress =
          saved.find((entry) => entry.is_default) || saved[0];
        if (defaultAddress) selectAddress(defaultAddress);
      } catch {
        // Guest ordering remains available if account details cannot be loaded.
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(rememberedTimer);
    };
  }, []);

  function selectAddress(saved: CustomerAddress) {
    setSelectedAddressId(saved.id);
    setAddress(addressSummary(saved));
    setPhone(saved.phone || "");
    setMapUrl(addressMapUrl(saved));
    setNotes(saved.delivery_instructions || "");
    setAddressType(saved.address_type || "OTHER");
    const latitude = Number(saved.latitude);
    const longitude = Number(saved.longitude);
    setCoordinates(
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null,
    );
  }

  function useDifferentAddress() {
    setSelectedAddressId("");
    setAddress("");
    setMapUrl("");
    setCoordinates(null);
    setNotes("");
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Location sharing is not supported by this browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextCoordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        setCoordinates(nextCoordinates);
        setMapUrl(
          `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`,
        );
        setLocating(false);
      },
      () => {
        setError(
          "We could not access your location. Paste a map link or continue with the written address.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOpened(false);
    if (!items.length) {
      setError(
        "Your cart is empty. Add products before preparing an order request.",
      );
      return;
    }
    if (!isValidNepaliMobile(phone)) {
      setError("Enter a valid Nepali mobile number, such as 98XXXXXXXX.");
      return;
    }
    if (mapUrl && !/^https:\/\//i.test(mapUrl)) {
      setError("The map link must begin with https://.");
      return;
    }

    setPreparing(true);
    try {
      if (customer && saveToAccount && !selectedAddressId) {
        const saved = await createCustomerAddress({
          address_type: addressType,
          tole_locality: address.trim(),
          phone: phone.trim(),
          delivery_instructions: notes.trim() || undefined,
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          is_default: addresses.length === 0,
        });
        setAddresses((current) => [...current, saved]);
        setSelectedAddressId(saved.id);
      }
      if (!customer && rememberOnDevice) {
        saveRememberedDetails({
          customerName: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          mapUrl: mapUrl.trim(),
        });
      }

      const details: WhatsAppOrderDetails = {
        reference: createWhatsAppReference(),
        customerName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        mapUrl: mapUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
        subtotal,
      };
      const message = buildWhatsAppMessage(details);
      const url = buildWhatsAppUrl(message);
      if (url.length > 7_500)
        throw new Error(
          "This cart is too large for one WhatsApp message. Remove a few items or call the store.",
        );
      setPrepared({ details, message, url });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the WhatsApp request",
      );
    } finally {
      setPreparing(false);
    }
  }

  if (!items.length) {
    return (
      <div className="shell page max-w-3xl">
        <div className="empty-page">
          <MessageCircle size={50} />
          <h1>Your cart is empty</h1>
          <p>Add products before preparing a WhatsApp order request.</p>
          <Link className="primary-btn" href="/shop">
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  if (prepared) {
    return (
      <div className="shell page max-w-4xl">
        <button
          type="button"
          onClick={() => {
            setPrepared(null);
            setOpened(false);
          }}
          className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800"
        >
          <ChevronLeft size={17} /> Edit order details
        </button>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            <p className="eyebrow">FINAL REVIEW</p>
            <h1 className="text-4xl font-bold">Ready to open WhatsApp</h1>
            <p className="mt-3 text-slate-600">
              We prepared request <strong>#{prepared.details.reference}</strong>
              . WhatsApp cannot send it automatically—you must press{" "}
              <strong>Send</strong>.
            </p>
            {opened ? (
              <div
                role="status"
                className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"
              >
                <div className="flex gap-3">
                  <CheckCircle2 className="shrink-0" />
                  <div>
                    <h2 className="font-bold">WhatsApp was opened</h2>
                    <p className="mt-1 text-sm">
                      Return to WhatsApp and press Send. Your order is still
                      unconfirmed until our team replies.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className="mt-6 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-6 font-mono text-sm leading-6 shadow-sm"
              aria-label="Prepared WhatsApp message"
            >
              {prepared.message}
            </div>
          </section>
          <aside className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
            <div className="flex gap-3">
              <ShieldCheck className="shrink-0 text-emerald-700" />
              <div>
                <h2 className="font-bold">This is an order request</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Stock, delivery charge, final price, payment, and delivery
                  time are confirmed by the admin.
                </p>
              </div>
            </div>
            <a
              href={prepared.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpened(true)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#168b52] px-5 py-3 font-bold text-white hover:bg-[#117344]"
            >
              <MessageCircle size={20} /> Open WhatsApp{" "}
              <ExternalLink size={16} />
            </a>
            <a
              href={`tel:${WHATSAPP_ORDER_DISPLAY_NUMBER.replaceAll(" ", "")}`}
              className="mt-3 block text-center text-sm font-bold text-emerald-800"
            >
              WhatsApp unavailable? Call the store
            </a>
            <p className="mt-5 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
              Do not clear your cart yet. Opening WhatsApp does not prove that
              the request was sent or accepted.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="shell page max-w-6xl">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/cart">Cart</Link>
        <span>›</span>
        <span aria-current="page">WhatsApp order request</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">QUICK ORDER</p>
          <h1 className="text-4xl font-bold">Order through WhatsApp</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Review your details, then open a prepared message to{" "}
            {WHATSAPP_ORDER_DISPLAY_NUMBER}.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">
          Request only · Admin confirmation required
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_390px]">
        <form onSubmit={prepare} className="grid gap-7">
          {customer && addresses.length ? (
            <fieldset className="rounded-2xl border border-slate-200 bg-white p-6">
              <legend className="px-2 text-lg font-bold">
                Choose a saved location
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((saved) => (
                  <button
                    type="button"
                    key={saved.id}
                    onClick={() => selectAddress(saved)}
                    className={`rounded-xl border p-4 text-left ${selectedAddressId === saved.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 hover:border-emerald-400"}`}
                    aria-pressed={selectedAddressId === saved.id}
                  >
                    <span className="text-xs font-black text-emerald-700">
                      {saved.address_type || "OTHER"}
                      {saved.is_default ? " · DEFAULT" : ""}
                    </span>
                    <strong className="mt-1 block">
                      {addressSummary(saved) || "Saved address"}
                    </strong>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={useDifferentAddress}
                className="mt-4 text-sm font-bold text-emerald-800"
              >
                + Use and save a different address
              </button>
            </fieldset>
          ) : null}

          <fieldset className="rounded-2xl border border-slate-200 bg-white p-6">
            <legend className="px-2 text-lg font-bold">Customer details</legend>
            {customer ? (
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={15} /> Signed in · {customer.phone_masked}
              </p>
            ) : (
              <p className="mb-5 text-sm text-slate-600">
                Ordering as a guest.{" "}
                <Link
                  className="font-bold text-emerald-800 underline"
                  href="/account"
                >
                  Sign in
                </Link>{" "}
                to use account-saved addresses.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Full name
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  className="rounded-lg border border-slate-300 p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Delivery phone
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={20}
                  placeholder="98XXXXXXXX"
                  className="rounded-lg border border-slate-300 p-3"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200 bg-white p-6">
            <legend className="px-2 text-lg font-bold">
              Delivery location
            </legend>
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm font-semibold">
                Complete address
                <textarea
                  required
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setSelectedAddressId("");
                  }}
                  maxLength={300}
                  rows={3}
                  placeholder="Tole, street, municipality, district"
                  className="rounded-lg border border-slate-300 p-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Google Maps link{" "}
                <span className="font-normal text-slate-500">
                  (recommended)
                </span>
                <input
                  type="url"
                  inputMode="url"
                  value={mapUrl}
                  onChange={(event) => {
                    setMapUrl(event.target.value);
                    setSelectedAddressId("");
                  }}
                  maxLength={500}
                  placeholder="https://maps.google.com/…"
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
                    ? "Current map location added"
                    : "Use my current map location"}
              </button>
              <label className="grid gap-1 text-sm font-semibold">
                Delivery notes{" "}
                <span className="font-normal text-slate-500">(optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={400}
                  rows={3}
                  placeholder="Landmark, gate, floor, or call instructions"
                  className="rounded-lg border border-slate-300 p-3"
                />
              </label>
            </div>
            {customer && !selectedAddressId ? (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <label className="flex items-center gap-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={saveToAccount}
                    onChange={(event) => setSaveToAccount(event.target.checked)}
                    className="h-4 w-4 accent-emerald-700"
                  />{" "}
                  Save this location to my account
                </label>
                {saveToAccount ? (
                  <label className="mt-3 grid gap-1 text-sm font-semibold">
                    Address label
                    <select
                      value={addressType}
                      onChange={(event) =>
                        setAddressType(
                          event.target.value as "HOME" | "WORK" | "OTHER",
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white p-2"
                    >
                      <option value="HOME">Home</option>
                      <option value="WORK">Work</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {!customer ? (
              <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={rememberOnDevice}
                  onChange={(event) =>
                    setRememberOnDevice(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-emerald-700"
                />
                <span>
                  <strong className="block">
                    Remember these details on this device
                  </strong>
                  <span className="text-slate-600">
                    Stores your name, phone, address, and map link in this
                    browser for your next visit.
                  </span>
                </span>
              </label>
            ) : null}
          </fieldset>
          <button
            disabled={preparing}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#168b52] px-6 py-4 text-lg font-bold text-white hover:bg-[#117344] disabled:opacity-60"
          >
            <MessageCircle />
            {preparing ? "Preparing request…" : "Review WhatsApp message"}
          </button>
        </form>

        <aside className="order-summary lg:sticky lg:top-28">
          <h2>Order request summary</h2>
          <div className="mt-4 grid gap-3">
            {items.map((item) => (
              <div
                className="flex justify-between gap-4 text-sm"
                key={item.product.id}
              >
                <span>
                  {item.qty} × {item.product.name}
                </span>
                <strong>{formatPrice(item.product.price * item.qty)}</strong>
              </div>
            ))}
          </div>
          <div className="total mt-5">
            <span>Current subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <div className="mt-5 grid gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
            <p>
              <strong>Delivery:</strong> To be confirmed
            </p>
            <p>
              <strong>Final total:</strong> To be confirmed
            </p>
            <p>
              <strong>Payment:</strong> Confirmed by admin
            </p>
          </div>
          {selectedStore ? (
            <p className="mt-5 flex gap-2 text-sm text-slate-600">
              <MapPin className="shrink-0" size={17} /> Availability based on{" "}
              {selectedStore.name}
            </p>
          ) : null}
          <p className="mt-5 text-xs leading-5 text-slate-500">
            The website prepares the message. You must press Send in WhatsApp,
            and the admin must confirm your request.
          </p>
        </aside>
      </div>
    </div>
  );
}
