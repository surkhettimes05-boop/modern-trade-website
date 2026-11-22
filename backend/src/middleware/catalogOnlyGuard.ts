import type { FastifyReply, FastifyRequest } from "fastify";
import { publicCatalogOnly } from "../config/releaseFeatures.js";

// During catalogue-only release, customer and commerce writes stay closed.
// Staff sign-in and /api/admin are routed through their existing session,
// CSRF, capability, and resource-scope checks, so keep those staff APIs usable.
function isStaffManagementMutationPath(url: string): boolean {
  const pathname = url.split("?", 1)[0];
  return /^\/api\/(?:admin|operations-auth)(?:\/|$)/.test(pathname);
}

export async function catalogOnlyGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!publicCatalogOnly()) return;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (isStaffManagementMutationPath(request.url)) return;
  return reply.status(503).header("cache-control", "no-store").send({
    code: "CATALOG_ONLY",
    error: "PASALHO is browse-only while registration and ordering are closed",
  });
}
