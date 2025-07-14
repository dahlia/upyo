---
description: >-
  Learn how to send emails with Mailgun transport, including regional configuration,
  tracking and analytics, message tagging, and bulk email sending with retry logic.
---

Mailgun
=======

[Mailgun] is a powerful email service provider that specializes in reliable
email delivery for developers and businesses.  It offers robust APIs for
sending, receiving, and tracking emails, making it particularly well-suited
for transactional emails such as password resets, order confirmations,
notifications, and marketing campaigns. Mailgun provides advanced features
like email analytics, A/B testing, bounce handling, and comprehensive tracking
capabilities.

Upyo provides a feature-rich Mailgun transport through the *@upyo/mailgun*
package, supporting all major Mailgun features including tracking, tagging,
regional endpoints, and bulk sending with retry logic.

[Mailgun]: https://www.mailgun.com/


Installation
------------

To use the Mailgun transport, you need to install the *@upyo/mailgun* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/mailgun
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/mailgun
~~~~

~~~~ sh [Yarn]
yarn add @upyo/mailgun
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/mailgun
~~~~

~~~~ sh [Bun]
bun add @upyo/mailgun
~~~~

:::


Getting started
---------------

Before using the Mailgun transport, you'll need a Mailgun account and a verified
domain. Mailgun provides API keys and domain settings through their control
panel, which you'll use to configure the transport.

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";
import { createMessage } from "@upyo/core";

const transport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
  region: "us",
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

The Mailgun transport handles authentication automatically using your API key
and sends emails through Mailgun's reliable infrastructure.  The service manages
bounces, spam filtering, and delivery optimization automatically.


Regional configuration
----------------------

Mailgun operates in multiple regions, and you can choose which region to use
based on your location and compliance requirements.  The transport supports both
US and EU regions with automatic endpoint selection:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";

// US region (default)
const usTransport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
  region: "us",
});

// EU region for GDPR compliance
const euTransport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.eu.example.com",
  region: "eu",
});

// Custom endpoint for special configurations
const customTransport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
  baseUrl: "https://api.mailgun.net/v3",
});
~~~~

The region setting determines which Mailgun servers your emails are sent through
and where your data is stored.  EU region is particularly important for
organizations that need to comply with GDPR data residency requirements.


Email tracking and analytics
----------------------------

One of Mailgun's key features is comprehensive email tracking and analytics.
The transport enables tracking by default, but you can customize tracking
behavior based on your needs:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";

const transport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
  tracking: true,
  clickTracking: true,
  openTracking: true,
});
~~~~

With tracking enabled, Mailgun provides detailed analytics about email delivery,
opens, clicks, and bounces through their dashboard and webhooks.
This information is invaluable for improving email campaigns and monitoring
delivery success.


Message tagging and organization
--------------------------------

Mailgun allows you to tag messages for better organization and analytics.
Tags help you categorize emails and track performance across different types
of messages:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";
import { createMessage } from "@upyo/core";

const transport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
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

Tags appear in Mailgun's analytics dashboard, allowing you to track open rates,
click rates, and delivery statistics for specific message categories.
This helps you understand which types of emails perform best with your audience.


Bulk email sending
------------------

For sending newsletters, notifications, or other bulk emails, the Mailgun
transport provides efficient batch processing with automatic retry logic
and error handling:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";
import { createMessage } from "@upyo/core";

const transport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
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
    tags: ["newsletter", "monthly"],
  })
);

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Newsletter sent to ${receipt.messageId}`);
  } else {
    console.error(`Failed to send: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

The `~MailgunTransport.sendMany()` method processes emails sequentially with
built-in retry logic.  Failed emails don't prevent subsequent emails from being
sent, and detailed error information helps you identify and resolve delivery
issues.


Advanced configuration and reliability
--------------------------------------

The Mailgun transport includes comprehensive configuration options for timeout
handling, retry behavior, and SSL validation to ensure reliable email delivery:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";

const transport = new MailgunTransport({
  apiKey: "key-1234567890abcdef1234567890abcdef",
  domain: "mg.example.com",
  region: "us",
  timeout: 15000,
  retries: 5,
  validateSsl: true,
  headers: {
    "X-Custom-Header": "MyApp-v1.0",
    "X-Environment": "production",
  },
  tracking: true,
  clickTracking: false,
  openTracking: true,
});
~~~~

Timeout settings control how long to wait for Mailgun's API responses,
while retry configuration determines how many times to retry failed requests.
The transport uses exponential backoff for retries, reducing load on Mailgun's
servers during temporary outages.


Development and testing
-----------------------

For development and testing, you can use Mailgun's [sandbox domain] or configure
the transport for testing environments.  Mailgun provides sandbox domains that
accept emails but don't deliver them, perfect for development:

~~~~ typescript twoslash
import { MailgunTransport } from "@upyo/mailgun";

// Development configuration with sandbox domain
const devTransport = new MailgunTransport({
  apiKey: "key-test1234567890abcdef1234567890ab",
  domain: "sandbox-abc123.mailgun.org", // Mailgun sandbox domain
  region: "us",
  timeout: 5000, // Shorter timeout for development
});

// Testing configuration with reduced retries
const testTransport = new MailgunTransport({
  apiKey: process.env.MAILGUN_TEST_API_KEY ?? "key-test123",
  domain: process.env.MAILGUN_TEST_DOMAIN ?? "test.example.com",
  retries: 1, // Fewer retries for faster test execution
  timeout: 10000,
  tracking: false, // Disable tracking in tests
});
~~~~

Sandbox domains allow you to test email functionality without sending real
emails, while still receiving confirmation that your integration works
correctly. This is essential for automated testing and development workflows.

> [!CAUTION]
> Mailgun's sandbox domains have strict rate limits (typically 50 emails per
> day) and are intended for basic testing only.  For extensive testing,
> performance testing, or CI/CD pipelines that send many emails, consider
> using a verified domain with appropriate rate limits for your testing needs.

[sandbox domain]: https://documentation.mailgun.com/docs/mailgun/user-manual/domains/#sandbox-domain
