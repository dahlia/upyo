<!-- deno-fmt-ignore-file -->

@upyo/core
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Core types and interfaces for [Upyo], a cross-runtime email library that
provides a unified, type-safe API for sending emails across Node.js, Deno, Bun,
and edge functions.

The *@upyo/core* package provides the foundational types and interfaces that all
Upyo transport implementations use.  It defines the common `Message`, `Address`,
`Transport`, and `Receipt` types that enable seamless switching between
different email providers while maintaining consistent type safety and
error handling.

[JSR badge]: https://jsr.io/badges/@upyo/core
[JSR]: https://jsr.io/@upyo/core
[npm badge]: https://img.shields.io/npm/v/@upyo/core?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/core
[Upyo]: https://upyo.org/


Features
--------

 -  *Universal types*: Common interfaces for all email transports
 -  *Type-safe messaging*: Comprehensive TypeScript definitions for email
    messages
 -  *Attachment support*: File attachment handling
 -  *Cross-runtime compatibility*: Works on Node.js, Deno, Bun,
    and edge functions
 -  *Zero dependencies*: Lightweight with no external dependencies


Installation
------------

~~~~ sh
npm  add     @upyo/core
pnpm add     @upyo/core
yarn add     @upyo/core
deno add jsr:@upyo/core
bun  add     @upyo/core
~~~~


Usage
-----

### Creating messages

The `createMessage()` function provides a convenient way to create email
messages:

~~~~ typescript
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "sender@example.com",
  to: ["recipient@example.net", "another@example.org"],
  cc: "copy@example.com",
  subject: "Hello from Upyo!",
  content: {
    text: "This is a plain text message.",
    html: "<p>This is an <strong>HTML</strong> message.</p>",
  },
  priority: "high",
});
~~~~

### Adding attachments

Attachments can be added using the standard [`File`] API:

~~~~ typescript
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Document attached",
  content: { text: "Please find the document attached." },
  attachments: [
    new File(
      [await fetch("document.pdf").then(r => r.arrayBuffer())],
      "document.pdf",
      { type: "application/pdf" }
    ),
  ],
});
~~~~

[`File`]: https://developer.mozilla.org/en-US/docs/Web/API/File

### Handling receipts

All transport operations return `Receipt` objects that use discriminated unions
for type-safe error handling:

~~~~ typescript
import type { Receipt } from "@upyo/core";

function handleReceipt(receipt: Receipt) {
  if (receipt.successful) {
    console.log("Message sent with ID:", receipt.messageId);
  } else {
    console.error("Send failed:", receipt.errorMessages.join(", "));
    console.error("Retryable:", receipt.retryable ?? false);

    for (const error of receipt.errors ?? []) {
      console.error(error.category, error.code, error.provider);
    }
  }
}
~~~~

Failed receipts keep the legacy `errorMessages` array and can also carry
structured `errors` for programmatic handling.  Transports use categories such
as `auth`, `rate-limit`, `network`, `timeout`, `validation`, `rejected`,
`server-error`, `service-unavailable`, `configuration`, and `unknown`.

When implementing a transport, use `createFailedReceipt()` to keep these fields
consistent:

~~~~ typescript
import { createFailedReceipt } from "@upyo/core";

const receipt = createFailedReceipt("HTTP 429: Too Many Requests", {
  provider: "example",
  statusCode: 429,
  retryAfterMilliseconds: 30_000,
});
~~~~

### Implementing custom transports

The `Transport` interface defines the contract for all email providers:

~~~~ typescript
import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";

class MyCustomTransport implements Transport<"example"> {
  readonly id = "example";

  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"example">> {
    // Implementation details...
    return { successful: true, messageId: "12345", provider: this.id };
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"example">> {
    for await (const message of messages) {
      yield await this.send(message, options);
    }
  }
}
~~~~


Related packages
----------------

The `@upyo/core` package is the foundation for all Upyo transport
implementations:

| Package             | JSR                            | npm                            | Description                                       |
| ------------------- | ------------------------------ | ------------------------------ | ------------------------------------------------- |
| @upyo/smtp          | [JSR][jsr:@upyo/smtp]          | [npm][npm:@upyo/smtp]          | SMTP transport for any mail server                |
| @upyo/mailgun       | [JSR][jsr:@upyo/mailgun]       | [npm][npm:@upyo/mailgun]       | [Mailgun] HTTP API transport                      |
| @upyo/sendgrid      | [JSR][jsr:@upyo/sendgrid]      | [npm][npm:@upyo/sendgrid]      | [SendGrid] HTTP API transport                     |
| @upyo/ses           | [JSR][jsr:@upyo/ses]           | [npm][npm:@upyo/ses]           | [Amazon SES] HTTP API transport                   |
| @upyo/mock          | [JSR][jsr:@upyo/mock]          | [npm][npm:@upyo/mock]          | Mock transport for testing                        |
| @upyo/opentelemetry | [JSR][jsr:@upyo/opentelemetry] | [npm][npm:@upyo/opentelemetry] | [OpenTelemetry] observability for Upyo transports |

[jsr:@upyo/smtp]: https://jsr.io/@upyo/smtp
[npm:@upyo/smtp]: https://www.npmjs.com/package/@upyo/smtp
[jsr:@upyo/mailgun]: https://jsr.io/@upyo/mailgun
[npm:@upyo/mailgun]: https://www.npmjs.com/package/@upyo/mailgun
[Mailgun]: https://www.mailgun.com/
[jsr:@upyo/sendgrid]: https://jsr.io/@upyo/sendgrid
[npm:@upyo/sendgrid]: https://www.npmjs.com/package/@upyo/sendgrid
[SendGrid]: https://sendgrid.com/
[jsr:@upyo/ses]: https://jsr.io/@upyo/ses
[npm:@upyo/ses]: https://www.npmjs.com/package/@upyo/ses
[Amazon SES]: https://aws.amazon.com/ses/
[jsr:@upyo/mock]: https://jsr.io/@upyo/mock
[npm:@upyo/mock]: https://www.npmjs.com/package/@upyo/mock
[jsr:@upyo/opentelemetry]: https://jsr.io/@upyo/opentelemetry
[npm:@upyo/opentelemetry]: https://www.npmjs.com/package/@upyo/opentelemetry
[OpenTelemetry]: https://opentelemetry.io/


Documentation
-------------

For comprehensive documentation, examples, and guides, visit
*<https://upyo.org/>*.

API reference documentation is available on JSR: *<https://jsr.io/@upyo/core>*.
