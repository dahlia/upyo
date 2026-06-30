<!-- deno-fmt-ignore-file -->

@upyo/retry
===========

*@upyo/retry* provides a retry and backoff decorator for Upyo transports.
It wraps any `Transport` implementation without changing the transport
interface, so it can be composed with SMTP, HTTP API transports, pool
transports, and OpenTelemetry instrumentation.


Installation
------------

~~~~ bash
deno add jsr:@upyo/retry
pnpm add @upyo/retry
~~~~


Usage
-----

~~~~ typescript
import { RetryTransport } from "@upyo/retry";
import { MailgunTransport } from "@upyo/mailgun";

const baseTransport = new MailgunTransport({
  apiKey: "your-mailgun-api-key",
  domain: "mg.example.com",
});

const transport = new RetryTransport(baseTransport, {
  maxAttempts: 3,
  backoff: {
    baseDelayMilliseconds: 1000,
    maxDelayMilliseconds: 30000,
    factor: 2,
  },
});
~~~~

The retry transport uses structured Upyo failure receipts to distinguish
transient failures, such as rate limits and temporary server errors, from
permanent failures, such as validation or authentication errors.  It also
honors provider-supplied `Retry-After` metadata when available.
