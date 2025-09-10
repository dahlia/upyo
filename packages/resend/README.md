<!-- deno-fmt-ignore-file -->

@upyo/resend
============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Resend] transport for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/resend
[JSR badge]: https://jsr.io/badges/@upyo/resend
[npm]: https://www.npmjs.com/package/@upyo/resend
[npm badge]: https://img.shields.io/npm/v/@upyo/resend?logo=npm
[Resend]: https://resend.com/
[Upyo]: https://upyo.org/


Features
--------

 -  Single and batch email sending via Resend's HTTP API
 -  Automatic idempotency for reliable delivery
 -  Smart batch optimization: uses batch API when possible
 -  Cross-runtime compatibility (Node.js, Deno, Bun, edge functions)
 -  Rich content support: HTML emails, attachments, custom headers
 -  Retry logic with exponential backoff
 -  Type-safe configuration with sensible defaults
 -  Comprehensive error handling


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/resend
pnpm add       @upyo/core @upyo/resend
yarn add       @upyo/core @upyo/resend
deno add --jsr @upyo/core @upyo/resend
bun  add       @upyo/core @upyo/resend
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { ResendTransport } from "@upyo/resend";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new ResendTransport({
  apiKey: process.env.RESEND_API_KEY!,
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

### Sending Multiple Emails

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

See the [Resend docs] for more information about configuration options.

[Resend docs]: https://resend.com/docs

### Available Options

 -  `apiKey`: Your Resend API key
 -  `baseUrl`: Resend API base URL (default: `https://api.resend.com`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Number of retry attempts (default: `3`)
 -  `validateSsl`: Whether to validate SSL certificates (default: `true`)
 -  `headers`: Additional HTTP headers
