<!-- deno-fmt-ignore-file -->

@upyo/mailtrap
=============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Mailtrap] transport for the [Upyo] email library.

[JSR badge]: https://jsr.io/badges/@upyo/mailtrap
[JSR]: https://jsr.io/@upyo/mailtrap
[npm badge]: https://img.shields.io/npm/v/@upyo/mailtrap?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/mailtrap
[Mailtrap]: https://mailtrap.io/
[Upyo]: https://upyo.org/


Features
--------

 -  Single and batch email sending via Mailtrap's HTTP API
 -  Email API (production) and Email Sandbox (test inbox) support
 -  Cross-runtime compatibility (Node.js, Deno, Bun, edge functions)
 -  Rich content support: HTML emails, attachments, inline images, and custom
    headers
 -  Category, custom variables, and config-level metadata
 -  Retry logic with exponential backoff
 -  Type-safe configuration with sensible defaults


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/mailtrap
pnpm add       @upyo/core @upyo/mailtrap
yarn add       @upyo/core @upyo/mailtrap
deno add --jsr @upyo/core @upyo/mailtrap
bun  add       @upyo/core @upyo/mailtrap
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { MailtrapTransport } from "@upyo/mailtrap";
import process from "node:process";

const transport = new MailtrapTransport({
  apiToken: process.env.MAILTRAP_API_TOKEN!,
  sandbox: process.env.MAILTRAP_SANDBOX === "true",
  inboxId: process.env.MAILTRAP_INBOX_ID,
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
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

See the [Mailtrap docs] for more information about API tokens and sandboxes.

[Mailtrap docs]: https://docs.mailtrap.io/

### Available options

 -  `apiToken`: Your Mailtrap API token
 -  `sandbox`: Use Email Sandbox instead of Email API (default: `false`)
 -  `inboxId`: Sandbox inbox ID (required when `sandbox` is `true`)
 -  `sendBaseUrl`: Email API base URL (default: `https://send.api.mailtrap.io`)
 -  `sandboxBaseUrl`: Sandbox API base URL (default:
    `https://sandbox.api.mailtrap.io`)
 -  `defaultCategory`: Default category when a message has no tags (default:
    `transactional`)
 -  `metadata`: Metadata to track with sent messages
 -  `userAgent`: User-Agent header (default: `@upyo/mailtrap`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Number of retry attempts (default: `3`)
 -  `headers`: Additional HTTP headers
