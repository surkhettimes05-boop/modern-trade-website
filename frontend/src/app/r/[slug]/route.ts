import { addProxyClientIdentity } from "@/lib/proxyClientIdentity";
import { proxyRequestHeaders } from "@/lib/proxyHeaders";
import { requireServerApiUrl, upstreamTimeoutMs } from "@/lib/serverApiUrl";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Keep the referral visit and its cookie on the same website origin as OTP registration. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || slug.length > 48 || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid creator referral" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(`/api/public/creators/${encodeURIComponent(slug)}/visit`, requireServerApiUrl());
    target.search = request.nextUrl.search;
  } catch {
    return NextResponse.json({ error: "Backend service is not configured" }, { status: 503 });
  }

  const headers = proxyRequestHeaders(request.headers);
  try {
    addProxyClientIdentity(request.headers, headers);
  } catch {
    return NextResponse.json({ error: "Proxy identity is not configured" }, { status: 503 });
  }

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(upstreamTimeoutMs())]),
    });

    if (upstream.status === 404) {
      return NextResponse.json({ error: "Creator referral is unavailable" }, { status: 404 });
    }
    const location = upstream.headers.get("location");
    if (upstream.status !== 302 || !location) {
      return NextResponse.json({ error: "Invalid creator referral response" }, { status: 502 });
    }

    const destination = new URL(location, request.url);
    // Standalone Next.js can see its internal 0.0.0.0 origin while the backend
    // returns the explicitly configured public website origin. Permit only
    // these two known website origins; never forward an arbitrary redirect.
    const publicSiteOrigin = process.env.NEXT_PUBLIC_SITE_URL;
    let configuredOrigin: string | undefined;
    try {
      configuredOrigin = publicSiteOrigin ? new URL(publicSiteOrigin).origin : undefined;
    } catch {
      return NextResponse.json({ error: "Website origin is misconfigured" }, { status: 503 });
    }
    if (destination.origin !== request.nextUrl.origin && destination.origin !== configuredOrigin) {
      return NextResponse.json({ error: "Creator referral destination is misconfigured" }, { status: 502 });
    }
    // A relative Location keeps browser navigation on the incoming public
    // host even when Next.js receives the request through an internal host.
    if (!destination.pathname.startsWith("/") || destination.pathname.startsWith("//")) {
      return NextResponse.json({ error: "Invalid creator referral destination" }, { status: 502 });
    }
    const relativeDestination = `${destination.pathname}${destination.search}${destination.hash}`;

    const response = NextResponse.redirect(new URL(relativeDestination, request.url), 302);
    response.headers.set("location", relativeDestination);
    response.headers.set("cache-control", "no-store");
    for (const cookie of upstream.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Creator referral service is temporarily unavailable" }, { status: 503 });
  }
}
