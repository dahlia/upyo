---
description: >-
  Complete Resend transport guide covering email sending, batch optimization,
  message tagging, idempotency handling, and advanced configuration for reliable delivery.
---

Resend
======

*This transport is introduced in Upyo 0.3.0.*

[Resend] is a modern email service provider that offers a developer-friendly
API for sending transactional emails. Built with simplicity and reliability
in mind, Resend provides excellent deliverability, comprehensive tracking,
and intuitive tools for managing email infrastructure. It's particularly
well-suited for transactional emails such as welcome messages, password resets,
notifications, and system alerts, with features designed specifically for
developers and modern web applications.

Upyo provides a feature-rich Resend transport through the *@upyo/resend*
package, supporting all major Resend features including batch sending,
automatic idempotency, smart optimization, and comprehensive error handling.

[Resend]: https://resend.com/


Installation
------------

To use the Resend transport, you need to install the *@upyo/resend* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/resend
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/resend
~~~~

~~~~ sh [Yarn]
yarn add @upyo/resend
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/resend
~~~~

~~~~ sh [Bun]
bun add @upyo/resend
~~~~

:::


Getting started
---------------

Before using the Resend transport, you'll need a Resend account and an API
key. Resend provides API keys through their dashboard at [resend.com/api-keys],
where you can create keys with specific permissions for your application's needs.

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";
import { createMessage } from "@upyo/core";

const transport = new ResendTransport({
  apiKey: "re_1234567890abcdef_1234567890abcdef1234567890",
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

The Resend transport handles authentication automatically using your API key
and sends emails through Resend's reliable infrastructure. The service manages
bounces, spam filtering, and delivery optimization automatically, providing
excellent deliverability rates with minimal configuration.

[resend.com/api-keys]: https://resend.com/api-keys


Batch sending and optimization
------------------------------

One of Resend's key features is intelligent batch optimization. The transport
automatically chooses the most efficient sending method based on your message
characteristics, using Resend's batch API when possible for optimal performance:

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";
import { createMessage } from "@upyo/core";

const transport = new ResendTransport({
  apiKey: "re_1234567890abcdef_1234567890abcdef1234567890",
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

The transport automatically determines the optimal sending strategy:

- **≤100 messages without attachments/tags**: Uses Resend's batch API for fastest delivery
- **>100 messages**: Automatically chunks into multiple batch requests
- **Messages with attachments or tags**: Falls back to individual requests
- **Mixed scenarios**: Intelligently separates batch-compatible from individual messages

This optimization happens transparently, ensuring maximum performance while
maintaining full feature compatibility.


Message tagging and organization
--------------------------------

Resend supports message tagging for better organization and analytics.
Tags help you categorize emails and track performance across different types
of messages and campaigns:

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";
import { createMessage } from "@upyo/core";

const transport = new ResendTransport({
  apiKey: "re_1234567890abcdef_1234567890abcdef1234567890",
});

const welcomeMessage = createMessage({
  from: "onboarding@example.com",
  to: "newuser@example.com",
  subject: "Welcome to our platform",
  content: {
    html: "<h1>Welcome!</h1><p>Thank you for joining us.</p>",
    text: "Welcome! Thank you for joining us.",
  },
  tags: ["onboarding", "welcome", "transactional"],
});

const receipt = await transport.send(welcomeMessage);
~~~~

Tags appear in Resend's analytics dashboard, allowing you to track delivery
statistics, open rates, and engagement metrics for specific message categories.
This helps you understand which types of emails perform best with your audience
and optimize your email strategies accordingly.


Idempotency and reliability
---------------------------

Resend provides built-in idempotency support to prevent duplicate email sends
during network issues or application retries. The transport automatically
generates idempotency keys, but you can provide custom keys for specific
use cases:

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";
import { createMessage } from "@upyo/core";

const transport = new ResendTransport({
  apiKey: "re_1234567890abcdef_1234567890abcdef1234567890",
  retries: 3,
  timeout: 30000,
});

const message = createMessage({
  from: "alerts@example.com",
  to: "admin@example.com",
  subject: "🚨 System Alert: High CPU Usage",
  content: {
    text: "Server CPU usage has exceeded 90% for the past 5 minutes.",
  },
  priority: "high", // Sets X-Priority header
  tags: ["alert", "system"],
});

// Send the alert (idempotency key is automatically generated)
const receipt = await transport.send(message);
~~~~

The transport includes comprehensive retry logic with exponential backoff,
ensuring reliable delivery even during temporary service interruptions.
Priority levels are automatically converted to appropriate email headers
for better inbox placement of urgent messages.


Advanced configuration and reliability
--------------------------------------

The Resend transport includes comprehensive configuration options for timeout
handling, retry behavior, SSL validation, and custom headers to ensure reliable
email delivery in production environments:

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";

const transport = new ResendTransport({
  apiKey: "re_1234567890abcdef_1234567890abcdef1234567890",
  baseUrl: "https://api.resend.com",
  timeout: 15000,
  retries: 5,
  validateSsl: true,
  headers: {
    "X-Custom-Header": "MyApp-v1.0",
    "X-Environment": "production",
  },
});
~~~~

Timeout settings control how long to wait for Resend's API responses,
while retry configuration determines how many times to retry failed requests.
The transport uses exponential backoff for retries, reducing load on Resend's
servers during temporary outages and improving overall reliability.


Development and testing
-----------------------

For development and testing, you can configure the Resend transport for
testing environments. Resend provides test API keys and domains that allow
you to test email functionality without sending real emails to users:

~~~~ typescript twoslash
import { ResendTransport } from "@upyo/resend";
import { createMessage } from "@upyo/core";

// Development configuration with test domain
const devTransport = new ResendTransport({
  apiKey: "re_test1234567890ab_cdef1234567890abcdef1234567890ab",
  timeout: 5000, // Shorter timeout for development
  retries: 1, // Fewer retries for faster feedback
});

// Testing configuration with environment variables
const testTransport = new ResendTransport({
  apiKey: process.env.RESEND_TEST_API_KEY ?? "re_test123",
  timeout: 10000,
  retries: 1, // Fewer retries for faster test execution
});

// Example test message using onboarding@resend.dev
const testMessage = createMessage({
  from: "onboarding@resend.dev", // Resend's test domain
  to: "delivered@resend.dev", // Test recipient address
  subject: "Test Email",
  content: { text: "This is a test email." },
});

const receipt = await testTransport.send(testMessage);
~~~~

For local development, you can use Resend's test domains (`onboarding@resend.dev`)
which accept emails but don't deliver them to real recipients. This allows you
to test the complete email sending workflow without affecting real users.

> [!TIP]
> Resend provides excellent debugging tools through their dashboard where you
> can view all sent emails, delivery status, and detailed logs. This is
> invaluable for testing email flows and debugging delivery issues in
> development environments.

> [!CAUTION]
> Always use test API keys and verified domains during development to avoid
> sending test emails to real users. Resend's test domains like
> `onboarding@resend.dev` are perfect for development but have rate limits
> suitable for testing rather than production use.
