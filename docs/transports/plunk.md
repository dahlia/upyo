---
description: >-
  Complete Plunk transport guide covering email sending, self-hosted support,
  message organization, batch processing, and advanced configuration for reliable delivery.
---

Plunk
=====

*This transport is introduced in Upyo 0.3.0.*

[Plunk] is a modern, developer-friendly email service that offers both
cloud-hosted and self-hosted solutions for transactional email delivery.
Built with simplicity and reliability in mind, Plunk provides straightforward
APIs for sending emails with features like tracking, templates, and excellent
deliverability rates. It's particularly well-suited for developers who want
a clean, no-nonsense email service without the complexity of larger platforms,
making it ideal for transactional emails such as welcome messages, password
resets, notifications, and system alerts.

Upyo provides a feature-rich Plunk transport through the *@upyo/plunk*
package, supporting all major Plunk features including self-hosted instances,
batch sending, automatic retry logic, and comprehensive error handling.

[Plunk]: https://www.useplunk.com/


Installation
------------

To use the Plunk transport, you need to install the *@upyo/plunk* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/plunk
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/plunk
~~~~

~~~~ sh [Yarn]
yarn add @upyo/plunk
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/plunk
~~~~

~~~~ sh [Bun]
bun add @upyo/plunk
~~~~

:::


Getting started
---------------

Before using the Plunk transport, you'll need a Plunk account and an API
key. For cloud-hosted Plunk, you can get API keys from the Plunk dashboard
at [useplunk.com]. For self-hosted instances, API keys are managed through
your own Plunk installation.

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";

const transport = new PlunkTransport({
  apiKey: "sk_1234567890abcdef1234567890abcdef1234567890abcdef",
});

const message = createMessage({
  from: "support@example.com",
  to: "customer@example.com",
  subject: "Welcome to our service",
  content: { text: "Thank you for signing up!" },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

The Plunk transport handles authentication automatically using your API key
and sends emails through Plunk's reliable infrastructure. The service manages
bounces, spam filtering, and delivery optimization automatically, providing
excellent deliverability rates with minimal configuration.

[useplunk.com]: https://www.useplunk.com/


Self-hosted instances
---------------------

One of Plunk's key advantages is its support for self-hosted deployments
using Docker. This gives you complete control over your email infrastructure
while maintaining the simplicity of Plunk's API:

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";

// Self-hosted Plunk instance
const transport = new PlunkTransport({
  apiKey: "your-self-hosted-api-key",
  baseUrl: "https://mail.yourcompany.com/api",
  validateSsl: true,
});

const message = createMessage({
  from: "noreply@yourcompany.com",
  to: "employee@yourcompany.com",
  subject: "Internal notification",
  content: {
    html: "<h2>System Update</h2><p>The maintenance is complete.</p>",
    text: "System Update\n\nThe maintenance is complete.",
  },
});

const receipt = await transport.send(message);
~~~~

Self-hosted Plunk instances are deployed using the [driaug/plunk] Docker
image, giving you full control over your email infrastructure, data privacy,
and compliance requirements. This is particularly valuable for organizations
with strict data residency requirements or those who prefer to keep email
infrastructure in-house.

[driaug/plunk]: https://hub.docker.com/r/driaug/plunk


Message organization and batch sending
---------------------------------------

Plunk supports message tagging for better organization and analytics.
The transport also provides efficient batch processing for sending multiple
emails with automatic retry logic:

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";

const transport = new PlunkTransport({
  apiKey: "sk_1234567890abcdef1234567890abcdef1234567890abcdef",
  retries: 3,
  timeout: 30000,
});

const subscribers = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
];

const messages = subscribers.map(email =>
  createMessage({
    from: "newsletter@example.com",
    to: email,
    subject: "Monthly Newsletter - December 2024",
    content: {
      html: "<h2>This Month's Updates</h2><p>Here's what's new...</p>",
      text: "This Month's Updates\n\nHere's what's new...",
    },
    tags: ["newsletter", "monthly", "transactional"],
  })
);

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Newsletter sent with ID: ${receipt.messageId}`);
  } else {
    console.error(`Failed to send: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

Tags help you categorize emails and track performance through Plunk's
analytics dashboard. The `sendMany()` method processes emails efficiently
with built-in retry logic, ensuring reliable delivery even when some
individual messages encounter temporary issues.


Advanced features and reliability
---------------------------------

The Plunk transport includes comprehensive configuration options for timeout
handling, retry behavior, SSL validation, and custom headers to ensure reliable
email delivery in production environments:

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";
import { readFile } from "node:fs/promises";

const transport = new PlunkTransport({
  apiKey: "sk_1234567890abcdef1234567890abcdef1234567890abcdef",
  baseUrl: "https://api.useplunk.com",
  timeout: 15000,
  retries: 5,
  validateSsl: true,
  headers: {
    "X-Custom-Header": "MyApp-v1.0",
    "X-Environment": "production",
  },
});

// Sending with attachments (limited to 5 per Plunk API)
const fileContent = await readFile("./reports/report.pdf");
const message = createMessage({
  from: "documents@example.com",
  to: "client@example.com",
  subject: "Your requested documents",
  content: {
    text: "Please find the requested documents attached.",
    html: "<p>Please find the requested <strong>documents</strong> attached.</p>",
  },
  attachments: new File([fileContent], "report.pdf", { type: "application/pdf" }),
  priority: "high", // Sets appropriate email headers
  tags: ["documents", "client"],
});

const receipt = await transport.send(message);
~~~~

The transport automatically handles attachment conversion to base64 format
as required by Plunk's API, with a limit of 5 attachments per message.
Priority levels are converted to appropriate email headers for better
inbox placement of urgent messages.


Cancellation and error handling
--------------------------------

The Plunk transport supports request cancellation using AbortSignal and
provides comprehensive error handling for various failure scenarios:

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";

const transport = new PlunkTransport({
  apiKey: "sk_1234567890abcdef1234567890abcdef1234567890abcdef",
  timeout: 30000,
  retries: 3,
});

const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

const message = createMessage({
  from: "alerts@example.com",
  to: "admin@example.com",
  subject: "🚨 System Alert: High CPU Usage",
  content: {
    text: "Server CPU usage has exceeded 90% for the past 5 minutes.",
  },
  priority: "high",
  tags: ["alert", "system"],
});

const receipt = await transport.send(message, {
  signal: controller.signal
});

if (receipt.successful) {
  console.log("Alert sent with ID:", receipt.messageId);
} else {
  console.error("Alert failed:", receipt.errorMessages.join(", "));
}
~~~~

The transport includes comprehensive retry logic with exponential backoff,
automatically handling transient network errors, rate limiting, and temporary
service interruptions. Failed requests provide detailed error information
to help diagnose and resolve delivery issues.


Development and testing
-----------------------

For development and testing, you can configure the Plunk transport for
testing environments. When using self-hosted instances, you can set up
dedicated testing environments with isolated email delivery:

~~~~ typescript twoslash
import { PlunkTransport } from "@upyo/plunk";
import { createMessage } from "@upyo/core";

// Development configuration with shorter timeouts
const devTransport = new PlunkTransport({
  apiKey: "sk_test1234567890abcdef1234567890abcdef1234567890ab",
  timeout: 5000, // Shorter timeout for development
  retries: 1, // Fewer retries for faster feedback
});

// Testing configuration with environment variables
const testTransport = new PlunkTransport({
  apiKey: process.env.PLUNK_TEST_API_KEY ?? "sk_test123",
  baseUrl: process.env.PLUNK_TEST_URL ?? "https://api.useplunk.com",
  timeout: 10000,
  retries: 1, // Fewer retries for faster test execution
});

// Example test message
const testMessage = createMessage({
  from: "test@yourdomain.com",
  to: "testuser@yourdomain.com", // Use verified test addresses
  subject: "Test Email",
  content: { text: "This is a test email from development." },
  tags: ["test", "development"],
});

const receipt = await testTransport.send(testMessage);
~~~~

For local development, use verified sender addresses and test recipient
addresses to avoid sending emails to real users. Self-hosted Plunk instances
provide excellent isolation for testing, allowing you to monitor email
delivery without affecting production systems.

> [!TIP]
> Plunk provides a clean, straightforward dashboard for monitoring email
> delivery, viewing sent emails, and debugging issues. This is particularly
> valuable for self-hosted instances where you have full access to logs
> and delivery details.

> [!CAUTION]
> Always use test API keys and verified domains during development to avoid
> sending test emails to real users. For self-hosted instances, consider
> setting up separate testing environments with isolated email delivery
> to prevent accidental sends to production email addresses.