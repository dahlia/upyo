<!-- deno-fmt-ignore-file -->

@upyo/lettermint
================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Lettermint] transport for the [Upyo] email library.

[JSR badge]: https://jsr.io/badges/@upyo/lettermint
[JSR]: https://jsr.io/@upyo/lettermint
[npm badge]: https://img.shields.io/npm/v/@upyo/lettermint?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/lettermint
[Lettermint]: https://lettermint.co/
[Upyo]: https://upyo.org/


Features
--------

 -  Single and batch email sending via Lettermint's HTTP API
 -  Idempotency key support through `Message.idempotencyKey`
 -  Cross-runtime compatibility (Node.js, Deno, Bun, edge functions)
 -  Rich content support: HTML emails, attachments, inline images, and custom
    headers
 -  Lettermint route, tag, metadata, and tracking settings
 -  Retry logic with exponential backoff
 -  Type-safe configuration with sensible defaults


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/lettermint
pnpm add       @upyo/core @upyo/lettermint
yarn add       @upyo/core @upyo/lettermint
deno add --jsr @upyo/core @upyo/lettermint
bun  add       @upyo/core @upyo/lettermint
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { LettermintTransport } from "@upyo/lettermint";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
  idempotencyKey: "welcome-recipient-example-net",
});

const transport = new LettermintTransport({
  apiToken: process.env.LETTERMINT_API_TOKEN!,
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

### Sending multiple emails

~~~~ typescript
const messages = [message1, message2, message3];

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Email sent with ID: ${receipt.messageId}`);
  } else {
    console.error(`Email failed: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~


Configuration
-------------

See the [Lettermint docs] for more information about configuration options.

[Lettermint docs]: https://docs.lettermint.co/

### Available options

 -  `apiToken`: Your Lettermint project sending API token
 -  `baseUrl`: Lettermint API base URL (default:
    `https://api.lettermint.co`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Number of retry attempts (default: `3`)
 -  `headers`: Additional HTTP headers
 -  `route`: Lettermint route for sent messages
 -  `tag`: Default Lettermint tag when a message has no `Message.tags`
 -  `metadata`: Metadata to track with sent messages
 -  `settings`: Lettermint tracking settings (`trackOpens`, `trackClicks`)
