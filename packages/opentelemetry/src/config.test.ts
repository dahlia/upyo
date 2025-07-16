import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createOpenTelemetryConfig, defaultErrorClassifier } from "./config.ts";
import {
  MockMeterProvider,
  MockTracerProvider,
} from "./test-utils/mock-otel-providers.ts";

describe("config", () => {
  describe("createOpenTelemetryConfig", () => {
    it("should create config with defaults", () => {
      const tracerProvider = new MockTracerProvider();
      const meterProvider = new MockMeterProvider();

      const config = createOpenTelemetryConfig({
        tracerProvider,
        meterProvider,
      });

      assert.equal(config.metrics.enabled, true);
      assert.equal(config.metrics.samplingRate, 1.0);
      assert.equal(config.metrics.prefix, "upyo");
      assert.deepEqual(config.metrics.durationBuckets, [
        0.001,
        0.005,
        0.01,
        0.05,
        0.1,
        0.5,
        1.0,
        5.0,
        10.0,
      ]);

      assert.equal(config.tracing.enabled, true);
      assert.equal(config.tracing.samplingRate, 1.0);
      assert.equal(config.tracing.recordSensitiveData, false);
      assert.equal(config.tracing.spanPrefix, "email");
    });

    it("should merge custom configuration", () => {
      const tracerProvider = new MockTracerProvider();
      const meterProvider = new MockMeterProvider();

      const config = createOpenTelemetryConfig({
        tracerProvider,
        meterProvider,
        metrics: {
          enabled: true,
          prefix: "custom",
          samplingRate: 0.5,
        },
        tracing: {
          enabled: true,
          recordSensitiveData: true,
          spanPrefix: "custom_email",
        },
      });

      assert.equal(config.metrics.prefix, "custom");
      assert.equal(config.metrics.samplingRate, 0.5);
      assert.equal(config.tracing.recordSensitiveData, true);
      assert.equal(config.tracing.spanPrefix, "custom_email");
    });

    it("should throw when tracing enabled without TracerProvider", () => {
      assert.throws(() => {
        createOpenTelemetryConfig({
          tracing: { enabled: true },
          // No tracerProvider
        });
      }, /TracerProvider is required when tracing is enabled/);
    });

    it("should throw when metrics enabled without MeterProvider", () => {
      assert.throws(() => {
        createOpenTelemetryConfig({
          tracing: { enabled: false },
          metrics: { enabled: true },
          // No meterProvider
        });
      }, /MeterProvider is required when metrics are enabled/);
    });

    it("should work with both disabled", () => {
      const config = createOpenTelemetryConfig({
        metrics: { enabled: false },
        tracing: { enabled: false },
      });

      assert.equal(config.metrics.enabled, false);
      assert.equal(config.tracing.enabled, false);
    });

    it("should preserve custom functions", () => {
      const tracerProvider = new MockTracerProvider();
      const meterProvider = new MockMeterProvider();
      const customExtractor = () => ({ custom: "value" });
      const customClassifier = () => "custom_error";

      const config = createOpenTelemetryConfig({
        tracerProvider,
        meterProvider,
        attributeExtractor: customExtractor,
        errorClassifier: customClassifier,
      });

      assert.equal(config.attributeExtractor, customExtractor);
      assert.equal(config.errorClassifier, customClassifier);
    });
  });

  describe("defaultErrorClassifier", () => {
    it("should classify authentication errors", () => {
      const errors = [
        new Error("Unauthorized access"),
        new Error("Invalid API key provided"),
        new Error("Authentication failed"),
        new Error("HTTP 403 Forbidden"),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(category, "auth", `Failed to classify: ${error.message}`);
      }
    });

    it("should classify rate limiting errors", () => {
      const errors = [
        new Error("Rate limit exceeded"),
        new Error("HTTP 429 Too Many Requests"),
        new Error("Quota exceeded for today"),
        new Error("Request throttled"),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(category, "rate_limit", `Failed to classify: ${error}`);
      }
    });

    it("should classify network errors", () => {
      const errors = [
        new Error("Connection timeout"),
        new Error("DNS resolution failed"),
        (() => {
          const e = new Error("Network is unreachable");
          e.name = "NetworkError";
          return e;
        })(),
        (() => {
          const e = new Error("Operation was aborted");
          e.name = "AbortError";
          return e;
        })(),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(
          category,
          "network",
          `Failed to classify: ${error.message}`,
        );
      }
    });

    it("should classify validation errors", () => {
      const errors = [
        new Error("Invalid email address format"),
        new Error("Malformed request body"),
        new Error("Validation failed for field 'email'"),
        new Error("HTTP 400 Bad Request"),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(category, "validation", `Failed to classify: ${error}`);
      }
    });

    it("should classify service unavailable errors", () => {
      const errors = [
        new Error("HTTP 503 Service Unavailable"),
        new Error("Service temporarily unavailable"),
        new Error("Temporarily unavailable, try again later"),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(
          category,
          "service_unavailable",
          `Failed to classify: ${error}`,
        );
      }
    });

    it("should classify server errors", () => {
      const errors = [
        new Error("HTTP 500 Internal Server Error"),
        new Error("HTTP 502 Bad Gateway"),
        new Error("HTTP 504 Gateway Timeout"),
        new Error("Internal server error occurred"),
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(category, "server_error", `Failed to classify: ${error}`);
      }
    });

    it("should classify unknown errors", () => {
      const errors = [
        new Error("Something unexpected happened"),
        { message: "Unknown error" },
        "string error",
        123,
        null,
        undefined,
      ];

      for (const error of errors) {
        const category = defaultErrorClassifier(error);
        assert.equal(category, "unknown", `Failed to classify: ${error}`);
      }
    });

    it("should be case insensitive", () => {
      const error1 = new Error("RATE LIMIT EXCEEDED");
      const error2 = new Error("Rate Limit Exceeded");
      const error3 = new Error("rate limit exceeded");

      assert.equal(defaultErrorClassifier(error1), "rate_limit");
      assert.equal(defaultErrorClassifier(error2), "rate_limit");
      assert.equal(defaultErrorClassifier(error3), "rate_limit");
    });
  });
});
