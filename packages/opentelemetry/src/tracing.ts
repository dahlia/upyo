import type { Span, Tracer, TracerProvider } from "@opentelemetry/api";
import {
  context,
  SpanKind as OTelSpanKind,
  SpanStatusCode as OTelSpanStatusCode,
} from "@opentelemetry/api";
import type { Message } from "@upyo/core";
import type { TracingConfig } from "./config.ts";
import { EmailAttributeExtractor } from "./attributes.ts";

/**
 * Manages OpenTelemetry tracing for email operations.
 */
export class TracingCollector {
  private readonly tracer: Tracer;
  private readonly config: Required<TracingConfig>;
  private readonly attributeExtractor: EmailAttributeExtractor;

  constructor(
    tracerProvider: TracerProvider,
    config: Required<TracingConfig>,
    transportName: string,
    transportVersion?: string,
  ) {
    this.config = config;
    this.tracer = tracerProvider.getTracer("@upyo/opentelemetry", "0.1.0");
    this.attributeExtractor = new EmailAttributeExtractor(
      transportName,
      config.recordSensitiveData,
      transportVersion,
    );
  }

  /**
   * Creates a span for a single email send operation.
   */
  createSendSpan(
    message: Message,
    networkAttributes?: Record<string, string | number | boolean>,
  ): EmailSpan {
    if (!this.shouldSample()) {
      return new NoOpEmailSpan();
    }

    const spanName = `${this.config.spanPrefix} send`;
    const span = this.tracer.startSpan(spanName, {
      kind: OTelSpanKind.CLIENT,
    }, context.active());

    // Set message attributes
    const messageAttributes = this.attributeExtractor.extractMessageAttributes(
      message,
    );
    span.setAttributes(messageAttributes);

    // Set network attributes if provided
    if (networkAttributes) {
      span.setAttributes(networkAttributes);
    }

    return new LiveEmailSpan(span, this.attributeExtractor);
  }

  /**
   * Creates a span for a batch email send operation.
   */
  createBatchSpan(
    messages: readonly Message[],
    batchSize: number,
    networkAttributes?: Record<string, string | number | boolean>,
  ): EmailSpan {
    if (!this.shouldSample()) {
      return new NoOpEmailSpan();
    }

    const spanName = `${this.config.spanPrefix} send_batch`;
    const span = this.tracer.startSpan(spanName, {
      kind: OTelSpanKind.CLIENT,
    }, context.active());

    // Set batch attributes
    const batchAttributes = this.attributeExtractor.extractBatchAttributes(
      messages,
      batchSize,
    );
    span.setAttributes(batchAttributes);

    // Set network attributes if provided
    if (networkAttributes) {
      span.setAttributes(networkAttributes);
    }

    return new LiveEmailSpan(span, this.attributeExtractor);
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }
}

/**
 * Wrapper around OpenTelemetry Span with email-specific functionality.
 */
export interface EmailSpan {
  /**
   * Adds an event to the span.
   */
  addEvent(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void;

  /**
   * Sets custom attributes on the span.
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void;

  /**
   * Records an error on the span.
   */
  recordError(error: unknown, errorCategory: string): void;

  /**
   * Records a retry attempt.
   */
  recordRetry(attempt: number, reason?: string): void;

  /**
   * Records the successful completion of the operation.
   */
  recordSuccess(messageId?: string): void;

  /**
   * Records the failure of the operation.
   */
  recordFailure(errorMessages: readonly string[]): void;

  /**
   * Ends the span.
   */
  end(): void;
}

/**
 * Live implementation of EmailSpan that delegates to OpenTelemetry Span.
 */
class LiveEmailSpan implements EmailSpan {
  constructor(
    private readonly span: Span,
    private readonly attributeExtractor: EmailAttributeExtractor,
  ) {}

  addEvent(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    this.span.addEvent(name, attributes);
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    this.span.setAttributes(attributes);
  }

  recordError(error: unknown, errorCategory: string): void {
    // Set span status to error
    this.span.setStatus({
      code: OTelSpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    // Record error attributes
    const errorAttributes = this.attributeExtractor.extractErrorAttributes(
      error,
      errorCategory,
    );
    this.span.setAttributes(errorAttributes);

    // Add error event
    this.span.addEvent("exception", {
      "exception.type": error instanceof Error
        ? error.constructor.name
        : "unknown",
      "exception.message": error instanceof Error
        ? error.message
        : String(error),
    });
  }

  recordRetry(attempt: number, reason?: string): void {
    this.span.setAttributes({
      "upyo.retry.count": attempt,
    });

    this.span.addEvent("retry", {
      "retry.attempt": attempt,
      ...(reason && { "retry.reason": reason }),
    });
  }

  recordSuccess(messageId?: string): void {
    this.span.setStatus({ code: OTelSpanStatusCode.OK });

    if (messageId) {
      this.span.setAttributes({
        "upyo.message.id": messageId,
      });
    }

    this.span.addEvent("email.sent", {
      ...(messageId && { "message.id": messageId }),
    });
  }

  recordFailure(errorMessages: readonly string[]): void {
    this.span.setStatus({
      code: OTelSpanStatusCode.ERROR,
      message: errorMessages[0] || "Send failed",
    });

    this.span.setAttributes({
      "email.error.count": errorMessages.length,
    });

    this.span.addEvent("email.send_failed", {
      "error.count": errorMessages.length,
      "error.messages": JSON.stringify(errorMessages),
    });
  }

  end(): void {
    this.span.end();
  }
}

/**
 * No-op implementation for when sampling is disabled.
 */
class NoOpEmailSpan implements EmailSpan {
  addEvent(): void {}
  setAttributes(): void {}
  recordError(): void {}
  recordRetry(): void {}
  recordSuccess(): void {}
  recordFailure(): void {}
  end(): void {}
}
