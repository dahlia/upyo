<!-- deno-fmt-ignore-file -->

@upyo/maileroo
==============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Maileroo] transport for the [Upyo] email library.

[JSR badge]: https://jsr.io/badges/@upyo/maileroo
[JSR]: https://jsr.io/@upyo/maileroo
[npm badge]: https://img.shields.io/npm/v/@upyo/maileroo?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/maileroo
[Maileroo]: https://maileroo.com/
[Upyo]: https://upyo.org/


Features
--------

 -  Single email sending via Maileroo's JSON Email API
 -  Sequential `sendMany()` support through Upyo's transport interface
 -  Cross-runtime compatibility (Node.js, Deno, Bun, edge functions)
 -  Rich content support: HTML emails, attachments, inline images, and custom
    headers
 -  Maileroo tags and tracking settings
 -  Retry logic with exponential backoff
 -  Type-safe configuration with sensible defaults


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/maileroo
pnpm add       @upyo/core @upyo/maileroo
yarn add       @upyo/core @upyo/maileroo
deno add --jsr @upyo/core @upyo/maileroo
bun  add       @upyo/core @upyo/maileroo
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { MailerooTransport } from "@upyo/maileroo";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new MailerooTransport({
  apiKey: process.env.MAILEROO_API_KEY!,
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

See the [Maileroo docs] for more information about configuration options.

[Maileroo docs]: https://maileroo.com/docs/email-api/introduction/

### Available options

 -  `apiKey`: Your Maileroo sending key
 -  `baseUrl`: Maileroo Email API base URL (default:
    `https://smtp.maileroo.com/api/v2`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Number of retry attempts (default: `3`)
 -  `headers`: Additional HTTP request headers
 -  `tracking`: Whether to enable Maileroo open and click tracking
 -  `tags`: Default Maileroo tags for sent messages
