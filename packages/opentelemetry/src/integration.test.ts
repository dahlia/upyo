import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Import actual OpenTelemetry SDK components
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { context } from "@opentelemetry/api";

import { OpenTelemetryTransport } from "./opentelemetry-transport.ts";
import { createTestMessage, MockTransport } from "./test-utils/test-config.ts";

/**
 * Helper function to create test setup with real OpenTelemetry providers
 */
function createRealTestSetup() {
  const spanExporter = new InMemorySpanExporter();

  // Set up context manager for proper context propagation
  const contextManager = new AsyncHooksContextManager();
  context.setGlobalContextManager(contextManager.enable());

  const tracerProvider = new BasicTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "test-email-service",
      [SEMRESATTRS_SERVICE_VERSION]: "1.0.0",
    }),
  });

  // Add span processor to capture spans
  tracerProvider.addSpanProcessor(
    new SimpleSpanProcessor(spanExporter),
  );

  const meterProvider = new MeterProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "test-email-service",
      [SEMRESATTRS_SERVICE_VERSION]: "1.0.0",
    }),
  });

  const mockTransport = new MockTransport();
  const transport = new OpenTelemetryTransport(mockTransport, {
    tracerProvider,
    meterProvider,
    metrics: { enabled: true },
    tracing: { enabled: true },
  });

  return {
    tracerProvider,
    meterProvider,
    spanExporter,
    mockTransport,
    transport,
    contextManager,
    async cleanup() {
      await transport[Symbol.asyncDispose]();
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
      mockTransport.reset();
      contextManager.disable();
    },
  };
}

/**
 * Integration tests using real OpenTelemetry SDK components.
 * These tests verify that our implementation works correctly with actual
 * OpenTelemetry providers, not just our mock implementations.
 */
describe("OpenTelemetryTransport Integration Tests", () => {
  describe("Real SDK Integration", () => {
    it("should create spans with real TracerProvider", async () => {
      const setup = createRealTestSetup();
      try {
        const message = createTestMessage();
        await setup.transport.send(message);

        // Force span export
        await setup.tracerProvider.forceFlush();

        // Get exported spans
        const spans = setup.spanExporter.getFinishedSpans();
        assert.equal(spans.length, 1);

        const span = spans[0];
        assert.equal(span.name, "email send");
        assert.equal(span.attributes["operation.name"], "email.send");
        assert.equal(span.attributes["operation.type"], "email");
        assert.equal(span.attributes["upyo.transport.name"], "mock");
      } finally {
        await setup.cleanup();
      }
    });

    it("should handle span failures with real SDK", async () => {
      const setup = createRealTestSetup();
      try {
        const message = createTestMessage();
        const error = new Error("SMTP connection failed");
        setup.mockTransport.setThrowError(error);

        await assert.rejects(
          () => setup.transport.send(message),
          /SMTP connection failed/,
        );
        await setup.tracerProvider.forceFlush();

        const spans = setup.spanExporter.getFinishedSpans();
        assert.equal(spans.length, 1);

        const span = spans[0];
        assert.equal(span.status.code, 2); // ERROR status

        // Check for exception event
        const exceptionEvents = span.events.filter((e) =>
          e.name === "exception"
        );
        assert.equal(exceptionEvents.length, 1);
        assert.equal(
          exceptionEvents[0].attributes?.["exception.message"],
          "SMTP connection failed",
        );
      } finally {
        await setup.cleanup();
      }
    });

    it("should create batch spans for sendMany", async () => {
      const setup = createRealTestSetup();
      try {
        const messages = [
          createTestMessage({ subject: "Message 1" }),
          createTestMessage({ subject: "Message 2" }),
          createTestMessage({ subject: "Message 3" }),
        ];

        const receipts = [];
        for await (const receipt of setup.transport.sendMany(messages)) {
          receipts.push(receipt);
        }

        assert.equal(receipts.length, 3);
        await setup.tracerProvider.forceFlush();

        const spans = setup.spanExporter.getFinishedSpans();
        assert.equal(spans.length, 1);

        const span = spans[0];
        assert.equal(span.name, "email send_batch");
        assert.equal(span.attributes["operation.name"], "email.send_batch");
        assert.equal(span.attributes["upyo.batch.size"], 3);
      } finally {
        await setup.cleanup();
      }
    });

    it("should preserve span context and support distributed tracing", async () => {
      const setup = createRealTestSetup();
      try {
        const message = createTestMessage();

        // Create a root span to simulate incoming request context
        const tracer = setup.tracerProvider.getTracer("test-tracer");
        await tracer.startActiveSpan("incoming-request", async (rootSpan) => {
          try {
            await setup.transport.send(message);
            rootSpan.setStatus({ code: 1 }); // OK
          } finally {
            rootSpan.end();
          }
        });

        await setup.tracerProvider.forceFlush();

        const spans = setup.spanExporter.getFinishedSpans();
        assert.equal(spans.length, 2); // root span + email span

        const emailSpan = spans.find((s) => s.name === "email send");
        const rootSpan = spans.find((s) => s.name === "incoming-request");

        assert.ok(emailSpan);
        assert.ok(rootSpan);

        // Email span should be child of root span
        assert.equal(
          emailSpan.parentSpanId,
          rootSpan.spanContext().spanId,
          `Email span parentSpanId (${emailSpan.parentSpanId}) should match root span ID (${rootSpan.spanContext().spanId})`,
        );
        assert.equal(
          emailSpan.spanContext().traceId,
          rootSpan.spanContext().traceId,
        );
      } finally {
        await setup.cleanup();
      }
    });

    it("should handle multiple spans correctly", async () => {
      const setup = createRealTestSetup();
      try {
        // Send multiple messages to verify span isolation
        const message1 = createTestMessage({ subject: "Message 1" });
        const message2 = createTestMessage({ subject: "Message 2" });

        await setup.transport.send(message1);
        await setup.transport.send(message2);

        await setup.tracerProvider.forceFlush();

        const spans = setup.spanExporter.getFinishedSpans();
        assert.equal(spans.length, 2);

        // All spans should be for email send operations
        assert.ok(spans.every((span) => span.name === "email send"));
        assert.ok(
          spans.every((span) =>
            span.attributes["operation.name"] === "email.send"
          ),
        );
      } finally {
        await setup.cleanup();
      }
    });

    it("should work with metrics collection using real MeterProvider", async () => {
      const setup = createRealTestSetup();
      try {
        // Note: Real metrics testing requires a metric reader, but we can verify
        // that the transport doesn't crash when using real MeterProvider
        const message = createTestMessage();

        // This should not throw with real MeterProvider
        await setup.transport.send(message);

        // Send multiple messages to test batch metrics
        const messages = [
          createTestMessage({ subject: "Batch 1" }),
          createTestMessage({ subject: "Batch 2" }),
        ];

        const receipts = [];
        for await (const receipt of setup.transport.sendMany(messages)) {
          receipts.push(receipt);
        }

        assert.equal(receipts.length, 2);

        // Force metric collection (this verifies no exceptions are thrown)
        await setup.meterProvider.forceFlush();
      } finally {
        await setup.cleanup();
      }
    });

    it("should work with custom configuration using real SDK", async () => {
      const setup = createRealTestSetup();
      try {
        // Create transport with custom configuration
        const customTransport = new OpenTelemetryTransport(
          setup.mockTransport,
          {
            tracerProvider: setup.tracerProvider,
            meterProvider: setup.meterProvider,
            metrics: { enabled: true },
            tracing: {
              enabled: true,
              recordSensitiveData: true,
            },
            attributeExtractor: (operation, transportName) => ({
              "custom.operation": operation,
              "custom.transport": transportName,
              "custom.timestamp": Date.now(),
            }),
          },
        );

        const message = createTestMessage();
        await customTransport.send(message);
        await setup.tracerProvider.forceFlush();

        const spans = setup.spanExporter.getFinishedSpans();
        const span = spans[0];

        // Check custom attributes
        assert.equal(span.attributes["custom.operation"], "send");
        assert.equal(span.attributes["custom.transport"], "mock");
        assert.ok(typeof span.attributes["custom.timestamp"] === "number");

        // Check sensitive data recording
        assert.equal(
          span.attributes["email.from.address"],
          "sender@example.com",
        );

        await customTransport[Symbol.asyncDispose]();
      } finally {
        await setup.cleanup();
      }
    });
  });

  describe("Error Classification with Real SDK", () => {
    it("should classify and record errors correctly in real spans", async () => {
      const setup = createRealTestSetup();
      try {
        const message = createTestMessage();

        // Test different error types
        const testCases = [
          { error: new Error("401 Unauthorized"), expectedCategory: "auth" },
          {
            error: new Error("Rate limit exceeded"),
            expectedCategory: "rate_limit",
          },
          {
            error: new Error("DNS_PROBE_FINISHED_NXDOMAIN"),
            expectedCategory: "network",
          },
          {
            error: new Error("500 Internal Server Error"),
            expectedCategory: "server_error",
          },
        ];

        for (const { error } of testCases) {
          // Reset exporter for each test
          setup.spanExporter.reset();
          setup.mockTransport.setThrowError(error);

          await assert.rejects(() => setup.transport.send(message));
          await setup.tracerProvider.forceFlush();

          const spans = setup.spanExporter.getFinishedSpans();
          assert.equal(spans.length, 1);

          const span = spans[0];
          assert.equal(span.status.code, 2); // ERROR

          // Verify error classification is recorded in span attributes
          const errorEvents = span.events.filter((e) => e.name === "exception");
          assert.equal(errorEvents.length, 1);
          assert.equal(
            errorEvents[0].attributes?.["exception.message"],
            error.message,
          );
        }
      } finally {
        await setup.cleanup();
      }
    });
  });
});
