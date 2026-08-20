import { redactForLogs } from "../logger.js";

describe("structured log redaction", () => {
  it("redacts secrets and Nepal customer identifiers recursively", () => {
    expect(
      redactForLogs({
        authorization: "Bearer secret-token",
        nested: {
          phone: "+977 9812345678",
          note: "Contact demo@example.com or 9812345678",
        },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: {
        phone: "[REDACTED]",
        note: "Contact [REDACTED_EMAIL] or [REDACTED_PHONE]",
      },
    });
  });
});
