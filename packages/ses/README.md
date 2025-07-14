<!-- deno-fmt-ignore-file -->

@upyo/ses
=========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Amazon SES] transport for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/ses
[JSR badge]: https://jsr.io/badges/@upyo/ses
[npm]: https://www.npmjs.com/package/@upyo/ses
[npm badge]: https://img.shields.io/npm/v/@upyo/ses?logo=npm
[Amazon SES]: https://aws.amazon.com/ses/
[Upyo]: https://upyo.org/


Features
--------

 -  **Multiple Authentication Methods**: Support for AWS credentials and session
    tokens
 -  **Zero Dependencies**: Uses built-in APIs for cross-runtime compatibility
 -  **AWS Signature v4**: Full implementation of AWS authentication protocol
 -  **Rich Message Support**: HTML, text, attachments, tags, and priority
    handling
 -  **Cross-Runtime**: Works on Node.js, Deno, Bun, and edge functions
 -  **Type Safety**: Discriminated union types for mutually exclusive
    authentication methods


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/ses
pnpm add       @upyo/core @upyo/ses
yarn add       @upyo/core @upyo/ses
deno add --jsr @upyo/core @upyo/ses
bun  add       @upyo/core @upyo/ses
~~~~


Usage
-----

### Basic Usage with AWS Credentials

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SesTransport } from "@upyo/ses";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  region: "us-east-1",
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email sent via Amazon SES." },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

### Using Session Token (Temporary Credentials)

~~~~ typescript
import { SesTransport } from "@upyo/ses";

const transport = new SesTransport({
  authentication: {
    type: "session",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN!,
  },
  region: "us-west-2",
});
~~~~

### Using IAM Roles

For IAM role-based authentication, perform the AssumeRole operation externally
(e.g., using AWS CLI or SDK) and use the resulting temporary credentials with
the `session` authentication type:

~~~~ typescript
import { SesTransport } from "@upyo/ses";

// First, assume the role externally:
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

### HTML Email with Attachments

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SesTransport } from "@upyo/ses";
import fs from "node:fs/promises";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const message = createMessage({
  from: { address: "sender@example.com", name: "John Sender" },
  to: [
    { address: "recipient1@example.net", name: "Jane Doe" },
    "recipient2@example.net",
  ],
  cc: "manager@example.com",
  replyTo: "support@example.com",
  subject: "Monthly Report",
  content: {
    html: "<h1>Monthly Report</h1><p>Please find the report attached.</p>",
    text: "Monthly Report\n\nPlease find the report attached.",
  },
  attachments: [
    new File(
      [await fs.readFile("report.pdf")],
      "report.pdf",
      { type: "application/pdf" }
    ),
  ],
  tags: ["report", "monthly"],
  priority: "high",
});

const receipt = await transport.send(message);
~~~~

### Bulk Sending

~~~~ typescript
import { SesTransport } from "@upyo/ses";

const transport = new SesTransport({
  authentication: {
    type: "credentials",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const messages = [
  createMessage({ /* message 1 */ }),
  createMessage({ /* message 2 */ }),
  createMessage({ /* message 3 */ }),
];

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log("Sent:", receipt.messageId);
  } else {
    console.error("Failed:", receipt.errorMessages);
  }
}
~~~~


Configuration
-------------

| Option                 | Type                     | Default       | Description                                                     |
| ---------------------- | ------------------------ | ------------- | --------------------------------------------------------------- |
| `authentication`       | `SesAuthentication`      | Required      | Authentication configuration (credentials or session)           |
| `region`               | `string`                 | `"us-east-1"` | AWS region for SES API endpoints                                |
| `timeout`              | `number`                 | `30000`       | HTTP request timeout in milliseconds                            |
| `retries`              | `number`                 | `3`           | Number of retry attempts for failed requests                    |
| `validateSsl`          | `boolean`                | `true`        | Whether to validate SSL certificates                            |
| `headers`              | `Record<string, string>` | `{}`          | Additional HTTP headers to include                              |
| `configurationSetName` | `string`                 | `undefined`   | SES configuration set name for tracking                         |
| `defaultTags`          | `Record<string, string>` | `{}`          | Default tags to apply to all messages                           |
| `batchSize`            | `number`                 | `50`          | Maximum number of messages to send concurrently in `sendMany()` |

### Authentication Types

The `authentication` field accepts one of two mutually exclusive types:

#### Credentials Authentication
~~~~ typescript
{
  type: "credentials",
  accessKeyId: string,
  secretAccessKey: string,
}
~~~~

#### Session Token Authentication
~~~~ typescript
{
  type: "session",
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string,
}
~~~~

> [!NOTE]
> For IAM role-based authentication, use external tools to perform AssumeRole
> and provide the resulting temporary credentials via the `session`
> authentication type.


Error Handling
--------------

The transport returns a `Receipt` object that uses a discriminated union for
type-safe error handling:

~~~~ typescript
const receipt = await transport.send(message);

if (receipt.successful) {
  // Type is { successful: true; messageId: string }
  console.log("Message ID:", receipt.messageId);
} else {
  // Type is { successful: false; errorMessages: readonly string[] }
  console.error("Errors:", receipt.errorMessages);
}
~~~~

Common SES errors include:

 -  `InvalidParameterValue`: Invalid email addresses or configuration
 -  `LimitExceededException`: Send rate or quota limits exceeded
 -  `AccountSuspendedException`: SES account suspended
 -  `ConfigurationSetDoesNotExistException`: Invalid configuration set name
