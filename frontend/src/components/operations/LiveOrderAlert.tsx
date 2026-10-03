"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStaffSession } from "@/components/StaffSessionProvider";
import { resilientFetch } from "@/lib/resilientFetch";

type OrderSummary = {
  id: string;
  order_number: string;
  status: string;
  total_amount?: number;
  currency?: string;
  delivery_type?: string;
  item_count?: number;
};

type RealtimeEnvelope = {
  type: "ORDER_CREATED" | "ORDER_STATUS_CHANGED";
  store_id: string;
  order: OrderSummary;
};

function csrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrf_token="))
      ?.split("=")[1] || ""
  );
}

async function alertTone(): Promise<void> {
  try {
    const WindowWithWebkitAudio = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextCtor =
      window.AudioContext || WindowWithWebkitAudio.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    window.setTimeout(() => void context.close(), 350);
  } catch {
    // Browsers can block audio until staff interact with the page.
  }
}

export function LiveOrderAlert() {
  const router = useRouter();
  const { session, hasCapability } = useStaffSession();
  const storeId = session?.storeAssignment?.id;
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [streamOnline, setStreamOnline] = useState(false);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeOrder?.id || null;
  }, [activeOrder]);

  const loadPending = useCallback(async () => {
    if (!storeId || !hasCapability("orders.read")) return;
    try {
      const response = await resilientFetch(
        `/api/web-orders?store_id=${encodeURIComponent(storeId)}&limit=50`,
        { credentials: "include", cache: "no-store", timeoutMs: 8_000, retries: 0 },
      );
      if (!response.ok) return;
      const orders = (await response.json()) as OrderSummary[];
      const pending = orders.find((order) => order.status === "PENDING_PAYMENT");
      setActiveOrder((current) => {
        if (pending) return pending;
        return current?.status === "PENDING_PAYMENT" ? null : current;
      });
    } catch {
      // The realtime connection and next poll will retry.
    }
  }, [hasCapability, storeId]);

  useEffect(() => {
    if (!storeId || !hasCapability("orders.read")) return;
    void loadPending();

    const stream = new EventSource(
      `/api/store-orders/stream?store_id=${encodeURIComponent(storeId)}`,
      { withCredentials: true },
    );
    const onReady = () => setStreamOnline(true);
    const onOrder = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEnvelope;
        if (event.store_id !== storeId) return;
        if (event.type === "ORDER_CREATED" && event.order.status === "PENDING_PAYMENT") {
          setActiveOrder(event.order);
          return;
        }
        if (
          event.type === "ORDER_STATUS_CHANGED" &&
          activeIdRef.current === event.order.id &&
          event.order.status !== "PENDING_PAYMENT"
        ) {
          setActiveOrder(null);
        }
      } catch {
        // Ignore malformed events and let polling reconcile authoritative state.
      }
    };
    stream.addEventListener("ready", onReady);
    stream.addEventListener("order", onOrder as EventListener);
    stream.onerror = () => setStreamOnline(false);

    const fallback = window.setInterval(() => void loadPending(), 3_000);
    return () => {
      window.clearInterval(fallback);
      stream.removeEventListener("ready", onReady);
      stream.removeEventListener("order", onOrder as EventListener);
      stream.close();
    };
  }, [hasCapability, loadPending, storeId]);

  useEffect(() => {
    if (!activeOrder) return;
    void alertTone();
    const tone = window.setInterval(() => void alertTone(), 1_600);
    return () => window.clearInterval(tone);
  }, [activeOrder]);

  const acceptOrder = useCallback(async () => {
    if (!activeOrder || !hasCapability("orders.fulfil")) return;
    setAccepting(true);
    try {
      const response = await resilientFetch(
        `/api/web-orders/${encodeURIComponent(activeOrder.id)}/status`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify({ status: "CONFIRMED", reason: "Accepted from live store alert" }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not accept order");
      setActiveOrder(null);
      await loadPending();
      router.push("/operations/orders");
      router.refresh();
    } finally {
      setAccepting(false);
    }
  }, [activeOrder, hasCapability, loadPending, router]);

  if (!activeOrder) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="live-order-title"
        className="w-full max-w-xl rounded-3xl border-4 border-amber-400 bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 animate-pulse items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <BellRing className="h-8 w-8" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-amber-700">
              New online order
            </p>
            <h2 id="live-order-title" className="mt-1 text-3xl font-black text-slate-950">
              {activeOrder.order_number}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {streamOnline ? "Live connection active" : "Reconnecting — polling backup active"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div>
            <p className="text-slate-500">Amount</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {activeOrder.currency || "NPR"} {Number(activeOrder.total_amount || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Fulfilment</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {activeOrder.delivery_type || "DELIVERY"}
            </p>
          </div>
        </div>

        <p className="mt-5 font-semibold text-slate-700">
          This alert stays on screen and repeats the sound until the order is accepted by a staff member.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {hasCapability("orders.fulfil") ? (
            <button
              type="button"
              disabled={accepting}
              onClick={() => void acceptOrder()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 font-bold text-white hover:bg-emerald-800 disabled:bg-slate-400"
            >
              <PackageCheck className="h-5 w-5" aria-hidden="true" />
              {accepting ? "Accepting…" : "Accept order"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/operations/orders")}
            className="rounded-xl border border-slate-300 px-5 py-3.5 font-bold text-slate-800 hover:bg-slate-50"
          >
            Open orders
          </button>
        </div>
      </section>
    </div>
  );
}
