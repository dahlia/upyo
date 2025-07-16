import type { MeterProvider, TracerProvider } from "@opentelemetry/api";

/**
 * Configuration options for OpenTelemetry observability features.
 */
export interface ObservabilityConfig {
  /**
   * Whether tracing is enabled.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Custom sampling rate for this feature (0.0 to 1.0).
   * @default 1.0 (sample all)
   */
  readonly samplingRate?: number;
}

/**
 * Configuration options for metrics collection.
 */
export interface MetricsConfig extends ObservabilityConfig {
  /**
   * Custom prefix for metric names.
   * @default "upyo"
   */
  readonly prefix?: string;

  /**
   * Custom histogram buckets for duration metrics (in seconds).
   * @default [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0]
   */
  readonly durationBuckets?: readonly number[];
}

/**
 * Configuration options for tracing.
 */
export interface TracingConfig extends ObservabilityConfig {
  /**
   * Whether to record sensitive information in spans.
   * When false, email addresses and subjects are redacted.
   * @default false
   */
  readonly recordSensitiveData?: boolean;

  /**
   * Custom span name prefix.
   * @default "email"
   */
  readonly spanPrefix?: string;
}

/**
 * Custom attribute extractor function type.
 */
export type AttributeExtractor = (
  operation: "send" | "send_batch",
  transportName: string,
  messageCount: number,
  totalSize?: number,
) => Record<string, string | number | boolean>;

/**
 * Custom error classifier function type.
 */
export type ErrorClassifier = (
  error: unknown,
) => string;

/**
 * Configuration options for auto-setup scenarios.
 */
export interface AutoConfig {
  /**
   * Service name for OpenTelemetry resource attributes.
   * @default "email-service"
   */
  readonly serviceName?: string;

  /**
   * Service version for OpenTelemetry resource attributes.
   */
  readonly serviceVersion?: string;

  /**
   * Tracing endpoint configuration.
   */
  readonly tracing?: {
    readonly endpoint?: string;
    readonly headers?: Record<string, string>;
  };

  /**
   * Metrics endpoint configuration.
   */
  readonly metrics?: {
    readonly endpoint?: string;
    readonly headers?: Record<string, string>;
  };
}

/**
 * Configuration for the OpenTelemetry transport.
 */
export interface OpenTelemetryConfig {
  /**
   * OpenTelemetry tracer provider.
   * Required if tracing is enabled.
   */
  readonly tracerProvider?: TracerProvider;

  /**
   * OpenTelemetry meter provider.
   * Required if metrics are enabled.
   */
  readonly meterProvider?: MeterProvider;

  /**
   * Metrics collection configuration.
   * @default { enabled: true }
   */
  readonly metrics?: MetricsConfig;

  /**
   * Tracing configuration.
   * @default { enabled: true }
   */
  readonly tracing?: TracingConfig;

  /**
   * Custom attribute extractor function.
   * Called for each operation to add custom attributes.
   */
  readonly attributeExtractor?: AttributeExtractor;

  /**
   * Custom error classifier function.
   * Called to classify errors into categories for metrics.
   */
  readonly errorClassifier?: ErrorClassifier;

  /**
   * Auto-configuration options for simplified setup.
   * When provided, missing providers will be auto-configured.
   */
  readonly auto?: AutoConfig;
}

/**
 * Resolved configuration with all defaults applied.
 */
export interface ResolvedOpenTelemetryConfig {
  readonly tracerProvider?: TracerProvider;
  readonly meterProvider?: MeterProvider;
  readonly metrics: Required<MetricsConfig>;
  readonly tracing: Required<TracingConfig>;
  readonly attributeExtractor?: AttributeExtractor;
  readonly errorClassifier?: ErrorClassifier;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = {
  metrics: {
    enabled: true,
    samplingRate: 1.0,
    prefix: "upyo",
    durationBuckets: [
      0.001,
      0.005,
      0.01,
      0.05,
      0.1,
      0.5,
      1.0,
      5.0,
      10.0,
    ] as const,
  },
  tracing: {
    enabled: true,
    samplingRate: 1.0,
    recordSensitiveData: false,
    spanPrefix: "email",
  },
} as const;

/**
 * Creates a resolved OpenTelemetry configuration with defaults applied.
 *
 * @param config The input configuration options.
 * @returns A resolved configuration with all defaults applied.
 * @throws {Error} When tracing is enabled but no TracerProvider is provided.
 * @throws {Error} When metrics are enabled but no MeterProvider is provided.
 */
export function createOpenTelemetryConfig(
  config: OpenTelemetryConfig = {},
): ResolvedOpenTelemetryConfig {
  const resolvedConfig: ResolvedOpenTelemetryConfig = {
    tracerProvider: config.tracerProvider,
    meterProvider: config.meterProvider,
    metrics: {
      ...DEFAULT_CONFIG.metrics,
      ...config.metrics,
    },
    tracing: {
      ...DEFAULT_CONFIG.tracing,
      ...config.tracing,
    },
    attributeExtractor: config.attributeExtractor,
    errorClassifier: config.errorClassifier,
  };

  // Validate required providers
  if (resolvedConfig.tracing.enabled && !resolvedConfig.tracerProvider) {
    throw new Error(
      "TracerProvider is required when tracing is enabled. " +
        "Provide tracerProvider in config or use auto-configuration.",
    );
  }

  if (resolvedConfig.metrics.enabled && !resolvedConfig.meterProvider) {
    throw new Error(
      "MeterProvider is required when metrics are enabled. " +
        "Provide meterProvider in config or use auto-configuration.",
    );
  }

  return resolvedConfig;
}

/**
 * Default error classifier that categorizes errors into standard types.
 *
 * @param error The error to classify.
 * @returns A string category for the error.
 */
export function defaultErrorClassifier(
  error: unknown,
): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Authentication errors
    if (
      message.includes("auth") || message.includes("unauthorized") ||
      message.includes("invalid api key") || message.includes("403")
    ) {
      return "auth";
    }

    // Rate limiting
    if (
      message.includes("rate limit") || message.includes("429") ||
      message.includes("quota exceeded") || message.includes("throttle")
    ) {
      return "rate_limit";
    }

    // Server errors (check before network errors to catch "504 Gateway Timeout")
    if (
      message.includes("500") || message.includes("502") ||
      message.includes("504") || message.includes("internal server error")
    ) {
      return "server_error";
    }

    // Network errors
    if (
      name.includes("network") || message.includes("connect") ||
      message.includes("timeout") || message.includes("dns") ||
      name === "aborterror"
    ) {
      return "network";
    }

    // Validation errors
    if (
      message.includes("invalid") || message.includes("malformed") ||
      message.includes("validation") || message.includes("400")
    ) {
      return "validation";
    }

    // Service unavailable
    if (
      message.includes("503") || message.includes("service unavailable") ||
      message.includes("temporarily unavailable")
    ) {
      return "service_unavailable";
    }
  }

  // Fallback category
  return "unknown";
}
