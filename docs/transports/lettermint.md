---
description: >-
  Learn how to send emails with Lettermint transport, including batch sending,
  idempotency, routes, metadata, tracking settings, and inline attachments.
---

Lettermint
==========

*This transport is introduced in Upyo 0.5.0.*

[Lettermint] is a transactional email provider with a straightforward HTTP
API for sending emails. It supports common email fields such as recipients,
HTML and text content, reply-to addresses, custom headers, attachments, and
inline images, plus provider-specific features such as routes, tags, metadata,
tracking settings, and idempotency keys.

Upyo provides the Lettermint transport through the *@upyo/lettermint* package.
It supports single sends, batch sends of up to 500 messages per request,
attachments, idempotency, retry logic, and `AbortSignal` cancellation.

[Lettermint]: https://lettermint.co/


Installation
------------

To use the Lettermint transport, install the *@upyo/lettermint* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/lettermint
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/lettermint
~~~~

~~~~ sh [Yarn]
yarn add @upyo/lettermint
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/lettermint
~~~~

~~~~ sh [Bun]
bun add @upyo/lettermint
~~~~

:::


Getting started
---------------

Before using the Lettermint transport, you'll need a Lettermint project and a
sending API token. The token is sent to Lettermint as the
`x-lettermint-token` request header.

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";

const transport = new LettermintTransport({
  apiToken: "lm_project_1234567890abcdef",
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

The transport converts Upyo messages to Lettermint's JSON format and sends
them through the `/v1/send` endpoint. HTML and text alternatives, CC, BCC,
reply-to, custom headers, priority, attachments, and inline Content-ID
attachments are handled automatically.


Routes, tags, metadata, and tracking
------------------------------------

Lettermint supports provider-specific fields for categorizing and routing
messages. Configure defaults on the transport when every message sent through
that transport should share the same route, metadata, or tracking settings:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";

const transport = new LettermintTransport({
  apiToken: "lm_project_1234567890abcdef",
  route: "transactional",
  tag: "welcome",
  metadata: {
    environment: "production",
    service: "accounts",
  },
  settings: {
    trackOpens: false,
    trackClicks: true,
  },
});

const message = createMessage({
  from: "onboarding@example.com",
  to: "newuser@example.com",
  subject: "Welcome to our platform",
  content: {
    html: "<h1>Welcome!</h1><p>Thank you for joining us.</p>",
    text: "Welcome! Thank you for joining us.",
  },
});

await transport.send(message);
~~~~

Lettermint accepts one tag per message. If a message has exactly one
`Message.tags` value, that tag overrides the transport's default `tag`. If it
has more than one tag, the transport returns a failed receipt instead of
sending the message.


Batch sending
-------------

The `sendMany()` method uses Lettermint's batch endpoint and automatically
splits large inputs into chunks of 500 messages:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";

const transport = new LettermintTransport({
  apiToken: "lm_project_1234567890abcdef",
});

const recipients = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
];

const messages = recipients.map(email =>
  createMessage({
    from: "updates@example.com",
    to: email,
    subject: "Monthly update",
    content: {
      html: "<h2>This month's updates</h2><p>Here's what's new.</p>",
      text: "This month's updates\n\nHere's what's new.",
    },
  })
);

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Email sent with ID: ${receipt.messageId}`);
  } else {
    console.error(`Failed to send: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

For batch sends, messages without `idempotencyKey` values are grouped into
Lettermint batch requests with generated request idempotency keys. If any
message has an `idempotencyKey`, `sendMany()` sends that chunk through the
single-message API instead so each message's key is preserved.


Idempotency and reliability
---------------------------

Lettermint supports the `Idempotency-Key` HTTP header to prevent duplicate
sends during retries. Upyo maps `Message.idempotencyKey` to that header:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";

const transport = new LettermintTransport({
  apiToken: "lm_project_1234567890abcdef",
  retries: 3,
  timeout: 30000,
});

const message = createMessage({
  from: "alerts@example.com",
  to: "admin@example.com",
  subject: "System alert",
  content: { text: "CPU usage has exceeded 90%." },
  priority: "high",
  idempotencyKey: "alert-cpu-2026-05-17T10:00Z",
});

await transport.send(message);
~~~~

The transport retries temporary failures with exponential backoff. Client
errors from Lettermint are returned as failed receipts without retrying, and
`AbortSignal` cancellation is supported through Upyo's standard transport
options.


Attachments and inline images
-----------------------------

Attachments are encoded as base64 before being sent to Lettermint. Inline
attachments include their `content_id` so HTML content can reference them with
`cid:` URLs:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";

const transport = new LettermintTransport({
  apiToken: "lm_project_1234567890abcdef",
});

const logo = new TextEncoder().encode("fake image bytes");

const message = createMessage({
  from: "brand@example.com",
  to: "customer@example.com",
  subject: "Welcome",
  content: {
    html: '<h1>Welcome</h1><img src="cid:logo" alt="Logo">',
    text: "Welcome",
  },
  attachments: [{
    filename: "logo.png",
    content: logo,
    contentType: "image/png",
    inline: true,
    contentId: "logo",
  }],
});

await transport.send(message);
~~~~
