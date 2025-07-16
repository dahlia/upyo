import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type {
  OpenTelemetryConfig,
  ResolvedOpenTelemetryConfig,
} from "./config.ts";
import { createOpenTelemetryConfig, defaultErrorClassifier } from "./config.ts";
import { MetricsCollector } from "./metrics.ts";
import { TracingCollector } from "./tracing.ts";

/**
 * OpenTelemetry decorator transport that adds observability to any existing transport.
 *
 * This transport wraps another transport implementation to provide automatic
 * OpenTelemetry metrics and tracing without requiring changes to existing code.
 * It follows the decorator pattern, accepting any transport and adding standardized
 * observability features including email delivery metrics, latency histograms,
 * error classification, and distributed tracing support.
 *
 * The transport also supports automatic resource cleanup by implementing
 * AsyncDisposable and properly disposing wrapped transports that support
 * either Disposable or AsyncDisposable interfaces.
 *
 * @example Basic usage with explicit providers
 * ```typescript
 * import { OpenTelemetryTransport } from "@upyo/opentelemetry";
 * import { createSmtpTransport } from "@upyo/smtp";
 * import { trace, metrics } from "@opentelemetry/api";
 *
 * const baseTransport = createSmtpTransport({
 *   host: "smtp.example.com",
 *   port: 587,
 * });
 *
 * const transport = new OpenTelemetryTransport(baseTransport, {
 *   tracerProvider: trace.getTracerProvider(),
 *   meterProvider: metrics.getMeterProvider(),
 *   tracing: {
 *     enabled: true,
 *     samplingRate: 1.0,
 *     recordSensitiveData: false,
 *   },
 *   metrics: {
 *     enabled: true,
 *   },
 * });
 *
 * // Use the transport normally - it will automatically create spans and metrics
 * await transport.send(message);
 * ```
 *
 * @example With custom error classification and attribute extraction
 * ```typescript
 * const transport = new OpenTelemetryTransport(baseTransport, {
 *   tracerProvider: trace.getTracerProvider(),
 *   meterProvider: metrics.getMeterProvider(),
 *   errorClassifier: (error) => {
 *     if (error.message.includes("spam")) return "spam";
 *     if (error.message.includes("bounce")) return "bounce";
 *     return "unknown";
 *   },
 *   attributeExtractor: (operation, transportName) => ({
 *     "service.environment": process.env.NODE_ENV,
 *     "transport.type": transportName,
 *   }),
 * });
 * ```
 *
 * @since 0.2.0
 */
export class OpenTelemetryTransport implements Transport, AsyncDisposable {
  /**
   * The resolved OpenTelemetry configuration.
   */
  readonly config: ResolvedOpenTelemetryConfig;

  private readonly wrappedTransport: Transport;
  private readonly metricsCollector?: MetricsCollector;
  private readonly tracingCollector?: TracingCollector;
  private readonly transportName: string;
  private readonly transportVersion?: string;

  /**
   * Creates a new OpenTelemetry transport that wraps an existing transport.
   *
   * @param transport The base transport to wrap with observability.
   * @param config OpenTelemetry configuration options.
   */
  constructor(transport: Transport, config: OpenTelemetryConfig = {}) {
    this.wrappedTransport = transport;
    this.config = createOpenTelemetryConfig(config);

    // Extract transport information
    this.transportName = this.extractTransportName(transport);
    this.transportVersion = this.extractTransportVersion(transport);

    // Initialize collectors based on configuration
    if (this.config.metrics.enabled && this.config.meterProvider) {
      this.metricsCollector = new MetricsCollector(
        this.config.meterProvider,
        this.config.metrics,
      );
    }

    if (this.config.tracing.enabled && this.config.tracerProvider) {
      this.tracingCollector = new TracingCollector(
        this.config.tracerProvider,
        this.config.tracing,
        this.transportName,
        this.transportVersion,
      );
    }
  }

  /**
   * Sends a single email message with OpenTelemetry observability.
   *
   * @param message The email message to send.
   * @param options Optional transport options including abort signal.
   * @returns A promise that resolves to a receipt indicating success or failure.
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    const startTime = performance.now();

    // Create span if tracing is enabled
    const span = this.tracingCollector?.createSendSpan(
      message,
      this.extractNetworkAttributes(),
    );

    // Record metrics start
    this.metricsCollector?.recordSendStart(this.transportName, 1);
    this.metricsCollector?.recordMessage(message, this.transportName);

    try {
      // Apply custom attributes if configured
      if (this.config.attributeExtractor && span) {
        const customAttributes = this.config.attributeExtractor(
          "send",
          this.transportName,
          1,
          this.estimateMessageSize(message),
        );
        span.setAttributes(customAttributes);
      }

      // Delegate to wrapped transport
      const receipt = await this.wrappedTransport.send(message, options);
      const duration = (performance.now() - startTime) / 1000; // Convert to seconds

      // Record success/failure
      if (receipt.successful) {
        span?.recordSuccess(receipt.messageId);
        this.metricsCollector?.recordSendComplete(
          this.transportName,
          duration,
          true,
        );
      } else {
        const errorCategory = this.classifyErrors(receipt.errorMessages);
        span?.recordFailure(receipt.errorMessages);
        this.metricsCollector?.recordSendComplete(
          this.transportName,
          duration,
          false,
          errorCategory,
        );
      }

      return receipt;
    } catch (error) {
      const duration = (performance.now() - startTime) / 1000;
      const errorCategory = this.classifyError(error);

      span?.recordError(error, errorCategory);
      this.metricsCollector?.recordSendComplete(
        this.transportName,
        duration,
        false,
        errorCategory,
      );

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Sends multiple email messages with OpenTelemetry observability.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including abort signal.
   * @returns An async iterable that yields receipts for each sent message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    const startTime = performance.now();
    const messageArray: Message[] = [];

    // Collect messages for batch metrics
    for await (const message of messages) {
      messageArray.push(message);
    }

    const batchSize = messageArray.length;

    // Create batch span if tracing is enabled
    const span = this.tracingCollector?.createBatchSpan(
      messageArray,
      batchSize,
      this.extractNetworkAttributes(),
    );

    // Record batch start
    this.metricsCollector?.recordSendStart(this.transportName, batchSize);

    let successCount = 0;
    let failureCount = 0;
    const receipts: Receipt[] = [];

    try {
      // Apply custom attributes if configured
      if (this.config.attributeExtractor && span) {
        const totalSize = messageArray.reduce(
          (sum, msg) => sum + this.estimateMessageSize(msg),
          0,
        );
        const customAttributes = this.config.attributeExtractor(
          "send_batch",
          this.transportName,
          batchSize,
          totalSize,
        );
        span.setAttributes(customAttributes);
      }

      // Delegate to wrapped transport
      for await (
        const receipt of this.wrappedTransport.sendMany(messageArray, options)
      ) {
        receipts.push(receipt);

        if (receipt.successful) {
          successCount++;
        } else {
          failureCount++;
        }

        yield receipt;
      }

      const duration = (performance.now() - startTime) / 1000;

      // Record batch completion
      this.metricsCollector?.recordBatch(
        messageArray,
        this.transportName,
        duration,
        successCount,
        failureCount,
      );

      // Update span based on results
      if (failureCount === 0) {
        span?.recordSuccess();
      } else if (successCount > 0) {
        span?.addEvent("partial_success", {
          "success_count": successCount,
          "failure_count": failureCount,
        });
      } else {
        const allErrorMessages = receipts
          .filter((r) => !r.successful)
          .flatMap((r) => r.errorMessages);
        span?.recordFailure(allErrorMessages);
      }
    } catch (error) {
      const _duration = (performance.now() - startTime) / 1000;
      const errorCategory = this.classifyError(error);

      span?.recordError(error, errorCategory);
      this.metricsCollector?.recordError(
        this.transportName,
        errorCategory,
        "send_batch",
      );

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Cleanup resources if the wrapped transport supports Disposable or AsyncDisposable.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.wrappedTransport) {
      return;
    }

    // Try AsyncDisposable first
    if (
      typeof (this.wrappedTransport as unknown as AsyncDisposable)[
        Symbol.asyncDispose
      ] === "function"
    ) {
      await (this.wrappedTransport as unknown as AsyncDisposable)
        [Symbol.asyncDispose]();
      return;
    }

    // Fall back to synchronous Disposable
    if (
      typeof (this.wrappedTransport as unknown as Disposable)[
        Symbol.dispose
      ] === "function"
    ) {
      (this.wrappedTransport as unknown as Disposable)[Symbol.dispose]();
    }
  }

  private extractTransportName(transport: Transport): string {
    // Try to extract from constructor name
    const constructorName = transport.constructor.name;
    if (constructorName && constructorName !== "Object") {
      return constructorName.toLowerCase().replace("transport", "");
    }

    // Try to extract from config if available
    if (
      "config" in transport && transport.config &&
      typeof transport.config === "object"
    ) {
      // Check for common config properties that might indicate transport type
      if ("domain" in transport.config) return "mailgun";
      if ("apiKey" in transport.config && "region" in transport.config) {
        return "sendgrid";
      }
      if ("accessKeyId" in transport.config) return "ses";
      if ("host" in transport.config) return "smtp";
    }

    return "unknown";
  }

  private extractTransportVersion(transport: Transport): string | undefined {
    // Try to extract version from config or transport properties
    if (
      "config" in transport && transport.config &&
      typeof transport.config === "object"
    ) {
      if ("version" in transport.config) {
        return String(transport.config.version);
      }
    }
    return undefined;
  }

  private extractNetworkAttributes():
    | Record<string, string | number | boolean>
    | undefined {
    const transport = this.wrappedTransport;

    if (
      "config" in transport && transport.config &&
      typeof transport.config === "object"
    ) {
      const config = transport.config as Record<string, unknown>;

      // SMTP transport
      if ("host" in config && "port" in config) {
        return {
          "network.protocol.name": "smtp",
          "server.address": String(config.host),
          "server.port": Number(config.port),
        };
      }

      // HTTP-based transports
      if ("baseUrl" in config || "endpoint" in config || "domain" in config) {
        const url = config.baseUrl || config.endpoint ||
          (config.domain &&
            `https://api.${config.region === "eu" ? "eu." : ""}mailgun.net`);

        if (url && typeof url === "string") {
          try {
            const parsedUrl = new URL(url);
            return {
              "network.protocol.name": parsedUrl.protocol.replace(":", ""),
              "server.address": parsedUrl.hostname,
              ...(parsedUrl.port &&
                { "server.port": parseInt(parsedUrl.port) }),
            };
          } catch {
            // Invalid URL, skip network attributes
          }
        }
      }
    }

    return undefined;
  }

  private classifyError(error: unknown): string {
    const classifier = this.config.errorClassifier || defaultErrorClassifier;
    return classifier(error);
  }

  private classifyErrors(errorMessages: readonly string[]): string {
    // Use first error message to determine category
    if (errorMessages.length === 0) return "unknown";

    // Create a synthetic error for classification
    const syntheticError = new Error(errorMessages[0]);
    return this.classifyError(syntheticError);
  }

  private estimateMessageSize(message: Message): number {
    let size = 0;

    // Headers estimate
    size += 500;

    // Subject
    size += message.subject.length;

    // Content
    if ("html" in message.content) {
      size += message.content.html.length;
      if (message.content.text) {
        size += message.content.text.length;
      }
    } else {
      size += message.content.text.length;
    }

    // Attachment headers estimate
    size += message.attachments.length * 100;

    return size;
  }
}
