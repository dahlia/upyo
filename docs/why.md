---
description: >-
  Learn why Upyo is the ideal choice for email sending: cross-runtime
  compatibility, zero dependencies, simple API, built-in testing tools,
  and provider independence.
---

Why Upyo?
=========

Upyo[^1] is a simple and modern email library that works across multiple runtimes
including Node.js, Deno, Bun, and edge functions. It provides a universal
interface for email delivery, making it easy to send emails with minimal setup.

[^1]: Upyo (pronounced /oo-pee-oh/) comes from the Sino-Korean word
      [郵票] (upyo), meaning *postage stamp*.
      The name reflects the library's purpose: just as postage stamps enable
      mail delivery across different postal systems, Upyo enables email delivery
      across different runtime environments and service providers.

[郵票]: https://en.wiktionary.org/wiki/%E9%83%B5%E7%A5%A8#Noun_2


Cross-runtime compatibility
---------------------------

Upyo is designed to work seamlessly across different JavaScript runtimes.
Whether you're using Node.js, Deno, Bun, or deploying to edge functions,
Upyo provides a consistent API for sending emails. This means you can write
your email sending code once and run it anywhere without worrying about
runtime-specific details.


Lightweight and dependency-free
-------------------------------

Upyo has zero dependencies, making it lightweight and easy to integrate into
your projects. You don't have to worry about managing additional packages or
bloat. Upyo is designed to be minimalistic, focusing solely on email delivery
without unnecessary complexity.


Dead simple API
---------------

Upyo provides a straightforward and intuitive API for sending emails. You can
send emails with just a few lines of code, without needing to understand
complex configurations or setups. The API is designed to be easy to use, so you
can focus on building your application rather than dealing with email delivery
intricacies.

Here's a quick example of sending an email with Upyo:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailgunTransport } from "@upyo/mailgun";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new MailgunTransport({
  apiKey: process.env.MAILGUN_KEY!,
  domain: process.env.MAILGUN_DOMAIN!,
  region: process.env.MAILGUN_REGION as "us" | "eu",
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~


Built for testing
-----------------

Upyo is designed with testing in mind. The [*@upyo/mock*](./transports/mock.md)
transport provides a comprehensive testing solution that lets you verify email
functionality without sending real emails. You can inspect sent messages,
simulate network delays and failures, and test complex async email workflows
with confidence.

The mock transport implements the same interface as real transports, making it
a drop-in replacement for testing. This means you can write reliable tests that
verify your email logic works correctly across all scenarios:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MockTransport } from "@upyo/mock";

// Use mock transport in tests - same interface, no real emails
const transport = new MockTransport();

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Test Email",
  content: { text: "This is a test." },
});

const receipt = await transport.send(message);

// Verify the email was "sent" successfully
console.log(receipt.successful); // true

// Inspect what was sent for testing assertions
const sentMessages = transport.getSentMessages();
console.log(sentMessages[0].subject); // "Test Email"
console.log(sentMessages[0].recipients[0].address); // "recipient@example.net"
~~~~


Provider independence
---------------------

Upyo's transport abstraction means you're never locked into a single email
service provider. Whether you use [SMTP](./transports/smtp.md),
[Mailgun](./transports/mailgun.md), [Resend](./transports/resend.md),
[SendGrid](./transports/sendgrid.md), [Amazon SES](./transports/ses.md),
or any future provider, your application code stays exactly the same.
Switch providers in minutes, not days:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { MailgunTransport } from "@upyo/mailgun";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This works with any transport!" },
});

// Start with SMTP for development
const smtpTransport = new SmtpTransport({
  host: "localhost",
  port: 1025,
});

// Switch to Mailgun for production - same interface!
const mailgunTransport = new MailgunTransport({
  apiKey: "your-api-key",
  domain: "your-domain.com",
});

// Your application code never changes
async function sendEmail(transport: any) {
  const receipt = await transport.send(message);
  return receipt.successful ? receipt.messageId : receipt.errorMessages;
}

// Works identically with any transport
await sendEmail(smtpTransport);   // ✅ Works
await sendEmail(mailgunTransport); // ✅ Works
~~~~


Observability
-------------

Upyo integrates seamlessly with [OpenTelemetry](./transports/opentelemetry.md)
to provide comprehensive observability for your email operations. Monitor
delivery rates, track performance, and debug issues with distributed tracing—all
without changing your existing code:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { createOpenTelemetryTransport } from "@upyo/opentelemetry";

// Wrap any transport with OpenTelemetry instrumentation
const baseTransport = new SmtpTransport({ host: "smtp.example.com" });
const transport = createOpenTelemetryTransport(baseTransport, {
  serviceName: "email-service",
  tracing: { enabled: true },
  metrics: { enabled: true },
});

// Your email code stays exactly the same
const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Production Email",
  content: { text: "Now with full observability!" },
});

await transport.send(message);
// Automatically creates traces and records metrics:
// - Email delivery success/failure rates
// - Send operation latency histograms
// - Error classification by type
// - Distributed tracing for debugging
~~~~

Key observability features:

Zero-code instrumentation
:   Add observability to any transport without modifying your email logic

Comprehensive metric
:   Track delivery rates, latency, batch sizes, and error distributions

Distributed tracing
:   Follow email operations across your entire system with OpenTelemetry spans

Smart error classification
:   Automatically categorize failures (auth, network, validation, etc.)
    for better alerting

Production-tested
:   Built on OpenTelemetry standards used by major observability platforms

Whether you're using Jaeger, Prometheus, Grafana, or commercial APM solutions,
Upyo's OpenTelemetry support ensures you have the insights needed to run email
services reliably at scale.


Comparison with alternatives
----------------------------

Upyo is not trying to replace every email library out there. Different tools
excel in different scenarios. Here's an honest comparison to help you decide
if Upyo is the right choice for your project.

### Feature comparison

The following tables compare Upyo with other popular JavaScript/TypeScript
email libraries.

Legend:

✅
:   Supported

❌
:   Not supported

🔜
:   Planned for future release

N/A
:   Not applicable (architecture doesn't require this feature)

#### Runtime support

| Runtime        | Upyo | [Nodemailer] | [Resend] | [SendGrid] | [Mailgun] |
|----------------|:----:|:------------:|:--------:|:----------:|:---------:|
| Node.js        |  ✅  |      ✅      |    ✅    |     ✅     |     ✅    |
| Deno           |  ✅  |      ❌      |    ✅    |     ✅     |     ✅    |
| Bun            |  ✅  |      ❌      |    ✅    |     ✅     |     ✅    |
| Edge functions |  ✅  |      ❌      |    ✅    |     ✅     |     ✅    |

[Nodemailer]: https://nodemailer.com/
[Resend]: https://resend.com/
[SendGrid]: https://sendgrid.com/
[Mailgun]: https://www.mailgun.com/

#### Transport options

| Transport | Upyo | [Nodemailer] | [Resend] | [SendGrid] | [Mailgun] |
|-----------|:----:|:------------:|:--------:|:----------:|:---------:|
| SMTP      |  ✅  |      ✅      |    ❌    |     ❌     |     ❌    |
| HTTP API  |  ✅  |      ❌[^2]  |    ✅    |     ✅     |     ✅    |

[^2]: Available via community plugins.

#### Core features

| Feature             | Upyo | [Nodemailer] | [Resend] | [SendGrid] | [Mailgun] |
|---------------------|:----:|:------------:|:--------:|:----------:|:---------:|
| Connection pooling  |  ✅  |      ✅      |    N/A   |     N/A    |    N/A    |
| Attachments         |  ✅  |      ✅      |    ✅    |     ✅     |    ✅     |
| Inline images       |  ✅  |      ✅      |    ✅    |     ✅     |    ✅     |
| HTML and plain text |  ✅  |      ✅      |    ✅    |     ✅     |    ✅     |
| Batch sending       |  ✅  |      ❌      |    ✅    |     ✅     |    ✅     |

#### Advanced features

| Feature               | Upyo | [Nodemailer] | [Resend] | [SendGrid] | [Mailgun] |
|-----------------------|:----:|:------------:|:--------:|:----------:|:---------:|
| DKIM signing          |  ✅  |      ✅      |    N/A   |     N/A    |    N/A    |
| OAuth 2.0 authentication | 🔜 |     ✅      |    N/A   |     N/A    |    N/A    |
| Template engine       |  ❌  |      ❌[^2]  |    ✅    |     ✅     |    ✅     |

#### Developer experience

| Feature                   | Upyo | [Nodemailer] | [Resend] | [SendGrid] | [Mailgun] |
|---------------------------|:----:|:------------:|:--------:|:----------:|:---------:|
| Built-in mock transport   |  ✅  |      ❌[^3]  |    ❌    |     ❌     |     ❌    |
| OpenTelemetry integration |  ✅  |      ❌      |    ❌    |     ❌     |     ❌    |
| Provider abstraction      |  ✅  |      ❌      |    ❌    |     ❌     |     ❌    |
| Zero dependencies         |  ✅  |      ✅      |    ❌    |     ❌     |     ❌    |
| Native TypeScript         |  ✅  |      ❌[^4]  |    ✅    |     ✅     |     ✅    |

[^3]: Stream transport can be used for similar purposes.
[^4]: Requires `@types/nodemailer` package.

### When to use Upyo

Upyo is a great choice when you need:

 -  *Cross-runtime compatibility*: Your code runs on Node.js, Deno, Bun,
    or edge functions.
 -  *Provider flexibility*: You want to switch between email providers without
    changing application code.
 -  *Testing-first development*: Built-in mock transport makes testing
    straightforward.
 -  *Observability*: OpenTelemetry integration for monitoring and debugging.
 -  *Minimal footprint*: Zero dependencies keep your bundle size small.

### When to consider alternatives

Consider other libraries when you need:

 -  *OAuth 2.0 authentication*: Nodemailer has mature support for this feature
    (Upyo support is planned).
 -  *Built-in templating*: Resend (React), SendGrid, and Mailgun offer
    integrated template engines.
 -  *Node.js-only deployment*: Nodemailer's extensive plugin ecosystem may
    offer more flexibility.
 -  *Provider-specific features*: Official SDKs (Resend, SendGrid, Mailgun)
    expose provider-specific capabilities that Upyo's unified interface may
    not cover.
