---
description: >-
  Learn how to send emails with Maileroo transport, including attachments,
  custom headers, tags, tracking settings, and retry configuration.
---

Maileroo
========

*This transport is introduced in Upyo 0.6.0.*

[Maileroo] is an email delivery provider with a JSON-based Email API for
sending basic, templated, and bulk email. Upyo provides the Maileroo transport
through the *@upyo/maileroo* package. It supports single sends, sequential
`sendMany()`, attachments, custom headers, tags, tracking settings, retry
logic, structured failure receipts, and `AbortSignal` cancellation.

[Maileroo]: https://maileroo.com/


Installation
------------

To use the Maileroo transport, install the *@upyo/maileroo* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/maileroo
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/maileroo
~~~~

~~~~ sh [Yarn]
yarn add @upyo/maileroo
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/maileroo
~~~~

~~~~ sh [Bun]
bun add @upyo/maileroo
~~~~

:::


Getting started
---------------

Before using the Maileroo transport, you need a verified Maileroo sending
domain and a sending key. The key is sent as an `X-API-Key` header.

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
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

The transport converts Upyo messages to Maileroo's JSON format and sends them
through the `/emails` endpoint. HTML and text alternatives, CC, BCC, reply-to,
custom headers, priority, attachments, and inline attachments are handled
automatically.


Tags, headers, and tracking
---------------------------

Maileroo accepts custom tags and headers as maps. Configure default tags and
tracking on the transport when every message sent through it should share the
same settings:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
  tracking: true,
  tags: {
    environment: "production",
    service: "accounts",
  },
});

const headers = new Headers();
headers.set("X-Campaign-ID", "welcome");

const message = createMessage({
  from: "onboarding@example.com",
  to: "newuser@example.com",
  subject: "Welcome to our platform",
  content: {
    html: "<h1>Welcome!</h1><p>Thank you for joining us.</p>",
    text: "Welcome! Thank you for joining us.",
  },
  headers,
  tags: ["welcome"],
});

await transport.send(message);
~~~~

`Message.tags` values are added as generated Maileroo tag keys such as `tag1`
and `tag2`, alongside any default tags configured on the transport.


Sending multiple emails
-----------------------

The `sendMany()` method sends messages sequentially through the single-message
Maileroo endpoint:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
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

Maileroo also has a bulk endpoint, but its subject, body, headers,
attachments, tags, and tracking settings are shared across the whole request.
Upyo uses sequential sends so each `Message` keeps its own subject, content,
attachments, and metadata.


Attachments and inline images
-----------------------------

Attachments are encoded as base64 before being sent to Maileroo. Inline
attachments set Maileroo's `inline` flag so HTML content can reference them
with `cid:` URLs. For inline attachments, Upyo sends the attachment's
`contentId` as Maileroo's attachment name so the `cid:` reference and the
embedded image use the same identifier:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
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


Advanced configuration and reliability
--------------------------------------

The Maileroo transport supports custom API endpoints, request timeouts,
retries, and additional request headers:

~~~~ typescript twoslash
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
  baseUrl: "https://smtp.maileroo.com/api/v2",
  timeout: 15000,
  retries: 5,
  headers: {
    "X-Environment": "production",
  },
});
~~~~

Timeout settings control how long to wait for Maileroo's API responses.
Temporary failures such as rate limits, request timeouts, and server errors
are retried with exponential backoff. Permanent client errors are returned as
failed receipts with provider details so application code can decide whether
to report, retry later, or discard the message.

`AbortSignal` cancellation is supported through the standard Upyo transport
options:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";

const transport = new MailerooTransport({
  apiKey: "your-maileroo-sending-key",
});

const controller = new AbortController();

const message = createMessage({
  from: "alerts@example.com",
  to: "admin@example.com",
  subject: "System alert",
  content: { text: "CPU usage has exceeded 90%." },
});

const receipt = await transport.send(message, {
  signal: controller.signal,
});
~~~~
