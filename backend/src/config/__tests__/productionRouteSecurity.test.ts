import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRODUCTION_ROUTE_SECURITY } from "../productionRouteSecurity.js";

describe("production route security inventory", () => {
  it("classifies every route plugin registered by the production entrypoint", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app.ts"), "utf8");
    const applicationPlugins = new Set(
      [
        ...source.matchAll(
          /import\s+\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\s+from\s+"\.\/(?:routes|plugins)\//g,
        ),
      ].map((match) => match[1]),
    );
    const registered = new Set(
      [...source.matchAll(/fastify\.register\(([A-Za-z][A-Za-z0-9]*)/g)]
        .map((match) => match[1])
        .filter((name) => applicationPlugins.has(name)),
    );
    expect([...registered].sort()).toEqual(
      Object.keys(PRODUCTION_ROUTE_SECURITY).sort(),
    );
  });

  it("keeps privileged and protected plugin boundaries explicit", () => {
    expect(PRODUCTION_ROUTE_SECURITY.protectedOperations).toBe("STAFF_SESSION");
    expect(PRODUCTION_ROUTE_SECURITY.privilegedAdministration).toBe(
      "PRIVILEGED_STAFF_MFA",
    );
    expect(PRODUCTION_ROUTE_SECURITY.paymentWebhookRoutes).toBe(
      "SIGNED_WEBHOOK",
    );
  });
});
