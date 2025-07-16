import type {
  Counter,
  Histogram,
  Meter,
  MeterProvider,
  UpDownCounter,
} from "@opentelemetry/api";
import type { Message } from "@upyo/core";
import type { MetricsConfig } from "./config.ts";
import metadata from "../package.json" with { type: "json" };

/**
 * Manages OpenTelemetry metrics collection for email operations.
 */
export class MetricsCollector {
  private readonly meter: Meter;
  private readonly config: Required<MetricsConfig>;

  // Counters
  private readonly attemptCounter: Counter;
  private readonly messageCounter: Counter;

  // Histograms
  private readonly durationHistogram: Histogram;
  private readonly messageSizeHistogram: Histogram;
  private readonly attachmentCountHistogram: Histogram;

  // Gauges (using UpDownCounter)
  private readonly activeSendsGauge: UpDownCounter;

  constructor(meterProvider: MeterProvider, config: Required<MetricsConfig>) {
    this.config = config;
    this.meter = meterProvider.getMeter(metadata.name, metadata.version);

    // Initialize counters
    this.attemptCounter = this.meter.createCounter(
      `${config.prefix}_email_attempts_total`,
      {
        description: "Total number of email send attempts",
        unit: "1",
      },
    );

    this.messageCounter = this.meter.createCounter(
      `${config.prefix}_email_messages_total`,
      {
        description: "Total number of email messages processed",
        unit: "1",
      },
    );

    // Initialize histograms
    this.durationHistogram = this.meter.createHistogram(
      `${config.prefix}_email_duration_seconds`,
      {
        description: "Duration of email send operations",
        unit: "s",
      },
    );

    this.messageSizeHistogram = this.meter.createHistogram(
      `${config.prefix}_email_message_size_bytes`,
      {
        description: "Size of email messages in bytes",
        unit: "By",
      },
    );

    this.attachmentCountHistogram = this.meter.createHistogram(
      `${config.prefix}_email_attachments_count`,
      {
        description: "Number of attachments per email",
        unit: "1",
      },
    );

    // Initialize gauge
    this.activeSendsGauge = this.meter.createUpDownCounter(
      `${config.prefix}_email_active_sends`,
      {
        description: "Number of currently active email send operations",
        unit: "1",
      },
    );
  }

  /**
   * Records the start of an email send operation.
   */
  recordSendStart(
    transport: string,
    messageCount: number = 1,
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    const labels = {
      transport,
    };

    this.activeSendsGauge.add(1, labels);
    this.messageCounter.add(messageCount, {
      ...labels,
      priority: "normal", // Default, will be overridden by recordMessage if available
    });
  }

  /**
   * Records the completion of an email send operation.
   */
  recordSendComplete(
    transport: string,
    duration: number,
    success: boolean,
    errorType?: string,
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    const labels = {
      transport,
      status: success ? "success" : "failure",
      ...(errorType && { error_type: errorType }),
    };

    this.activeSendsGauge.add(-1, { transport });
    this.attemptCounter.add(1, labels);
    this.durationHistogram.record(duration, labels);
  }

  /**
   * Records metrics for individual messages.
   */
  recordMessage(
    message: Message,
    transport: string,
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    const labels = {
      transport,
      priority: message.priority,
      content_type: this.getContentType(message),
    };

    const messageSize = this.estimateMessageSize(message);
    this.messageSizeHistogram.record(messageSize, labels);
    this.attachmentCountHistogram.record(message.attachments.length, labels);
  }

  /**
   * Records metrics for batch operations.
   */
  recordBatch(
    messages: readonly Message[],
    transport: string,
    duration: number,
    successCount: number,
    failureCount: number,
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    const _totalMessages = messages.length;
    const labels = { transport };

    // Record batch-level metrics
    this.attemptCounter.add(1, {
      ...labels,
      status: failureCount === 0 ? "success" : "partial_failure",
      operation: "batch",
    });

    this.durationHistogram.record(duration, {
      ...labels,
      operation: "batch",
    });

    // Record individual message metrics
    for (const message of messages) {
      this.recordMessage(message, transport);
    }

    // Record success/failure breakdown
    if (successCount > 0) {
      this.messageCounter.add(successCount, {
        ...labels,
        status: "success",
      });
    }

    if (failureCount > 0) {
      this.messageCounter.add(failureCount, {
        ...labels,
        status: "failure",
      });
    }
  }

  /**
   * Records an error for metrics classification.
   */
  recordError(
    transport: string,
    errorType: string,
    operation: "send" | "send_batch" = "send",
  ): void {
    if (!this.shouldSample()) {
      return;
    }

    this.attemptCounter.add(1, {
      transport,
      status: "failure",
      error_type: errorType,
      operation,
    });
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  private getContentType(message: Message): string {
    if ("html" in message.content) {
      return message.content.text ? "multipart" : "html";
    }
    return "text";
  }

  private estimateMessageSize(message: Message): number {
    let size = 0;

    // Headers estimate (rough)
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

    // Attachment headers estimate (not content)
    size += message.attachments.length * 100;

    return size;
  }
}
