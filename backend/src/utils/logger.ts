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
    ...meta,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
