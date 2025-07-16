<!-- deno-fmt-ignore-file -->

@upyo/opentelemetry
===================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

OpenTelemetry observability transport for [Upyo] email library.

This package provides a decorator transport that wraps existing Upyo transports
to add automatic OpenTelemetry metrics and tracing without requiring changes to
existing code. It follows the decorator pattern, accepting any transport and
adding standardized observability features including email delivery metrics,
latency histograms, error classification, and distributed tracing support.

[JSR]: https://jsr.io/@upyo/opentelemetry
[JSR badge]: https://jsr.io/badges/@upyo/opentelemetry
[npm]: https://www.npmjs.com/package/@upyo/opentelemetry
[npm badge]: https://img.shields.io/npm/v/@upyo/opentelemetry?logo=npm
[Upyo]: https://upyo.org/


Features
--------

 -  Zero-code observability: Wrap any existing Upyo transport with OpenTelemetry
    instrumentation
 -  Comprehensive metrics: Email delivery counters, duration histograms,
    message size tracking, and active operation gauges
 -  Distributed tracing: Automatic span creation with semantic attributes
    following OpenTelemetry conventions
 -  Error classification: Intelligent categorization of email delivery failures
    (auth, rate_limit, network, etc.)
 -  Performance optimized: Configurable sampling rates and feature toggles for
    minimal overhead
 -  Cross-runtime compatible: Works on Node.js, Deno, Bun, and edge functions
 -  Flexible configuration: Support both manual provider injection and
    auto-configuration helpers


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/opentelemetry @opentelemetry/api
pnpm add       @upyo/core @upyo/opentelemetry @opentelemetry/api
yarn add       @upyo/core @upyo/opentelemetry @opentelemetry/api
deno add --jsr @upyo/core @upyo/opentelemetry
bun  add       @upyo/core @upyo/opentelemetry @opentelemetry/api
~~~~


Basic Usage
-----------

~~~~ typescript
import { MailgunTransport } from "@upyo/mailgun";
import { OpenTelemetryTransport } from "@upyo/opentelemetry";
import { trace, metrics } from "@opentelemetry/api";

// Create your base transport
const baseTransport = new MailgunTransport({
  apiKey: "your-api-key",
  domain: "your-domain.com",
  region: "us"
});

// Wrap with OpenTelemetry observability
const transport = new OpenTelemetryTransport(baseTransport, {
  tracerProvider: trace.getTracerProvider(),
  meterProvider: metrics.getMeterProvider(),
  metrics: { enabled: true },
  tracing: { enabled: true }
});

// Use exactly like any other transport
const receipt = await transport.send(message);
if (receipt.successful) {
  console.log('Message sent with ID:', receipt.messageId);
} else {
  console.error('Send failed:', receipt.errorMessages.join(', '));
}
~~~~


Factory Function
----------------

For simplified setup, use the factory function:

~~~~ typescript
import { createOpenTelemetryTransport } from "@upyo/opentelemetry";

const transport = createOpenTelemetryTransport(baseTransport, {
  serviceName: "email-service",
  serviceVersion: "1.0.0",
  metrics: { prefix: "myapp" },
  tracing: { recordSensitiveData: false }
});
~~~~


Auto-Configuration
------------------

For environments where you want automatic OpenTelemetry setup:

~~~~ typescript
import { createOpenTelemetryTransport } from "@upyo/opentelemetry";

const transport = createOpenTelemetryTransport(baseTransport, {
  serviceName: "email-service",
  auto: {
    tracing: { endpoint: "http://jaeger:14268/api/traces" },
    metrics: { endpoint: "http://prometheus:9090/api/v1/write" }
  }
});
~~~~


Resource Management
-------------------

The OpenTelemetryTransport implements `AsyncDisposable` and automatically
handles cleanup of wrapped transports:

~~~~ typescript
// Using with explicit disposal
const transport = new OpenTelemetryTransport(smtpTransport, config);
try {
  await transport.send(message);
} finally {
  await transport[Symbol.asyncDispose]();
}

// Using with 'using' statement (when available)
{
  using transport = new OpenTelemetryTransport(smtpTransport, config);
  await transport.send(message);
  // Automatically disposed at end of scope
}
~~~~

**Disposal Priority:**

1. If wrapped transport supports `AsyncDisposable` → calls `[Symbol.asyncDispose]()`
2. If wrapped transport supports `Disposable` → calls `[Symbol.dispose]()`
3. If wrapped transport supports neither → no-op (no error thrown)


Configuration
-------------

### `OpenTelemetryConfig`

| Option               | Type             | Default                  | Description                                                 |
| -------------------- | ---------------- | ------------------------ | ----------------------------------------------------------- |
| `tracerProvider`     | `TracerProvider` |                          | OpenTelemetry tracer provider (required if tracing enabled) |
| `meterProvider`      | `MeterProvider`  |                          | OpenTelemetry meter provider (required if metrics enabled)  |
| `metrics`            | `MetricsConfig`  | `{ enabled: true }`      | Metrics collection configuration                            |
| `tracing`            | `TracingConfig`  | `{ enabled: true }`      | Tracing configuration                                       |
| `attributeExtractor` | `Function`       |                          | Custom attribute extractor function                         |
| `errorClassifier`    | `Function`       | `defaultErrorClassifier` | Custom error classifier function                            |
| `auto`               | `AutoConfig`     |                          | Auto-configuration options                                  |

### `MetricsConfig`

| Option            | Type       | Default               | Description                            |
| ----------------- | ---------- | --------------------- | -------------------------------------- |
| `enabled`         | `boolean`  | `true`                | Whether metrics collection is enabled  |
| `samplingRate`    | `number`   | `1.0`                 | Sampling rate (0.0 to 1.0)             |
| `prefix`          | `string`   | `"upyo"`              | Prefix for metric names                |
| `durationBuckets` | `number[]` | `[0.001, 0.005, ...]` | Histogram buckets for duration metrics |

### `TracingConfig`

| Option                | Type      | Default   | Description                                    |
| --------------------- | --------- | --------- | ---------------------------------------------- |
| `enabled`             | `boolean` | `true`    | Whether tracing is enabled                     |
| `samplingRate`        | `number`  | `1.0`     | Sampling rate (0.0 to 1.0)                     |
| `recordSensitiveData` | `boolean` | `false`   | Whether to record email addresses and subjects |
| `spanPrefix`          | `string`  | `"email"` | Prefix for span names                          |


Telemetry Data
--------------

### Metrics

The transport collects the following metrics:

| Metric Name                     | Type      | Labels                              | Description                      |
| ------------------------------- | --------- | ----------------------------------- | -------------------------------- |
| `upyo_email_attempts_total`     | Counter   | `transport`, `status`, `error_type` | Total email send attempts        |
| `upyo_email_messages_total`     | Counter   | `transport`, `priority`             | Total email messages processed   |
| `upyo_email_duration_seconds`   | Histogram | `transport`, `operation`            | Duration of email operations     |
| `upyo_email_message_size_bytes` | Histogram | `transport`, `content_type`         | Size of email messages           |
| `upyo_email_attachments_count`  | Histogram | `transport`                         | Number of attachments per email  |
| `upyo_email_active_sends`       | Gauge     | `transport`                         | Currently active send operations |

### Span Attributes

The transport creates spans with the following attributes:

#### General Operation Attributes

| Attribute        | Type     | Description                                       |
| ---------------- | -------- | ------------------------------------------------- |
| `operation.name` | `string` | Operation name (`email.send`, `email.send_batch`) |
| `operation.type` | `string` | Always `"email"`                                  |

#### Network Attributes

| Attribute               | Type     | Description                        |
| ----------------------- | -------- | ---------------------------------- |
| `network.protocol.name` | `string` | Protocol (`smtp`, `https`, `http`) |
| `server.address`        | `string` | Server hostname                    |
| `server.port`           | `number` | Server port                        |

#### Email-Specific Attributes

| Attribute                 | Type     | Description                                     |
| ------------------------- | -------- | ----------------------------------------------- |
| `email.from.address`      | `string` | Sender email (if `recordSensitiveData: true`)   |
| `email.from.domain`       | `string` | Sender domain (if `recordSensitiveData: false`) |
| `email.to.count`          | `number` | Number of recipients                            |
| `email.cc.count`          | `number` | Number of CC recipients                         |
| `email.bcc.count`         | `number` | Number of BCC recipients                        |
| `email.subject.length`    | `number` | Length of subject line                          |
| `email.attachments.count` | `number` | Number of attachments                           |
| `email.message.size`      | `number` | Estimated message size in bytes                 |
| `email.content.type`      | `string` | Content type (`html`, `text`, `multipart`)      |
| `email.priority`          | `string` | Message priority (`high`, `normal`, `low`)      |
| `email.tags`              | `string` | JSON array of message tags                      |

#### Upyo-Specific Attributes

| Attribute                | Type     | Description                              |
| ------------------------ | -------- | ---------------------------------------- |
| `upyo.transport.name`    | `string` | Transport type (`mailgun`, `smtp`, etc.) |
| `upyo.transport.version` | `string` | Transport version                        |
| `upyo.message.id`        | `string` | Message ID from successful sends         |
| `upyo.retry.count`       | `number` | Number of retry attempts                 |
| `upyo.batch.size`        | `number` | Batch size for batch operations          |

### Span Events

| Event Name          | Description               | Attributes                            |
| ------------------- | ------------------------- | ------------------------------------- |
| `email.sent`        | Email successfully sent   | `message.id`                          |
| `email.send_failed` | Email send failed         | `error.count`, `error.messages`       |
| `exception`         | Exception occurred        | `exception.type`, `exception.message` |
| `retry`             | Retry attempt             | `retry.attempt`, `retry.reason`       |
| `partial_success`   | Batch partially succeeded | `success_count`, `failure_count`      |


Error Classification
--------------------

The transport automatically classifies errors into standard categories:

| Category              | Description             | Example Errors                          |
| --------------------- | ----------------------- | --------------------------------------- |
| `auth`                | Authentication failures | Invalid API key, unauthorized           |
| `rate_limit`          | Rate limiting           | Quota exceeded, too many requests       |
| `network`             | Network connectivity    | Timeout, DNS resolution, abort          |
| `validation`          | Input validation        | Invalid email format, malformed request |
| `service_unavailable` | Service outages         | HTTP 503, temporarily unavailable       |
| `server_error`        | Server errors           | HTTP 500, internal server error         |
| `unknown`             | Unclassified errors     | Any other errors                        |

### Custom Error Classification

You can provide a custom error classifier:

~~~~ typescript
import { createErrorClassifier } from "@upyo/opentelemetry";

const customClassifier = createErrorClassifier({
  patterns: {
    "spam": /spam|blocked|reputation/i,
    "bounce": /bounce|undeliverable|invalid.*recipient/i,
  },
  fallback: "email_error"
});

const transport = new OpenTelemetryTransport(baseTransport, {
  errorClassifier: customClassifier,
  // ... other config
});
~~~~


Custom Attributes
-----------------

Add custom attributes to spans and metrics:

~~~~ typescript
import { createEmailAttributeExtractor } from "@upyo/opentelemetry";

const customExtractor = createEmailAttributeExtractor("my-transport", {
  customAttributes: (operation, transportName, messageCount, totalSize) => ({
    "app.version": "1.0.0",
    "app.environment": process.env.NODE_ENV,
    "deployment.id": process.env.DEPLOYMENT_ID,
  })
});

const transport = new OpenTelemetryTransport(baseTransport, {
  attributeExtractor: customExtractor,
  // ... other config
});
~~~~


Performance Considerations
--------------------------

### Sampling

Control overhead with sampling rates:

~~~~ typescript
const transport = new OpenTelemetryTransport(baseTransport, {
  metrics: {
    enabled: true,
    samplingRate: 0.1 // Sample 10% of operations
  },
  tracing: {
    enabled: true,
    samplingRate: 0.05 // Sample 5% of operations
  }
});
~~~~

### Feature Toggles

Disable features selectively:

~~~~ typescript
// Metrics only, no tracing
const metricsOnlyTransport = new OpenTelemetryTransport(baseTransport, {
  meterProvider: metrics.getMeterProvider(),
  metrics: { enabled: true },
  tracing: { enabled: false }
});

// Tracing only, no metrics
const tracingOnlyTransport = new OpenTelemetryTransport(baseTransport, {
  tracerProvider: trace.getTracerProvider(),
  tracing: { enabled: true },
  metrics: { enabled: false }
});
~~~~


Monitoring Examples
-------------------

### Prometheus Queries

~~~~ promql
# Email delivery success rate
rate(upyo_email_attempts_total{status="success"}[5m]) /
rate(upyo_email_attempts_total[5m])

# Average email send duration
rate(upyo_email_duration_seconds_sum[5m]) /
rate(upyo_email_duration_seconds_count[5m])

# Error rate by transport
rate(upyo_email_attempts_total{status="failure"}[5m]) by (transport, error_type)

# Active email sending operations
upyo_email_active_sends
~~~~

### Grafana Dashboard Panels

~~~~ json
{
  "title": "Email Delivery Success Rate",
  "type": "stat",
  "targets": [{
    "expr": "rate(upyo_email_attempts_total{status=\"success\"}[5m]) / rate(upyo_email_attempts_total[5m])",
    "format": "time_series"
  }]
}
~~~~

### Alerting Rules

~~~~ yaml
groups:
  - name: email_alerts
    rules:
      - alert: EmailDeliveryFailureRate
        expr: |
          (
            rate(upyo_email_attempts_total{status="failure"}[5m]) /
            rate(upyo_email_attempts_total[5m])
          ) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High email delivery failure rate"
          description: "Email failure rate is {{ $value | humanizePercentage }} for transport {{ $labels.transport }}"

      - alert: EmailSendDurationHigh
        expr: |
          histogram_quantile(0.95, rate(upyo_email_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High email send duration"
          description: "95th percentile email send duration is {{ $value }}s"
~~~~


Cross-Runtime Compatibility
---------------------------

This package works across all JavaScript runtimes:

- **Node.js**: Full OpenTelemetry ecosystem support
- **Deno**: Native ESM and web standards compatibility
- **Bun**: High-performance runtime optimizations
- **Edge functions**: Minimal overhead for serverless environments

Resource cleanup is handled automatically via `AsyncDisposable` when supported:

~~~~ typescript
// Automatic cleanup with using statement (Node.js 20+, modern browsers)
await using transport = new OpenTelemetryTransport(baseTransport, config);
await transport.send(message);
// Transport is automatically disposed here

// Manual cleanup for older environments
const transport = new OpenTelemetryTransport(baseTransport, config);
try {
  await transport.send(message);
} finally {
  await transport[Symbol.asyncDispose]();
}
~~~~
