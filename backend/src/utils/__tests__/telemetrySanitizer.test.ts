import {
  normalizeTelemetryEndpoint,
  sanitizeMetricTags,
  scrubTelemetryValue,
} from "../telemetrySanitizer.js";

describe("telemetry sanitization", () => {
  it("enforces the eight-tag ceiling", () => {
    const tags = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`tag_${index}`, "value"]),
    );
    expect(() => sanitizeMetricTags(tags)).toThrow(/at most 8 tags/);
  });

  it("rejects high-cardinality and identity tags", () => {
    expect(() => sanitizeMetricTags({ traceId: "abc" })).toThrow(
      /High-cardinality/,
    );
    expect(() => sanitizeMetricTags({ customer_id: "abc" })).toThrow(
      /High-cardinality/,
    );
  });

  it("scrubs nested PII, credentials, and raw prompts", () => {
    expect(
      scrubTelemetryValue({
        email: "customer@example.com",
        nested: { phone: "9812345678", prompt: "private request" },
        safe: "contact customer@example.com using 9812345678",
      }),
    ).toEqual({
      email: "[REDACTED]",
      nested: { phone: "[REDACTED]", prompt: "[REDACTED]" },
      safe: "contact [REDACTED] using [REDACTED]",
    });
  });

  it("removes query strings and dynamic IDs from endpoint dimensions", () => {
    expect(
      normalizeTelemetryEndpoint(
        "/api/orders/10000000-0000-4000-8000-000000000001?phone=9812345678",
      ),
    ).toBe("/api/orders/:id");
  });
});
