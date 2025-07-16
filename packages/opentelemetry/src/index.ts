/**
 * OpenTelemetry observability transport for Upyo email library.
 *
 * This package provides a decorator transport that wraps existing Upyo transports
 * to add automatic OpenTelemetry metrics and tracing without requiring changes
 * to existing code.
 *
 * @example Basic usage
 * ```typescript
 * import { MailgunTransport } from "@upyo/mailgun";
 * import { OpenTelemetryTransport } from "@upyo/opentelemetry";
 * import { trace, metrics } from "@opentelemetry/api";
 *
 * const baseTransport = new MailgunTransport(config);
 * const transport = new OpenTelemetryTransport(baseTransport, {
 *   tracerProvider: trace.getTracerProvider(),
 *   meterProvider: metrics.getMeterProvider(),
 * });
 * ```
 *
 * @example Auto-configuration
 * ```typescript
 * import { createOpenTelemetryTransport } from "@upyo/opentelemetry";
 *
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   serviceName: "email-service",
 *   auto: {
 *     tracing: { endpoint: "http://jaeger:14268/api/traces" },
 *     metrics: { endpoint: "http://prometheus:9090/api/v1/write" }
 *   }
 * });
 * ```
 */

import type { Transport } from "@upyo/core";
import { metrics, trace } from "@opentelemetry/api";
import { OpenTelemetryTransport } from "./opentelemetry-transport.ts";
import type {
  AttributeExtractor,
  AutoConfig,
  ErrorClassifier,
  OpenTelemetryConfig,
} from "./config.ts";
import { defaultErrorClassifier } from "./config.ts";

export { OpenTelemetryTransport } from "./opentelemetry-transport.ts";
export {
  type AttributeExtractor,
  type AutoConfig,
  defaultErrorClassifier,
  type ErrorClassifier,
  type MetricsConfig,
  type ObservabilityConfig,
  type OpenTelemetryConfig,
  type TracingConfig,
} from "./config.ts";

/**
 * Configuration options for the createOpenTelemetryTransport factory function.
 *
 * This interface extends the base OpenTelemetryConfig with additional options
 * for service identification and auto-configuration. It provides a simplified
 * way to configure OpenTelemetry observability without manually setting up
 * providers and exporters.
 *
 * @example
 * ```typescript
 * const config: CreateOpenTelemetryTransportConfig = {
 *   serviceName: "email-service",
 *   serviceVersion: "1.2.0",
 *   tracing: {
 *     enabled: true,
 *     samplingRate: 0.1,
 *     recordSensitiveData: false,
 *   },
 *   metrics: {
 *     enabled: true,
 *     histogramBoundaries: [10, 50, 100, 500, 1000],
 *   },
 *   auto: {
 *     tracing: {
 *       endpoint: "http://jaeger:14268/api/traces",
 *     },
 *     metrics: {
 *       endpoint: "http://prometheus:9090/api/v1/write",
 *     },
 *   },
 * };
 * ```
 *
 * @since 0.2.0
 */
export interface CreateOpenTelemetryTransportConfig
  extends Omit<OpenTelemetryConfig, "auto"> {
  /**
   * Service name for OpenTelemetry resource attributes.
   * This identifies your service in distributed traces and metrics.
   * @default "email-service"
   */
  readonly serviceName?: string;

  /**
   * Service version for OpenTelemetry resource attributes.
   * Useful for tracking performance across different deployment versions.
   */
  readonly serviceVersion?: string;

  /**
   * Auto-configuration options for setting up OpenTelemetry exporters and processors.
   * When provided, the factory function will automatically configure the necessary
   * infrastructure for sending telemetry data to observability backends.
   */
  readonly auto?: AutoConfig;
}

/**
 * Creates an OpenTelemetry transport for email operations with comprehensive
 * observability features.
 *
 * This function wraps an existing email transport with OpenTelemetry tracing
 * and metrics collection, providing automatic instrumentation for email sending
 * operations. It supports both single message and batch operations with
 * configurable sampling, error classification, and attribute extraction.
 * The function simplifies setup by automatically configuring providers when
 * they're not explicitly provided, using global `TracerProvider` and
 * `MeterProvider` from OpenTelemetry API as fallbacks.
 *
 * @param baseTransport The underlying email transport to wrap with
 *                      OpenTelemetry instrumentation.
 * @param config Configuration options for OpenTelemetry setup including
 *               providers, sampling rates, and custom extractors.
 * @param config.serviceName Service name for OpenTelemetry resource attributes.
 *                           Defaults to "email-service".
 * @param config.serviceVersion Service version for OpenTelemetry resource
 *                              attributes.
 * @param config.tracerProvider Custom TracerProvider instance. Uses global
 *                              provider if not specified.
 * @param config.meterProvider Custom MeterProvider instance. Uses global
 *                             provider if not specified.
 * @param config.auto Auto-configuration options for setting up exporters and
 *                    processors.
 * @param config.tracing Tracing configuration including sampling rates and
 *                       span settings.
 * @param config.metrics Metrics configuration including histogram boundaries
 *                       and collection settings.
 * @param config.attributeExtractor Custom function for extracting attributes
 *                                  from operations.
 * @param config.errorClassifier Custom function for categorizing errors into
 *                               types.
 * @returns An OpenTelemetry-enabled transport that instruments all email
 *          operations with traces and metrics.
 *
 * @example With minimal configuration
 * ```typescript
 * import { createOpenTelemetryTransport } from "@upyo/opentelemetry";
 * import { createSmtpTransport } from "@upyo/smtp";
 *
 * const smtpTransport = createSmtpTransport({
 *   host: "smtp.example.com",
 *   port: 587,
 * });
 *
 * const transport = createOpenTelemetryTransport(smtpTransport, {
 *   serviceName: "email-service",
 *   serviceVersion: "1.0.0",
 * });
 * ```
 *
 * @example With explicit providers
 * ```typescript
 * import { createOpenTelemetryTransport } from "@upyo/opentelemetry";
 * import { trace, metrics } from "@opentelemetry/api";
 *
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   tracerProvider: trace.getTracerProvider(),
 *   meterProvider: metrics.getMeterProvider(),
 *   serviceName: "my-email-service",
 *   tracing: {
 *     enabled: true,
 *     samplingRate: 0.1,
 *     recordSensitiveData: false,
 *   },
 *   metrics: {
 *     enabled: true,
 *     histogramBoundaries: [10, 50, 100, 500, 1000, 5000],
 *   },
 * });
 * ```
 *
 * @example With auto-configuration
 * ```typescript
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   serviceName: "email-service",
 *   auto: {
 *     tracing: { endpoint: "http://jaeger:14268/api/traces" },
 *     metrics: { endpoint: "http://prometheus:9090/api/v1/write" }
 *   }
 * });
 * ```
 *
 * @since 0.2.0
 */
export function createOpenTelemetryTransport(
  baseTransport: Transport,
  config: CreateOpenTelemetryTransportConfig = {},
): OpenTelemetryTransport {
  const {
    serviceName = "email-service",
    serviceVersion,
    auto,
    ...otherConfig
  } = config;

  // Use provided providers or fall back to global providers
  const finalConfig: OpenTelemetryConfig = {
    tracerProvider: otherConfig.tracerProvider || trace.getTracerProvider(),
    meterProvider: otherConfig.meterProvider || metrics.getMeterProvider(),
    ...otherConfig,
    // Add auto-configuration if specified
    ...(auto && {
      auto: {
        serviceName,
        serviceVersion,
        ...auto,
      },
    }),
  };

  return new OpenTelemetryTransport(baseTransport, finalConfig);
}

/**
 * Creates a custom email attribute extractor function for OpenTelemetry
 * spans and metrics.
 *
 * This function creates a reusable attribute extractor that can be used to
 * generate consistent attributes for OpenTelemetry traces and metrics across
 * different email operations.  It supports both basic transport information
 * and custom attribute generation based on operation context.
 *
 * @param transportName The name of the email transport
 *                      (e.g., `"smtp"`, `"mailgun"`, `"sendgrid"`).
 * @param options Configuration options for customizing attribute extraction
 *                behavior.
 * @param options.recordSensitiveData Whether to include sensitive data like
 *                                    email addresses in attributes.
 *                                    Defaults to false for security.
 * @param options.transportVersion The version of the transport implementation
 *                                 for better observability.
 * @param options.customAttributes A function to generate custom attributes
 *                                 based on operation context.
 * @returns A function that extracts attributes from email operations,
 *          suitable for use with OpenTelemetry spans and metrics.
 *
 * @example Basic usage
 * ```typescript
 * import { createEmailAttributeExtractor } from "@upyo/opentelemetry";
 *
 * const extractor = createEmailAttributeExtractor("smtp", {
 *   transportVersion: "2.1.0",
 * });
 *
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   attributeExtractor: extractor,
 * });
 * ```
 *
 * @example With custom attributes
 * ```typescript
 * import { createEmailAttributeExtractor } from "@upyo/opentelemetry";
 *
 * const extractor = createEmailAttributeExtractor("smtp", {
 *   recordSensitiveData: false,
 *   transportVersion: "2.1.0",
 *   customAttributes: (operation, transportName, messageCount, totalSize) => ({
 *     "service.environment": process.env.NODE_ENV || "development",
 *     "email.batch.size": messageCount || 1,
 *     "email.total.bytes": totalSize || 0,
 *     "transport.type": transportName,
 *   }),
 * });
 *
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   attributeExtractor: extractor,
 * });
 * ```
 *
 * @since 0.2.0
 */
export function createEmailAttributeExtractor(
  _transportName: string,
  options: {
    readonly recordSensitiveData?: boolean;
    readonly transportVersion?: string;
    readonly customAttributes?: (
      operation: "send" | "send_batch",
      transportName: string,
      messageCount: number,
      totalSize?: number,
    ) => Record<string, string | number | boolean>;
  } = {},
): AttributeExtractor {
  return (operation, transport, messageCount, totalSize) => {
    // Use the EmailAttributeExtractor for base attributes
    const baseAttributes: Record<string, string | number | boolean> = {
      "operation.name": operation === "send"
        ? "email.send"
        : "email.send_batch",
      "operation.type": "email",
      "upyo.transport.name": transport,
    };

    // Add transport version if available
    if (options.transportVersion) {
      baseAttributes["upyo.transport.version"] = options.transportVersion;
    }

    // Add batch-specific attributes for batch operations
    if (operation === "send_batch") {
      baseAttributes["upyo.batch.size"] = messageCount;
      if (totalSize !== undefined) {
        baseAttributes["email.batch.total_size"] = totalSize;
      }
    }

    const customAttributes = options.customAttributes?.(
      operation,
      transport,
      messageCount,
      totalSize,
    ) || {};

    return {
      ...baseAttributes,
      ...customAttributes,
    };
  };
}

/**
 * Creates a custom error classifier function for categorizing email sending
 * errors.
 *
 * This function creates an error classifier that categorizes errors into
 * meaningful groups for better observability and alerting.  It supports custom
 * regex patterns for domain-specific error classification while falling back
 * to the default classifier for common error types.  The classifier is used to
 * tag metrics and traces with error categories, enabling better
 * monitoring and debugging of email delivery issues.
 *
 * @param options Configuration options for error classification behavior.
 * @param options.patterns A record of category names mapped to regex patterns
 *                         for custom error classification.
 * @param options.fallback The fallback category to use when no patterns match
 *                         and the default classifier returns "unknown".
 *                         Defaults to "unknown".
 * @returns A function that classifies errors into string categories for use
 *          in OpenTelemetry attributes and metrics.
 *
 * @example Basic usage with common patterns
 * ```typescript
 * import { createErrorClassifier } from "@upyo/opentelemetry";
 *
 * const classifier = createErrorClassifier({
 *   patterns: {
 *     spam: /blocked.*spam|spam.*detected/i,
 *     bounce: /bounce|undeliverable|invalid.*recipient/i,
 *   },
 *   fallback: "email_error",
 * });
 *
 * const transport = createOpenTelemetryTransport(baseTransport, {
 *   errorClassifier: classifier,
 * });
 * ```
 *
 * @example Advanced patterns for specific email providers
 * ```typescript
 * import { createErrorClassifier } from "@upyo/opentelemetry";
 *
 * const classifier = createErrorClassifier({
 *   patterns: {
 *     spam: /blocked.*spam|spam.*detected|reputation/i,
 *     bounce: /bounce|undeliverable|invalid.*recipient/i,
 *     quota: /quota.*exceeded|mailbox.*full/i,
 *     reputation: /reputation|blacklist|blocked.*ip/i,
 *     temporary: /temporary.*failure|try.*again.*later/i,
 *     authentication: /authentication.*failed|invalid.*credentials/i,
 *   },
 *   fallback: "email_error",
 * });
 *
 * // The classifier will categorize errors like:
 * // new Error("Message blocked as spam") -> "spam"
 * // new Error("Mailbox quota exceeded") -> "quota"
 * // new Error("Authentication failed") -> "auth" (from default classifier)
 * // new Error("Unknown error") -> "email_error" (fallback)
 * ```
 *
 * @since 0.2.0
 */
export function createErrorClassifier(options: {
  readonly patterns?: Record<string, RegExp>;
  readonly fallback?: string;
} = {}): ErrorClassifier {
  const { patterns = {}, fallback = "unknown" } = options;

  return (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Check custom patterns first
      for (const [category, pattern] of Object.entries(patterns)) {
        if (pattern.test(message)) {
          return category;
        }
      }
    }

    // Fall back to default classifier
    const defaultCategory = defaultErrorClassifier(error);
    return defaultCategory === "unknown" ? fallback : defaultCategory;
  };
}
