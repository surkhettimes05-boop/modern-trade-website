import { httpServerHandler } from "cloudflare:node";

import { buildApp } from "./app.js";

interface HyperdriveBinding {
  connectionString: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkerEnv {
  HYPERDRIVE: HyperdriveBinding;
  API_RATE_LIMITER: RateLimitBinding;
  AUTH_RATE_LIMITER: RateLimitBinding;
  [key: string]: unknown;
}

type BackendFetch = (
  request: Request,
  env: WorkerEnv,
  context: ExecutionContext,
) => Response | Promise<Response>;

let backendFetchPromise: Promise<BackendFetch> | undefined;

function configureRuntime(env: WorkerEnv): void {
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string") process.env[name] = value;
  }
  process.env.CLOUDFLARE_WORKER = "true";
  process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  process.env.DATABASE_SSL = "true";
}

async function getBackendFetch(env: WorkerEnv): Promise<BackendFetch> {
  if (!backendFetchPromise) {
    backendFetchPromise = (async () => {
      configureRuntime(env);
      const app = await buildApp("cloudflare-worker");
      await app.ready();
      const handler = httpServerHandler(
        app.server as Parameters<typeof httpServerHandler>[0],
      );
      if (!handler.fetch) throw new Error("Worker HTTP handler is unavailable");
      return handler.fetch.bind(handler) as BackendFetch;
    })();
  }
  return backendFetchPromise;
}

function rateLimitKey(request: Request, category: string): string {
  const client =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    "unknown";
  return `${category}:${client}`;
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    context: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    // Liveness must only prove that the Worker runtime is reachable. Keep it
    // independent from Fastify/plugin/database initialization so a startup
    // failure cannot turn the platform health probe into an opaque 1101.
    if (request.method === "GET" && url.pathname === "/api/health/live") {
      return Response.json({ status: "ok" });
    }
    const isHealthCheck = url.pathname.startsWith("/api/health/");
    if (request.method !== "OPTIONS" && !isHealthCheck) {
      const authenticationRequest =
        url.pathname === "/api/operations-auth/login" ||
        url.pathname.startsWith("/api/auth/otp/");
      const limiter = authenticationRequest
        ? env.AUTH_RATE_LIMITER
        : env.API_RATE_LIMITER;
      const result = await limiter.limit({
        key: rateLimitKey(
          request,
          authenticationRequest ? "authentication" : "api",
        ),
      });
      if (!result.success) {
        return Response.json(
          { error: "Too many requests", code: "RATE_LIMITED" },
          { status: 429, headers: { "retry-after": "60" } },
        );
      }
    }

    const backendFetch = await getBackendFetch(env);
    return backendFetch(request, env, context);
  },
} satisfies ExportedHandler<WorkerEnv>;
