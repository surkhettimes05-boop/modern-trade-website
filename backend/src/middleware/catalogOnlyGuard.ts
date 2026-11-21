import type { FastifyReply, FastifyRequest } from "fastify";
import { publicCatalogOnly } from "../config/releaseFeatures.js";

// This gate covers the full API (including operations and POS). During the
// catalogue-only release every write is closed, regardless of authentication.
export async function catalogOnlyGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!publicCatalogOnly()) return;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  return reply.status(503).header("cache-control", "no-store").send({
    code: "CATALOG_ONLY",
    error: "PASALHO is browse-only while registration and ordering are closed",
  });
}
