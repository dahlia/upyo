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

 -  `CloudflareTransport` sends through Cloudflare's Email Sending REST API
    from any runtime (Node.js, Deno, Bun, edge functions)
 -  `CloudflareWorkerTransport` sends through a `send_email` binding on
    Cloudflare Workers, with no API token
 -  HTML and plain text content, attachments, inline images, custom headers
 -  Retries rate limits and server errors with backoff
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

### On Cloudflare Workers

Declare a `send_email` binding in *wrangler.jsonc*:

~~~~ jsonc
{ "send_email": [{ "name": "EMAIL" }] }
~~~~

Then send through it:

~~~~ typescript
import { CloudflareWorkerTransport } from "@upyo/cloudflare";

const transport = new CloudflareWorkerTransport({ binding: env.EMAIL });
const receipt = await transport.send(message);
~~~~


Configuration
-------------

`CloudflareTransport`:

 -  `accountId`: Your Cloudflare account ID
 -  `apiToken`: A Cloudflare API token with email sending permission
 -  `baseUrl`: API base URL (default: `https://api.cloudflare.com/client/v4`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Retries for `429` and `5xx` responses (default: `3`); waits
    1 second, doubling up to 10 seconds, unless Cloudflare sends
    `Retry-After`
 -  `headers`: Additional HTTP headers

`CloudflareWorkerTransport`:

 -  `binding`: The `send_email` binding, such as `env.EMAIL`
 -  `retries`: Retries for `E_RATE_LIMIT_EXCEEDED` and
    `E_INTERNAL_SERVER_ERROR` (default: `3`); waits 1 second, doubling up to
    10 seconds

A retried server error may send a message twice; set `retries` to `0` if
that is worse than a failed send.


Checks before sending
---------------------

Both transports reject these messages before sending, with a validation
receipt that says what is wrong:

 -  A custom header that Cloudflare generates, such as `Message-ID`, `Date`,
    `DKIM-Signature`, or `ARC-*` (`cloudflare.header_not_allowed`) [headers]
 -  A custom header that belongs in a message field: `From`, `To`, `Cc`,
    `Bcc`, `Subject`, or `Reply-To` (`cloudflare.header_use_api_field`)
    [headers]
 -  More than 50 recipients across `to`, `cc`, and `bcc`
    (`cloudflare.too_many_recipients`) [limits]

Everything else, such as Cloudflare's header allowlist, its header and message
size limits, and the number of attachments, is left to Cloudflare, which may
change its rules.

[headers]: https://developers.cloudflare.com/email-service/reference/headers/
[limits]: https://developers.cloudflare.com/email-service/platform/limits/


Limitations
-----------

 -  Tags are ignored; the API has no equivalent [REST API].
 -  Only the first reply-to address is used; both APIs take a single one
    [REST API] [Workers API].
 -  `messageId` and `date` are ignored; Cloudflare generates `Message-ID` and
    `Date` [headers].
 -  `sendMany()` sends messages one at a time, since there is no batch
    endpoint [REST API] [Workers API].
 -  A successful receipt means Cloudflare accepted the message; it does not
    say which recipients were delivered to, which were queued, or which
    bounced.

See the [documentation] for the details.

[REST API]: https://developers.cloudflare.com/api/resources/email_sending/methods/send/
[Workers API]: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
[documentation]: https://upyo.org/transports/cloudflare
