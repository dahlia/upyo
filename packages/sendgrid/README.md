<!-- deno-fmt-ignore-file -->

@upyo/sendgrid
==============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[SendGrid] transport for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/sendgrid
[JSR badge]: https://jsr.io/badges/@upyo/sendgrid
[npm]: https://www.npmjs.com/package/@upyo/sendgrid
[npm badge]: https://img.shields.io/npm/v/@upyo/sendgrid?logo=npm
[SendGrid]: https://sendgrid.com/
[Upyo]: https://upyo.org/


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/sendgrid
pnpm add       @upyo/core @upyo/sendgrid
yarn add       @upyo/core @upyo/sendgrid
deno add --jsr @upyo/core @upyo/sendgrid
bun  add       @upyo/core @upyo/sendgrid
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SendGridTransport } from "@upyo/sendgrid";
import fs from "node:fs/promises";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
  attachments: [
    new File(
      [await fs.readFile("image.jpg"), "image.jpg", { type: "image/jpeg" }]
    )
  ],
});

const transport = new SendGridTransport({
  apiKey: process.env.SENDGRID_API_KEY!,
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

See the [SendGrid docs] for more information about configuration options.

[SendGrid docs]: https://docs.sendgrid.com/

### Available Options

 -  `apiKey`: Your SendGrid API key (starts with `SG.`)
 -  `baseUrl`: SendGrid API base URL (default: `https://api.sendgrid.com/v3`)
 -  `timeout`: Request timeout in milliseconds (default: 30000)
 -  `retries`: Number of retry attempts (default: 3)
 -  `clickTracking`: Enable click tracking (default: true)
 -  `openTracking`: Enable open tracking (default: true)
 -  `subscriptionTracking`: Enable subscription tracking (default: false)
 -  `googleAnalytics`: Enable Google Analytics tracking (default: false)
