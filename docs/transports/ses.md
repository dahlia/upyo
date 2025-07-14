---
description: >-
  Amazon SES transport guide with AWS authentication, regional configuration,
  IAM roles, rich message features, bulk sending, and configuration sets.
---

Amazon SES
==========

[Amazon SES] (Simple Email Service) is AWS's reliable, scalable email sending
service designed for high-volume transactional and marketing emails. Built on
Amazon's proven infrastructure, SES provides excellent deliverability rates,
comprehensive analytics, and seamless integration with other AWS services.
The service automatically handles bounce and complaint processing, reputation
monitoring, and compliance with industry standards, making it ideal for
applications that need reliable email delivery at scale.

Upyo provides a comprehensive Amazon SES transport through the *@upyo/ses*
package, offering AWS Signature v4 authentication, zero dependencies for
cross-runtime compatibility, and efficient bulk sending capabilities.

[Amazon SES]: https://aws.amazon.com/ses/


Installation
------------

To use the Amazon SES transport, you need to install the *@upyo/ses* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/ses
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/ses
~~~~

~~~~ sh [Yarn]
yarn add @upyo/ses
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/ses
~~~~

~~~~ sh [Bun]
bun add @upyo/ses
~~~~

:::


Getting started
---------------

Before using the Amazon SES transport, you'll need an AWS account with SES
enabled and appropriate IAM permissions. You can use AWS access keys, session
tokens, or IAM roles for authentication. SES requires verified email addresses
or domains for sending, which you can configure through the AWS Console.

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";
import { createMessage } from "@upyo/core";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
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

The SES transport handles AWS authentication automatically using Signature v4
signing and sends emails through Amazon's reliable infrastructure. The service
provides excellent deliverability and detailed bounce handling.


Authentication methods
----------------------

The Amazon SES transport supports two primary authentication methods, each
designed for different use cases and security requirements. Both methods use
discriminated union types for type safety:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

// AWS access key credentials (for long-term access)
const credentialsTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  },
  region: "us-west-2",
});

// Session tokens (for temporary credentials)
const sessionTransport = new SesTransport({
  authentication: {
    type: "session",
    accessKeyId: "ASIAXYZ...",
    secretAccessKey: "abc123...",
    sessionToken: "FwoGZXIvYXdzE...",
  },
  region: "eu-west-1",
});
~~~~

Session authentication is particularly useful when using temporary credentials
from AWS STS, IAM roles, or federated authentication systems. The transport
automatically handles the inclusion of session tokens in AWS API requests.


IAM roles and external authentication
-------------------------------------

For applications running on AWS infrastructure or requiring IAM role-based
access, you can use external tools to assume roles and provide the resulting
temporary credentials to the transport:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

// First, assume the role externally (e.g., using AWS CLI or SDK):
// aws sts assume-role --role-arn "arn:aws:iam::123456789012:role/SesRole" --role-session-name "ses-session"

const transport = new SesTransport({
  authentication: {
    type: "session",
    accessKeyId: "ASIAXYZ...",      // From AssumeRole response
    secretAccessKey: "abc123...",   // From AssumeRole response
    sessionToken: "FwoGZXIv...",    // From AssumeRole response
  },
  region: "eu-west-1",
});
~~~~

This approach gives you full control over role assumption logic, credential
refresh, and session management while keeping the transport focused on email
delivery. You can implement custom credential providers that automatically
refresh temporary credentials as needed.

> [!TIP]
> While the SES transport currently requires external role assumption, direct
> IAM role support may be added in future versions. This would enable automatic
> credential refresh and simplified configuration for applications running on
> AWS infrastructure. The current external approach maintains the transport's
> zero-dependency design while ensuring maximum flexibility and compatibility
> across different deployment environments.


Regional configuration
----------------------

Amazon SES operates in multiple AWS regions, and you should choose the region
closest to your application or based on compliance requirements. The transport
automatically constructs the correct SES endpoints for your chosen region:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

// US East (N. Virginia) - Default region
const usEastTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
});

// EU (Ireland) for GDPR compliance
const euTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "eu-west-1",
});

// Asia Pacific (Sydney)
const apacTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "ap-southeast-2",
});
~~~~

Choose your region based on latency requirements, data residency regulations,
and SES feature availability. Some SES features may not be available in all
regions, so consult the AWS documentation for your specific needs.


Rich message features
---------------------

The SES transport supports all major email features including HTML content,
attachments, tags, and priority settings. These features integrate seamlessly
with SES's tracking and analytics capabilities:

~~~~ typescript twoslash
// @noErrors: 2322
import { SesTransport } from "@upyo/ses";
import { createMessage } from "@upyo/core";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
  defaultTags: {
    environment: "production",
    application: "user-notifications",
  },
});

const message = createMessage({
  from: { address: "support@example.com", name: "Support Team" },
  to: [
    { address: "customer@example.com", name: "John Customer" },
    "backup@example.com",
  ],
  cc: "manager@example.com",
  replyTo: "noreply@example.com",
  subject: "Your Monthly Report",
  content: {
    html: "<h1>Monthly Report</h1><p>Please find your report attached.</p>",
    text: "Monthly Report\n\nPlease find your report attached.",
  },
  attachments: [
    new File(
      [await fetch("https://example.com/report.pdf").then(r => r.arrayBuffer())],
      "monthly-report.pdf",
      { type: "application/pdf" }
    ),
  ],
  tags: ["report", "monthly", "automated"],
  priority: "high",
});

const receipt = await transport.send(message);
~~~~

Tags are particularly powerful in SES as they enable detailed tracking and
analytics through CloudWatch metrics. You can set default tags at the transport
level and additional tags per message for comprehensive categorization.


Bulk email sending
------------------

For sending newsletters, notifications, or other bulk emails, the SES transport
provides efficient batch processing that respects SES rate limits and handles
errors gracefully:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";
import { createMessage } from "@upyo/core";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
  batchSize: 25, // Process 25 messages concurrently
  retries: 3,
});

const subscribers = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
  // ... potentially thousands more
];

const messages = subscribers.map(email =>
  createMessage({
    from: "newsletter@example.com",
    to: email,
    subject: "Weekly Newsletter - December 2024",
    content: {
      html: "<h2>This Week's Updates</h2><p>Here's what's new...</p>",
      text: "This Week's Updates\n\nHere's what's new...",
    },
    tags: ["newsletter", "weekly"],
  })
);

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Newsletter sent: ${receipt.messageId}`);
  } else {
    console.error(`Failed to send: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

The `~SesTransport.sendMany()` method processes messages concurrently using
individual `SendEmail` API calls rather than SES's `SendBulkEmail` API.
This approach provides maximum flexibility for different message content
while still achieving excellent throughput through concurrent processing.


Configuration sets and tracking
-------------------------------

Amazon SES provides configuration sets for advanced tracking, reputation
monitoring, and event publishing. You can specify a configuration set
to enable detailed analytics and webhook notifications:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
  configurationSetName: "my-production-config-set",
  defaultTags: {
    source: "upyo-transport",
    version: "1.0",
  },
});
~~~~

Configuration sets enable features like:
- Event publishing to CloudWatch, Kinesis, or SNS
- Reputation tracking and automatic bounce handling
- IP pool management for dedicated sending
- Click and open tracking integration
- Suppression list management

Consult the [SES Configuration Sets documentation] for detailed setup
instructions and available features.

[SES Configuration Sets documentation]: https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html


Advanced configuration and reliability
--------------------------------------

The SES transport includes comprehensive configuration options for timeout
handling, retry behavior, SSL validation, and custom headers to ensure
reliable email delivery in production environments:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

const transport = new SesTransport({
  authentication: {
    type: "session",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN!,
  },
  region: "us-east-1",
  timeout: 15000,
  retries: 5,
  validateSsl: true,
  headers: {
    "X-Application": "MyApp-v2.1",
    "X-Environment": "production",
  },
  configurationSetName: "production-emails",
  defaultTags: {
    service: "notifications",
    environment: "prod",
  },
  batchSize: 30,
});
~~~~

Timeout settings control how long to wait for SES API responses, while retry
configuration determines how many times to retry failed requests. The transport
uses exponential backoff for retries, reducing load on SES during temporary
issues and improving overall reliability.


Development and testing
-----------------------

For development and testing, you can configure the SES transport for testing
environments. SES provides a sandbox mode for new accounts that restricts
sending to verified email addresses, perfect for development workflows:

~~~~ typescript twoslash
import { SesTransport } from "@upyo/ses";

// Development configuration with sandbox restrictions
const devTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
  timeout: 5000, // Shorter timeout for development
  retries: 1, // Fewer retries for faster feedback
  batchSize: 5, // Smaller batches for testing
  defaultTags: {
    environment: "development",
  },
});

// Testing configuration with environment variables
const testTransport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.SES_TEST_ACCESS_KEY_ID ?? "test-key",
    secretAccessKey: process.env.SES_TEST_SECRET_ACCESS_KEY ?? "test-secret",
  },
  region: process.env.SES_TEST_REGION ?? "us-east-1",
  timeout: 10000,
  retries: 1, // Fewer retries for faster test execution
  validateSsl: false, // For testing with local endpoints
});
~~~~

> [!TIP]
> When starting with Amazon SES, your account begins in sandbox mode, which
> restricts sending to verified email addresses and domains. This is perfect
> for development and testing as it prevents accidental email sends to real
> users. To send to unverified addresses in production, you'll need to request
> production access through the AWS Console.

> [!CAUTION]
> SES sandbox mode has strict sending limits (typically 200 emails per 24-hour
> period and 1 email per second). For extensive testing, performance testing,
> or CI/CD pipelines that send many emails, consider requesting production
> access or using alternative testing approaches like mock transports for
> unit tests.
