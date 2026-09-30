import { NextRequest, NextResponse } from "next/server";
import {
  requirePasalhoApiUrl,
  requireServerApiUrl,
  upstreamTimeoutMs,
} from "@/lib/serverApiUrl";
import {
  ProxyPayloadTooLargeError,
  readBoundedProxyBody,
} from "@/lib/proxyRequestBody";
import {
  proxyRequestHeaders,
  proxyResponseHeaders,
} from "@/lib/proxyHeaders";

type RotatedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

function unavailableResponse(path: string, method: string) {
  if (method === "GET" && /^public\/(products|categories|stores|offers)(\/|$)/.test(path)) {
    return NextResponse.json([]);
  }

  if (/^(commerce|auth|customer|ledger|consent)(\/|$)/.test(path)) {
    return NextResponse.json(
      { error: "Customer commerce is temporarily unavailable" },
      { status: path.startsWith("commerce") ? 503 : 401 },
    );
  }

  return NextResponse.json(
    { error: "Backend service is temporarily unavailable" },
    { status: 503 },
  );
}

function unwrapAuthPayload(value: unknown): RotatedTokens | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as { success?: boolean; data?: unknown };
  const source =
    envelope.success === true && envelope.data && typeof envelope.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : (value as Record<string, unknown>);

  if (
    typeof source.accessToken !== "string" ||
    typeof source.refreshToken !== "string" ||
    typeof source.expiresIn !== "number"
  ) {
    return null;
  }

  return {
    accessToken: source.accessToken,
    refreshToken: source.refreshToken,
    expiresIn: source.expiresIn,
  };
}

async function rotateCustomerTokens(
  request: NextRequest,
): Promise<RotatedTokens | null> {
  const refreshToken = request.cookies.get("pasalho_customer_refresh")?.value;
  if (!refreshToken) return null;

  try {
    const response = await fetch(
      new URL("/api/v1/commerce/auth/refresh", requirePasalhoApiUrl()),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(upstreamTimeoutMs()),
      },
    );

    if (!response.ok) return null;
    return unwrapAuthPayload(await response.json());
  } catch {
    return null;
  }
}

function setCustomerCookies(response: NextResponse, tokens: RotatedTokens) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("pasalho_customer_access", tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expiresIn,
  });
  response.cookies.set("pasalho_customer_refresh", tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: pathParts } = await context.params;
  const path = pathParts.map(encodeURIComponent).join("/");
  const isCommerce = path === "commerce" || path.startsWith("commerce/");

  let target: URL;
  try {
    target = isCommerce
      ? new URL(`/api/v1/${path}`, requirePasalhoApiUrl())
      : new URL(`/api/${path}`, requireServerApiUrl());
    target.search = request.nextUrl.search;
  } catch {
    return NextResponse.json(
      {
        error: isCommerce
          ? "Pasalho commerce backend is not configured"
          : "Backend service is not configured",
      },
      { status: 500 },
    );
  }

  const requestHeaders = proxyRequestHeaders(request.headers);
  if (isCommerce) {
    requestHeaders.delete("cookie");
    const accessToken = request.cookies.get("pasalho_customer_access")?.value;
    if (accessToken) {
      requestHeaders.set("authorization", `Bearer ${accessToken}`);
    } else {
      requestHeaders.delete("authorization");
    }
  }

  let requestBody: ArrayBuffer | undefined;
  try {
    requestBody = await readBoundedProxyBody(request);
  } catch (error) {
    if (error instanceof ProxyPayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { error: "Request body could not be read" },
      { status: 400 },
    );
  }

  try {
    const callUpstream = () =>
      fetch(target, {
        method: request.method,
        headers: requestHeaders,
        body: requestBody,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(upstreamTimeoutMs()),
        ]),
      });

    let upstream = await callUpstream();
    let rotated: RotatedTokens | null = null;

    if (
      isCommerce &&
      upstream.status === 401 &&
      !path.startsWith("commerce/auth/")
    ) {
      rotated = await rotateCustomerTokens(request);
      if (rotated) {
        requestHeaders.set("authorization", `Bearer ${rotated.accessToken}`);
        upstream = await callUpstream();
      }
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { error: "Backend returned a non-JSON response; check the API configuration" },
        { status: 502 },
      );
    }

    const responseHeaders = proxyResponseHeaders(upstream.headers);
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

    if (rotated) setCustomerCookies(response, rotated);

    if (!isCommerce) {
      for (const cookie of upstream.headers.getSetCookie()) {
        response.headers.append("set-cookie", cookie);
      }
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Backend service timed out" }, { status: 504 });
    }
    return unavailableResponse(path, request.method);
  }
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
