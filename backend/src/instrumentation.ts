import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK, metrics } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { logger } from "./utils/logger.js";

let telemetry: NodeSDK | undefined;

export function startObservability(): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || telemetry) return;

  telemetry = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "storesync-backend",
      [ATTR_SERVICE_VERSION]: process.env.RELEASE_VERSION || "development",
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || "development",
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new metrics.PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 30_000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (request) =>
            request.url?.startsWith("/api/health") ?? false,
        },
      }),
    ],
  });
  telemetry.start();
  logger.info("OpenTelemetry instrumentation started");
}

export async function shutdownObservability(): Promise<void> {
  if (!telemetry) return;
  const current = telemetry;
  telemetry = undefined;
  await current.shutdown();
}
