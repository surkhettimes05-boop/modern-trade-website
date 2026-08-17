import { NextRequest, NextResponse } from "next/server";

function getApiUrl(): string {
  const value = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error("API_URL is not configured");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("API_URL must be a public backend URL in production");
  }
  return url.toString();
}

function unavailableResponse(path: string, method: string) {
  if (method === "GET" && /^public\/(products|categories|stores|offers)(\/|$)/.test(path)) {
    return NextResponse.json([]);
  }

  if (/^(auth|customer|ledger|consent)(\/|$)/.test(path)) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  return NextResponse.json({ error: "Backend service is temporarily unavailable" }, { status: 503 });
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await context.params;
  const path = pathParts.join("/");
  let target: URL;
  try {
    target = new URL(`/api/${path}`, getApiUrl());
    target.search = request.nextUrl.search;
  } catch {
    return NextResponse.json({ error: "Backend service is not configured" }, { status: 500 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("host");
  requestHeaders.delete("content-length");

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: requestHeaders,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Backend returned a non-JSON response; check the Vercel API_URL configuration" },
        { status: 502 },
      );
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("connection");

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

    for (const cookie of upstream.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch {
    return unavailableResponse(path, request.method);
  }
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
