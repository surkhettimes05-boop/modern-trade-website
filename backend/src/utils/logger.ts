export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    write("info", message, meta);
  },
  error: (message: string, error?: Error | Record<string, unknown>) => {
    write(
      "error",
      message,
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : error,
    );
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    write("warn", message, meta);
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") {
      write("debug", message, meta);
    }
  },
};

function write(level: string, message: string, meta?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(redactForLogs(meta) as Record<string, unknown> | undefined),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

const SENSITIVE_KEY =
  /authorization|cookie|password|secret|token|api.?key|signature|phone|email|address|customer/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const NEPAL_PHONE_VALUE = /(?:\+977[ -]?)?9[6-9]\d{8}/g;
const EMAIL_VALUE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function redactForLogs(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value
      .replace(BEARER_VALUE, "Bearer [REDACTED]")
      .replace(NEPAL_PHONE_VALUE, "[REDACTED_PHONE]")
      .replace(EMAIL_VALUE, "[REDACTED_EMAIL]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForLogs(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, child]) => [childKey, redactForLogs(child, childKey)],
      ),
    );
  }
  return value;
}
