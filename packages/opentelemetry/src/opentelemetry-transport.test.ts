import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Receipt, Transport } from "@upyo/core";
import { OpenTelemetryTransport } from "./opentelemetry-transport.ts";
import {
  assertions,
  createTestMessage,
  createTestSetup,
  extractMetrics,
  extractSpans,
} from "./test-utils/test-config.ts";

describe("OpenTelemetryTransport", () => {
  describe("constructor", () => {
    it("should create transport with valid configuration", () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      assert.ok(transport instanceof OpenTelemetryTransport);
      assert.ok(transport.config);
    });

    it("should throw when tracing enabled but no TracerProvider", () => {
      const setup = createTestSetup();
      assert.throws(() => {
        new OpenTelemetryTransport(setup.mockTransport, {
          tracing: { enabled: true },
          // No tracerProvider
        });
      }, /TracerProvider is required when tracing is enabled/);
    });

    it("should throw when metrics enabled but no MeterProvider", () => {
      const setup = createTestSetup();
      assert.throws(() => {
        new OpenTelemetryTransport(setup.mockTransport, {
          tracerProvider: setup.tracerProvider, // Provide TracerProvider
          metrics: { enabled: true },
          // No meterProvider
        });
      }, /MeterProvider is required when metrics are enabled/);
    });

    it("should work with observability disabled", () => {
      const setup = createTestSetup();
      const disabledTransport = new OpenTelemetryTransport(
        setup.mockTransport,
        {
          tracing: { enabled: false },
          metrics: { enabled: false },
        },
      );
      assert.ok(disabledTransport instanceof OpenTelemetryTransport);
    });
  });

  describe("send", () => {
    it("should successfully send a message and record observability data", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const message = createTestMessage();
      const receipt = await transport.send(message);

      // Verify the message was sent
      assert.equal(receipt.successful, true);
      assert.ok(setup.mockTransport.sentMessages.includes(message));

      // Verify spans were created
      const spans = extractSpans(setup.tracerProvider);
      assert.equal(spans.length, 1);
      assertions.hasSpan(spans, "email send", {
        "operation.name": "email.send",
        "operation.type": "email",
        "upyo.transport.name": "mock",
      });

      // Verify metrics were recorded
      const metrics = extractMetrics(setup.meterProvider);
      assertions.hasMetric(metrics, "counter", 2); // attempts + messages
      assertions.hasMetric(metrics, "histogram", 3); // duration + size + attachments
      assertions.hasMetric(metrics, "upDownCounter", 2); // start + end
    });

    it("should handle send failures properly", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const message = createTestMessage();
      const error = new Error("Network timeout");
      setup.mockTransport.setThrowError(error);

      await assert.rejects(
        () => transport.send(message),
        /Network timeout/,
      );

      // Verify error was recorded in span
      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send");
      assert.equal(span.status?.code, 2); // ERROR
      assert.ok(span.events.some((e) => e.name === "exception"));

      // Verify error metrics
      const metrics = extractMetrics(setup.meterProvider);
      const attemptRecords = metrics
        .find((m) => m.records.some((r) => r.attributes?.status === "failure"))
        ?.records || [];
      assert.ok(attemptRecords.length > 0);
    });

    it("should handle receipt failures", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const message = createTestMessage();
      setup.mockTransport.setNextReceipt({
        successful: false,
        errorMessages: ["Invalid API key", "Rate limit exceeded"],
      });

      const receipt = await transport.send(message);

      assert.equal(receipt.successful, false);
      assert.deepEqual(receipt.errorMessages, [
        "Invalid API key",
        "Rate limit exceeded",
      ]);

      // Verify span recorded failure
      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send");
      assert.equal(span.status?.code, 2); // ERROR
    });

    it("should respect abort signals", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const message = createTestMessage();
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      await assert.rejects(
        () => transport.send(message, { signal: controller.signal }),
        /AbortError/,
      );
    });

    it("should work with tracing disabled", async () => {
      const setup = createTestSetup();
      const tracingDisabledTransport = new OpenTelemetryTransport(
        setup.mockTransport,
        {
          meterProvider: setup.meterProvider,
          tracing: { enabled: false },
          metrics: { enabled: true },
        },
      );

      const message = createTestMessage();
      await tracingDisabledTransport.send(message);

      // No spans should be created
      const spans = extractSpans(setup.tracerProvider);
      assert.equal(spans.length, 0);

      // Metrics should still be recorded
      const metrics = extractMetrics(setup.meterProvider);
      assertions.hasMetric(metrics, "counter", 2);
    });

    it("should work with metrics disabled", async () => {
      const setup = createTestSetup();
      const metricsDisabledTransport = new OpenTelemetryTransport(
        setup.mockTransport,
        {
          tracerProvider: setup.tracerProvider,
          tracing: { enabled: true },
          metrics: { enabled: false },
        },
      );

      const message = createTestMessage();
      await metricsDisabledTransport.send(message);

      // Spans should be created
      const spans = extractSpans(setup.tracerProvider);
      assert.equal(spans.length, 1);

      // No metrics should be recorded
      const metrics = extractMetrics(setup.meterProvider);
      assert.equal(Object.keys(metrics).length, 0);
    });

    it("should extract message attributes correctly", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const message = createTestMessage({
        subject: "Important Email",
        content: { html: "<p>Test HTML</p>", text: "Test text" },
        priority: "high",
        tags: ["urgent", "notification"],
        attachments: [], // No attachments so it's HTML content type
      });

      await transport.send(message);

      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send", {
        "email.to.count": 3,
        "email.attachments.count": 0,
        "email.priority": "high",
        "email.content.type": "html",
        "email.subject.length": 15, // "Important Email".length
      });

      // Tags should be JSON stringified
      assert.equal(
        span.attributes["email.tags"],
        JSON.stringify(["urgent", "notification"]),
      );
    });
  });

  describe("sendMany", () => {
    it("should send multiple messages and record batch metrics", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const messages = [
        createTestMessage({ subject: "Message 1" }),
        createTestMessage({ subject: "Message 2" }),
        createTestMessage({ subject: "Message 3" }),
      ];

      const receipts: Receipt[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 3);
      assert.ok(receipts.every((r) => r.successful));

      // Verify batch span
      const spans = extractSpans(setup.tracerProvider);
      assertions.hasSpan(spans, "email send_batch", {
        "operation.name": "email.send_batch",
        "email.batch.size": 3,
        "upyo.batch.size": 3,
      });

      // Verify all messages were sent
      assert.equal(setup.mockTransport.sentMessages.length, 3);
    });

    it("should handle partial failures in batch", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const messages = [
        createTestMessage({ subject: "Message 1" }),
        createTestMessage({ subject: "Message 2" }),
      ];

      // Make second message fail
      let callCount = 0;
      const originalSend = setup.mockTransport.send.bind(setup.mockTransport);
      setup.mockTransport.send = (msg, opts) => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            successful: false,
            errorMessages: ["Recipient not found"],
          });
        }
        return originalSend(msg, opts);
      };

      const receipts: Receipt[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.equal(receipts[0].successful, true);
      assert.equal(receipts[1].successful, false);

      // Verify batch span recorded partial success
      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send_batch");
      assert.ok(span.events.some((e) => e.name === "partial_success"));
    });

    it("should handle batch failures", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      const messages = [createTestMessage()];
      const error = new Error("Batch API error");
      setup.mockTransport.setThrowError(error);

      await assert.rejects(async () => {
        for await (const _receipt of transport.sendMany(messages)) {
          // This should throw before yielding any receipts
        }
      }, /Batch API error/);

      // Verify error was recorded
      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send_batch");
      assert.equal(span.status?.code, 2); // ERROR
    });
  });

  describe("Resource Disposal", () => {
    it("should dispose wrapped transport if it supports AsyncDisposable", async () => {
      const setup = createTestSetup();
      let disposed = false;
      const disposableTransport = {
        ...setup.mockTransport,
        [Symbol.asyncDispose]: () => {
          disposed = true;
          return Promise.resolve();
        },
      } as unknown as Transport & AsyncDisposable;

      const otelTransport = new OpenTelemetryTransport(
        disposableTransport,
        setup.config,
      );
      await otelTransport[Symbol.asyncDispose]();

      assert.equal(disposed, true);
    });

    it("should dispose wrapped transport if it supports Disposable", async () => {
      const setup = createTestSetup();
      let disposed = false;
      const disposableTransport = {
        ...setup.mockTransport,
        [Symbol.dispose]: () => {
          disposed = true;
        },
      } as unknown as Transport & Disposable;

      const otelTransport = new OpenTelemetryTransport(
        disposableTransport,
        setup.config,
      );
      await otelTransport[Symbol.asyncDispose]();

      assert.equal(disposed, true);
    });

    it("should prefer AsyncDisposable over Disposable when both are available", async () => {
      const setup = createTestSetup();
      let asyncDisposed = false;
      let syncDisposed = false;

      const disposableTransport = {
        ...setup.mockTransport,
        [Symbol.asyncDispose]: () => {
          asyncDisposed = true;
          return Promise.resolve();
        },
        [Symbol.dispose]: () => {
          syncDisposed = true;
        },
      } as unknown as Transport & AsyncDisposable & Disposable;

      const otelTransport = new OpenTelemetryTransport(
        disposableTransport,
        setup.config,
      );
      await otelTransport[Symbol.asyncDispose]();

      assert.equal(asyncDisposed, true);
      assert.equal(syncDisposed, false);
    });

    it("should not throw if wrapped transport doesn't support disposal", async () => {
      const setup = createTestSetup();
      const transport = new OpenTelemetryTransport(
        setup.mockTransport,
        setup.config,
      );
      await assert.doesNotReject(() => transport[Symbol.asyncDispose]());
    });
  });

  describe("custom configuration", () => {
    it("should use custom attribute extractor", async () => {
      const setup = createTestSetup();
      const customTransport = new OpenTelemetryTransport(setup.mockTransport, {
        ...setup.config,
        attributeExtractor: () => ({
          "custom.attribute": "test-value",
          "custom.number": 42,
        }),
      });

      const message = createTestMessage();
      await customTransport.send(message);

      const spans = extractSpans(setup.tracerProvider);
      assertions.hasSpan(spans, "email send", {
        "custom.attribute": "test-value",
        "custom.number": 42,
      });
    });

    it("should use custom error classifier", async () => {
      const setup = createTestSetup();
      const customTransport = new OpenTelemetryTransport(setup.mockTransport, {
        ...setup.config,
        errorClassifier: (error: unknown) => {
          if (error instanceof Error && error.message.includes("custom")) {
            return "custom_error";
          }
          return "other_error";
        },
      });

      const message = createTestMessage();
      setup.mockTransport.setThrowError(new Error("custom error occurred"));

      await assert.rejects(() => customTransport.send(message));

      const metrics = extractMetrics(setup.meterProvider);
      const failureRecords = metrics
        .flatMap((m) => m.records)
        .filter((r) => r.attributes?.error_type === "custom_error");

      assert.ok(failureRecords.length > 0);
    });

    it("should respect sensitive data configuration", async () => {
      const setup = createTestSetup();
      const sensitiveTransport = new OpenTelemetryTransport(
        setup.mockTransport,
        {
          ...setup.config,
          tracing: {
            enabled: true,
            recordSensitiveData: true,
            samplingRate: 1.0,
            spanPrefix: "email",
          },
        },
      );

      const message = createTestMessage();
      await sensitiveTransport.send(message);

      const spans = extractSpans(setup.tracerProvider);
      const span = assertions.hasSpan(spans, "email send");

      // Should include sensitive data
      assert.equal(span.attributes["email.from.address"], "sender@example.com");
    });
  });
});
