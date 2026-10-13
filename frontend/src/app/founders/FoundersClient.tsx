"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resilientFetch } from "@/lib/resilientFetch";

type Status = { capacity: number; joined: number; remaining: number; active: boolean };
type Member = {
  founder_number: number;
  display_name: string;
  ward: string;
  acquisition_source: string;
  joined_at: string;
};

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || "";
}

function founderLabel(number: number) {
  return `#${String(number).padStart(4, "0")}`;
}

async function json(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return {}; }
}

export default function FoundersClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [name, setName] = useState("");
  const [ward, setWard] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const source = useMemo(() => {
    if (typeof window === "undefined") return "direct";
    const raw = new URLSearchParams(window.location.search).get("s")?.toLowerCase() || "direct";
    return /^[a-z0-9_-]{1,64}$/.test(raw) ? raw : "direct";
  }, []);

  const refresh = useCallback(async () => {
    try {
      const statusResponse = await resilientFetch("/api/public/founders/status");
      if (statusResponse.ok) setStatus(await statusResponse.json() as Status);

      const sessionResponse = await resilientFetch("/api/auth/session/validate", {
        credentials: "include",
        cache: "no-store",
      });
      if (!sessionResponse.ok) {
        setAuthenticated(false);
        return;
      }
      setAuthenticated(true);
      const sessionData = await sessionResponse.json() as { customer?: { preferred_name?: string } };
      if (sessionData.customer?.preferred_name) setName(sessionData.customer.preferred_name);

      const memberResponse = await resilientFetch("/api/founders/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (memberResponse.ok) {
        const data = await memberResponse.json() as { member: Member };
        setMember(data.member);
      }
    } catch {
      setError("We couldn't load Founding 1,000 right now. Please try again.");
    }
  }, []);

  useEffect(() => {\n    const timer = window.setTimeout(() => { void refresh(); }, 0);\n    return () => window.clearTimeout(timer);\n  }, [refresh]);

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await resilientFetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "LOGIN" }),
      });
      const data = await json(response);
      if (!response.ok) throw new Error(String(data.error || "Could not send OTP"));
      const devOtp = typeof data.otp === "string" ? data.otp : "";
      setDevelopmentOtp(devOtp);
      if (devOtp) setOtp(devOtp);
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send OTP");
    } finally { setBusy(false); }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await resilientFetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp_code: otp, purpose: "LOGIN" }),
      });
      const data = await json(response);
      if (!response.ok) throw new Error(String(data.error || "OTP verification failed"));
      setAuthenticated(true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed");
    } finally { setBusy(false); }
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await resilientFetch("/api/founders/join", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({ display_name: name, ward, source }),
      });
      const data = await json(response);
      if (!response.ok) throw new Error(String(data.error || "Could not join Founding 1,000"));
      setMember(data.member as Member);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join Founding 1,000");
    } finally { setBusy(false); }
  }

  const joined = status?.joined ?? 0;
  const capacity = status?.capacity ?? 1000;
  const percent = Math.min(100, (joined / capacity) * 100);

  return (
    <main className="min-h-screen bg-[#f6f8f5] text-gray-950">
      <section className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-[#123d2b] px-6 py-10 text-white shadow-xl sm:px-12 sm:py-14">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-green-200">Pasalho Opening Community</p>
          <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Be one of Pasalho's first 1,000 customers.</h1>
          <p className="mt-5 max-w-2xl text-lg text-green-50">Join free before opening. Founding Customers get early access and opening benefits, plus a permanent Founder number.</p>
          <div className="mt-8 rounded-2xl bg-white/10 p-5">
            <div className="flex items-end justify-between gap-4">
              <div><span className="text-3xl font-black">{joined}</span><span className="text-green-100"> / {capacity} joined</span></div>
              <span className="text-sm font-semibold">{status ? `${status.remaining} spots left` : "Loading..."}</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          {member ? (
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-green-700">You're officially in</p>
              <h2 className="mt-3 text-3xl font-black">Welcome, {member.display_name}</h2>
              <div className="mx-auto my-7 flex h-36 w-36 items-center justify-center rounded-full bg-[#123d2b] text-3xl font-black text-white shadow-lg">
                {founderLabel(member.founder_number)}
              </div>
              <p className="text-gray-600">This is your permanent Pasalho Founding Customer number. We'll announce the opening benefits before launch.</p>
            </div>
          ) : !authenticated ? (
            !otpSent ? (
              <form onSubmit={requestOtp} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black">Claim your Founder number</h2>
                  <p className="mt-2 text-gray-600">Verify your Nepal mobile number to reserve one of the 1,000 spots.</p>
                </div>
                <label className="block text-sm font-semibold">Mobile number
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" type="tel" required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-green-700" />
                </label>
                <button disabled={busy || status?.active === false || status?.remaining === 0} className="w-full rounded-xl bg-[#123d2b] px-5 py-3.5 font-bold text-white disabled:opacity-50">{busy ? "Sending..." : "Send OTP"}</button>
              </form>
            ) : (
              <form onSubmit={verifyOtp} className="space-y-5">
                <div><h2 className="text-2xl font-black">Verify your number</h2><p className="mt-2 text-gray-600">Enter the 6-digit code sent to {phone}.</p></div>
                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" required className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-green-700" />
                {developmentOtp && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Development OTP: <strong>{developmentOtp}</strong></p>}
                <button disabled={busy || otp.length !== 6} className="w-full rounded-xl bg-[#123d2b] px-5 py-3.5 font-bold text-white disabled:opacity-50">{busy ? "Verifying..." : "Verify & continue"}</button>
                <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} className="w-full text-sm font-semibold text-gray-600">Change number</button>
              </form>
            )
          ) : (
            <form onSubmit={join} className="space-y-5">
              <div><h2 className="text-2xl font-black">One last step</h2><p className="mt-2 text-gray-600">Tell us what to call you and your local area.</p></div>
              <label className="block text-sm font-semibold">Your name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-green-700" />
              </label>
              <label className="block text-sm font-semibold">Ward / area
                <input value={ward} onChange={(e) => setWard(e.target.value)} maxLength={80} placeholder="e.g. Ward 6, Birendranagar" required className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-green-700" />
              </label>
              <p className="text-xs leading-5 text-gray-500">By joining, you agree to receive essential Pasalho opening updates on your registered mobile number. You can opt out of marketing messages later.</p>
              <button disabled={busy || status?.active === false || status?.remaining === 0} className="w-full rounded-xl bg-[#123d2b] px-5 py-3.5 font-bold text-white disabled:opacity-50">{busy ? "Claiming..." : "Become a Founding Customer"}</button>
            </form>
          )}
          {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            ["Early access", "Get opening information before the public launch."],
            ["Opening benefits", "Founders will receive special launch benefits."],
            ["Founder identity", "Keep your unique Founder number as Pasalho grows."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-gray-600">{copy}</p></div>
          ))}
        </div>
      </section>
    </main>
  );
}
