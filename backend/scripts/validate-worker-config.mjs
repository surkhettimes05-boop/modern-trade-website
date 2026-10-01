import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../wrangler.jsonc", import.meta.url),
  "utf8",
);
const config = JSON.parse(source.replace(/,\s*([}\]])/g, "$1"));

const hyperdriveId = config.hyperdrive?.[0]?.id;
if (!hyperdriveId || /^0+$/.test(hyperdriveId)) {
  throw new Error(
    "Replace the placeholder Hyperdrive id in backend/wrangler.jsonc before deploying.",
  );
}

for (const name of ["CORS_ORIGIN", "APP_URL"]) {
  const value = config.vars?.[name];
  if (!value || value.includes("your-project")) {
    throw new Error(
      `Replace the placeholder ${name} in backend/wrangler.jsonc before deploying.`,
    );
  }
}
