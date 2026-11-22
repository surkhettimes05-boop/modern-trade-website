import type { FastifyReply, FastifyRequest } from "fastify";
import { publicCatalogOnly } from "../config/releaseFeatures.js";

// During catalogue-only release, customer and commerce writes stay closed.
// Staff sign-in, admin APIs, and the staff order-fulfilment APIs are routed
// through their existing session, CSRF, capability, and resource-scope checks.
function isStaffManagementMutationPath(url: string): boolean {
  const pathname = url.split("?", 1)[0];
  return (
    /^\/api\/(?:admin|operations-auth)(?:\/|$)/.test(pathname) ||
    /^\/api\/web-orders\/[^/]+\/(?:status|payment-status|cancel|cod-settlement|fulfillment\/assign)$/.test(
      pathname,
    )
  );
}

// Keep browse-only mode in force for all other writes, while allowing the
// authenticated web COD flow and its sign-in/quote prerequisites to operate.
function isWebCheckoutMutation(method: string, url: string): boolean {
  const pathname = url.split("?", 1)[0];
  const write = method.toUpperCase();
  return (
    (write === "POST" &&
      /^\/api\/auth\/(?:otp\/(?:request|verify)|google(?:\/link)?)$/.test(pathname)) ||
    (write === "POST" &&
      /^\/api\/customer-pricing\/web\/quotes$/.test(pathname)) ||
    (write === "POST" &&
      /^\/api\/(?:checkout\/(?:cart\/validate|serviceability|delivery-quote|cod)|shopping-cart|addresses)$/.test(
        pathname,
      )) ||
    (write === "PUT" &&
      /^\/api\/shopping-cart\/[0-9a-f-]+\/items$/i.test(pathname))
  );
}

export async function catalogOnlyGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!publicCatalogOnly()) return;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (isStaffManagementMutationPath(request.url)) return;
  if (isWebCheckoutMutation(request.method, request.url)) return;
  return reply.status(503).header("cache-control", "no-store").send({
    code: "CATALOG_ONLY",
    error: "PASALHO is browse-only while registration and ordering are closed",
  });
}
