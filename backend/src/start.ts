// Migrations run as a separate release job with MIGRATION_DATABASE_URL. The
// runtime process must never receive schema-owner credentials.
export {};

const { startObservability } = await import("./instrumentation.js");
startObservability();
await import("./index.js");
