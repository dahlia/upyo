import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { OpenTelemetryConfig } from "../config.ts";
import {
  MockMeterProvider,
  MockTracerProvider,
} from "./mock-otel-providers.ts";

/**
 * Mock transport implementation for testing OpenTelemetry integration.
 */
export class MockTransport implements Transport {
  public readonly sentMessages: Message[] = [];
  public nextReceipt: Receipt | null = null;
  public shouldThrow: Error | null = null;
  public delay: number = 0;
  private messageIdCounter = 1;

  /**
   * Configures the next receipt to be returned.
   */
  setNextReceipt(receipt: Receipt): void {
    this.nextReceipt = receipt;
  }

  /**
   * Configures the transport to throw an error on the next send.
   */
  setThrowError(error: Error): void {
    this.shouldThrow = error;
  }

  /**
   * Sets a delay for send operations (useful for testing timeouts).
   */
  setDelay(ms: number): void {
    this.delay = ms;
  }

  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    // Check for abort signal
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Simulate delay
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    // Check for abort signal after delay
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Throw configured error if set
    if (this.shouldThrow) {
      const error = this.shouldThrow;
      this.shouldThrow = null; // Reset for next call
      throw error;
    }

    this.sentMessages.push(message);

    // Return configured receipt or default success
    if (this.nextReceipt) {
      const receipt = this.nextReceipt;
      this.nextReceipt = null; // Reset for next call
      return receipt;
    }

    return {
      successful: true,
      messageId: `test-msg-${this.messageIdCounter++}`,
    };
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    for await (const message of messages) {
      yield await this.send(message, options);
    }
  }

  /**
   * Resets the transport state for the next test.
   */
  reset(): void {
    this.sentMessages.length = 0;
    this.nextReceipt = null;
    this.shouldThrow = null;
    this.delay = 0;
    this.messageIdCounter = 1;
  }
}

/**
 * Test setup configuration.
 */
export interface TestSetup {
  mockTransport: MockTransport;
  tracerProvider: MockTracerProvider;
  meterProvider: MockMeterProvider;
  config: OpenTelemetryConfig;
}

/**
 * Creates a complete test setup with mock providers and transport.
 */
export function createTestSetup(): TestSetup {
  const tracerProvider = new MockTracerProvider();
  const meterProvider = new MockMeterProvider();
  const mockTransport = new MockTransport();

  const config: OpenTelemetryConfig = {
    tracerProvider,
    meterProvider,
    metrics: { enabled: true },
    tracing: { enabled: true },
  };

  return {
    mockTransport,
    tracerProvider,
    meterProvider,
    config,
  };
}

/**
 * Creates a test message for testing purposes.
 */
export function createTestMessage(overrides: Partial<Message> = {}): Message {
  return {
    sender: { address: "sender@example.com" },
    recipients: [
      { address: "recipient1@example.com" },
      { address: "recipient2@example.com" },
      { address: "recipient3@example.com" },
    ],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    subject: "Test Subject",
    content: { text: "Test body content" },
    priority: "normal",
    attachments: [
      {
        inline: false,
        filename: "test1.txt",
        content: Promise.resolve(new Uint8Array([1, 2, 3])),
        contentType: "text/plain",
        contentId: "test1@example.com",
      },
      {
        inline: false,
        filename: "test2.txt",
        content: Promise.resolve(new Uint8Array([4, 5, 6])),
        contentType: "text/plain",
        contentId: "test2@example.com",
      },
    ],
    tags: [],
    headers: new Headers(),
    ...overrides,
  };
}

/**
 * Test span interface with proper typing.
 */
export interface TestSpan {
  name: string;
  attributes: Record<string, unknown>;
  status?: { code: number };
  events: Array<{ name: string; attributes?: Record<string, unknown> }>;
  [key: string]: unknown;
}

/**
 * Test metric interface with proper typing.
 */
export interface TestMetric {
  instrument: string;
  records: Array<{ value: number; attributes?: Record<string, unknown> }>;
}

/**
 * Utility functions for test assertions.
 */
export const assertions = {
  /**
   * Asserts that a span with the given name exists and returns it.
   */
  hasSpan(
    spans: TestSpan[],
    name: string,
    attributes?: Record<string, unknown>,
  ): TestSpan {
    const span = spans.find((s) => s.name === name);
    if (!span) {
      throw new Error(`Expected span with name '${name}' not found`);
    }

    if (attributes) {
      for (const [key, expectedValue] of Object.entries(attributes)) {
        const actualValue = span.attributes[key];
        if (actualValue !== expectedValue) {
          throw new Error(
            `Expected span attribute '${key}' to be '${expectedValue}', got '${actualValue}'`,
          );
        }
      }
    }

    return span;
  },

  /**
   * Asserts that a metric with the given name exists and optionally checks the count.
   */
  hasMetric(
    metrics: TestMetric[],
    instrumentType: string,
    expectedCount?: number,
  ): TestMetric {
    const matchingMetrics = metrics.filter((m) =>
      m.instrument === instrumentType
    );
    if (matchingMetrics.length === 0) {
      throw new Error(
        `Expected metric of type '${instrumentType}' not found. Available types: ${
          metrics.map((m) => m.instrument).join(", ")
        }`,
      );
    }

    if (expectedCount !== undefined) {
      const totalCount = matchingMetrics.reduce((sum, metric) => {
        return sum + metric.records.length;
      }, 0);

      if (totalCount !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount} metric records for '${instrumentType}', but found ${totalCount}`,
        );
      }
    }

    return matchingMetrics[0];
  },
};

/**
 * Extracts all spans from a mock tracer provider.
 */
export function extractSpans(tracerProvider: MockTracerProvider): TestSpan[] {
  return tracerProvider.getAllSpans() as unknown as TestSpan[];
}

/**
 * Extracts all metrics from a mock meter provider.
 */
export function extractMetrics(meterProvider: MockMeterProvider): TestMetric[] {
  return meterProvider.getAllRecords() as unknown as TestMetric[];
}
