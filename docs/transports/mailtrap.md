---
description: >-
  Learn how to send emails with Mailtrap transport, including Email API and
  Email Sandbox modes, batch sending, categories, metadata, and attachments.
---

Mailtrap
========

*This transport is introduced in Upyo 0.5.0.*

[Mailtrap] provides both a production Email API and an Email Sandbox for
capturing test messages in a virtual inbox. The HTTP API supports HTML and
text content, attachments, custom headers, categories, and custom variables.

Upyo provides the Mailtrap transport through the *@upyo/mailtrap* package.
It supports single sends, batch sends of up to 500 messages per request,
attachments, retry logic, and `AbortSignal` cancellation.

[Mailtrap]: https://mailtrap.io/


Installation
------------

To use the Mailtrap transport, install the *@upyo/mailtrap* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/mailtrap
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/mailtrap
~~~~

~~~~ sh [Yarn]
yarn add @upyo/mailtrap
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/mailtrap
~~~~

~~~~ sh [Bun]
bun add @upyo/mailtrap
~~~~

:::


Getting started
---------------

Before using the Mailtrap transport, you'll need a Mailtrap API token. The
token is sent to Mailtrap as the `Api-Token` request header.

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailtrapTransport } from "@upyo/mailtrap";

const transport = new MailtrapTransport({
  apiToken: "your-mailtrap-api-token",
  sandbox: true,
  inboxId: 12345,
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

The transport converts Upyo messages to Mailtrap's JSON format and sends
them through the `/api/send` endpoint (or `/api/send/{inboxId}` in sandbox
mode). HTML and text alternatives, CC, BCC, reply-to, custom headers,
priority, attachments, and inline Content-ID attachments are handled
automatically.


Email API and Email Sandbox
---------------------------

Mailtrap uses one API token for both environments. Set `sandbox: true` and
provide an `inboxId` to capture messages in a test inbox instead of sending
through the production Email API:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailtrapTransport } from "@upyo/mailtrap";

const sandboxTransport = new MailtrapTransport({
  apiToken: "your-mailtrap-api-token",
  sandbox: true,
  inboxId: 12345,
});

const productionTransport = new MailtrapTransport({
  apiToken: "your-mailtrap-api-token",
});

const message = createMessage({
  from: "onboarding@example.com",
  to: "newuser@example.com",
  subject: "Welcome",
  content: { text: "Welcome to our platform." },
});
~~~~

`sandbox`
:   When `true`, messages are sent to the Email Sandbox API at
    `sandbox.api.mailtrap.io` and captured in the inbox identified by
    `inboxId`.

`inboxId`
:   Sandbox inbox ID from `mailtrap.io/sandboxes/{id}`. Required when
    `sandbox` is `true`.


Categories, tags, and metadata
------------------------------

Mailtrap uses a `category` field for message classification. Upyo maps the
first tag in `Message.tags` to `category`, or falls back to
`defaultCategory` (default: `transactional`). Additional tags become custom
variables prefixed with `tag_`. Configure transport-level metadata when
every message should carry the same tracking fields:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailtrapTransport } from "@upyo/mailtrap";

const transport = new MailtrapTransport({
  apiToken: "your-mailtrap-api-token",
  defaultCategory: "transactional",
  metadata: {
    environment: "production",
    service: "accounts",
  },
});

const message = createMessage({
  from: "billing@example.com",
  to: "customer@example.com",
  subject: "Your invoice",
  content: { text: "Your invoice is ready." },
  tags: ["billing", "invoice"],
});
~~~~


Batch sending
-------------

Use `sendMany()` to send multiple messages. The transport batches up to 500
messages per API call:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailtrapTransport } from "@upyo/mailtrap";

const transport = new MailtrapTransport({
  apiToken: "your-mailtrap-api-token",
  sandbox: true,
  inboxId: 12345,
});

const messages = [
  createMessage({
    from: "sender@example.com",
    to: "user1@example.com",
    subject: "Hello 1",
    content: { text: "Message 1" },
  }),
  createMessage({
    from: "sender@example.com",
    to: "user2@example.com",
    subject: "Hello 2",
    content: { text: "Message 2" },
  }),
];

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log("Sent:", receipt.messageId);
  } else {
    console.error("Failed:", receipt.errorMessages.join(", "));
  }
}
~~~~


Configuration options
---------------------

`apiToken`
:   Your Mailtrap API token.

`sandbox`
:   Use Email Sandbox instead of Email API. Default: `false`.

`inboxId`
:   Sandbox inbox ID. Required when `sandbox` is `true`.

`sendBaseUrl`
:   Email API base URL. Default: `https://send.api.mailtrap.io`.

`sandboxBaseUrl`
:   Sandbox API base URL. Default: `https://sandbox.api.mailtrap.io`.

`defaultCategory`
:   Default category when a message has no tags. Default: `transactional`.

`metadata`
:   Metadata merged into Mailtrap `custom_variables` for every message.

`userAgent`
:   User-Agent header sent with requests. Default: `@upyo/mailtrap`.

`timeout`
:   Request timeout in milliseconds. Default: `30000`.

`retries`
:   Number of retry attempts for transient failures. Default: `3`.

`headers`
:   Additional HTTP headers to include with every request.
