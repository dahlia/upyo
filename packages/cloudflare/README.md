<!-- deno-fmt-ignore-file -->

@upyo/cloudflare
================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Cloudflare Email Service] transport for the [Upyo] email library.

[JSR badge]: https://jsr.io/badges/@upyo/cloudflare
[JSR]: https://jsr.io/@upyo/cloudflare
[npm badge]: https://img.shields.io/npm/v/@upyo/cloudflare?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/cloudflare
[Cloudflare Email Service]: https://developers.cloudflare.com/email-service/
[Upyo]: https://upyo.org/


Features
--------

 -  Email sending through Cloudflare's Email Sending REST API
 -  Works from any runtime (Node.js, Deno, Bun, edge functions)
 -  HTML and plain text content, attachments, inline images, custom headers
 -  Retries rate-limited (`429`) and server-error (`5xx`) responses with
    backoff
 -  Cloudflare's own reply on every receipt, typed
 -  Type-safe configuration with sensible defaults


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/cloudflare
pnpm add       @upyo/core @upyo/cloudflare
yarn add       @upyo/core @upyo/cloudflare
deno add --jsr @upyo/core @upyo/cloudflare
bun  add       @upyo/core @upyo/cloudflare
~~~~


Usage
-----

The sender's domain must be onboarded to Cloudflare Email Sending first.

~~~~ typescript
import { createMessage } from "@upyo/core";
import { CloudflareTransport } from "@upyo/cloudflare";
import process from "node:process";

const message = createMessage({
  from: "sender@yourdomain.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new CloudflareTransport({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiToken: process.env.CLOUDFLARE_API_TOKEN!,
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~


Configuration
-------------

 -  `accountId`: Your Cloudflare account ID
 -  `apiToken`: A Cloudflare API token with email sending permission
 -  `baseUrl`: API base URL (default: `https://api.cloudflare.com/client/v4`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Retries for `429` and `5xx` responses (default: `3`)
 -  `headers`: Additional HTTP headers


Limitations
-----------

 -  Tags are ignored; the API has no equivalent.
 -  Only the first reply-to address is used.
 -  `messageId` and `date` are ignored; Cloudflare generates `Message-ID` and
    `Date`.  A custom header that Cloudflare controls, or that belongs in a
    message field, is rejected before sending with a
    `CloudflareValidationError`.
 -  At most 50 recipients across `to`, `cc`, and `bcc`; more is rejected
    before sending.
 -  `sendMany()` sends messages one at a time, since there is no batch
    endpoint.
 -  A successful receipt means Cloudflare accepted the message for at least
    one recipient; it does not say which recipients were delivered to, which
    were queued, or which bounced.
