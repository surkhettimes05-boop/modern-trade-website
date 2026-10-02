const MAX_METRIC_TAGS = 8;
const REDACTED = "[REDACTED]";

const forbiddenMetricKeys = new Set([
  "trace_id",
  "traceid",
  "span_id",
  "spanid",
  "request_id",
  "requestid",
  "session_id",
  "sessionid",
  "user_id",
  "userid",
  "customer_id",
  "customerid",
  "email",
  "phone",
  "address",
  "token",
]);

const sensitiveKey =
  /(?:authorization|cookie|password|secret|token|otp|phone|email|address|prompt|completion|input|output)/i;

export function sanitizeMetricTags(
  tags: Record<string, string> | undefined,
): Record<string, string> {
  if (!tags) return {};
  const entries = Object.entries(tags);
  if (entries.length > MAX_METRIC_TAGS) {
    throw new Error(`Metrics may contain at most ${MAX_METRIC_TAGS} tags`);
  }

  return Object.fromEntries(
    entries.map(([key, value]) => {
      const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
      if (forbiddenMetricKeys.has(normalizedKey) || sensitiveKey.test(key)) {
        throw new Error(`High-cardinality or sensitive metric tag: ${key}`);
      }
      if (!/^[a-z][a-z0-9_.-]{0,62}$/i.test(key)) {
        throw new Error(`Invalid metric tag name: ${key}`);
      }
      if (typeof value !== "string" || value.length > 128) {
        throw new Error(
          `Metric tag ${key} must be a string of 128 characters or fewer`,
        );
      }
      return [key, scrubTelemetryString(value)];
    }),
  );
}

export function scrubTelemetryValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === undefined) return null;
  if (typeof value === "string") return scrubTelemetryString(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((entry) => scrubTelemetryValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          sensitiveKey.test(key)
            ? REDACTED
            : scrubTelemetryValue(entry, depth + 1),
        ]),
    );
  }
  return String(value);
}

export function scrubTelemetryString(value: string): string {
  return value
    .slice(0, 2_000)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/(?:\+?977[-\s]?)?9[678]\d{8}/g, REDACTED)
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      REDACTED,
    );
}

export function normalizeTelemetryEndpoint(endpoint: string): string {
  const path = scrubTelemetryString(endpoint).split(/[?#]/, 1)[0].slice(0, 256);
  return path
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)
        ? ":id"
        : segment,
    )
    .join("/");
}
