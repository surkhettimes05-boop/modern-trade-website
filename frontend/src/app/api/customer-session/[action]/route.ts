import { NextRequest, NextResponse } from "next/server";
import {
  requirePasalhoApiUrl,
  upstreamTimeoutMs,
} from "@/lib/serverApiUrl";

type AuthData = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  customer?: unknown;
  challengeId?: string;
  expiresInSeconds?: number;
};

type AuthEnvelope = {
  success?: boolean;
  data?: AuthData;
  error?: unknown;
};

function unwrap(value: AuthEnvelope): AuthData {
  return value.success === true && value.data
    ? value.data
    : (value as unknown as AuthData);
}

async function authRequest(path: string, body: unknown, authorization?: string) {
  return fetch(new URL(`/api/v1/commerce/auth/${path}`, requirePasalhoApiUrl()), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(upstreamTimeoutMs()),
  });
}

function clearCookies(response: NextResponse) {
  response.cookies.set("pasalho_customer_access", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("pasalho_customer_refresh", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;

  if (!["request-otp", "verify-otp", "logout"].includes(action)) {
    return NextResponse.json({ error: "Unknown session action" }, { status: 404 });
  }

  if (action === "logout") {
    const accessToken = request.cookies.get("pasalho_customer_access")?.value;
    try {
      if (accessToken) {
        await authRequest("logout", {}, `Bearer ${accessToken}`);
      }
    } catch {
      // Clear browser session even when the backend cannot be reached.
    }
    const response = NextResponse.json({ success: true });
    clearCookies(response);
    return response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstream = await authRequest(action, body);
    const payload = (await upstream.json().catch(() => ({}))) as AuthEnvelope;

    if (!upstream.ok) {
      return NextResponse.json(payload, { status: upstream.status });
    }

    if (action === "request-otp") {
      return NextResponse.json(payload, { status: upstream.status });
    }

    const data = unwrap(payload);
    if (
      typeof data.accessToken !== "string" ||
      typeof data.refreshToken !== "string"
    ) {
      return NextResponse.json(
        { error: "Pasalho authentication response was incomplete" },
        { status: 502 },
      );
    }

    const expiresIn =
      typeof data.expiresIn === "number" ? data.expiresIn : 900;
    const secure = process.env.NODE_ENV === "production";
    const response = NextResponse.json({
      success: true,
      data: {
        customer: data.customer,
        expiresIn,
      },
    });

    response.cookies.set("pasalho_customer_access", data.accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn,
    });
    response.cookies.set("pasalho_customer_refresh", data.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Pasalho authentication is temporarily unavailable" },
      { status: 503 },
    );
  }
}
