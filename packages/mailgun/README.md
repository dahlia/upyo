<!-- deno-fmt-ignore-file -->

@upyo/mailgun
=============

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Mailgun] transport for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/mailgun
[JSR badge]: https://jsr.io/badges/@upyo/mailgun
[npm]: https://www.npmjs.com/package/@upyo/mailgun
[npm badge]: https://img.shields.io/npm/v/@upyo/mailgun?logo=npm
[Mailgun]: https://www.mailgun.com/
[Upyo]: https://upyo.org/


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/mailgun
pnpm add       @upyo/core @upyo/mailgun
yarn add       @upyo/core @upyo/mailgun
deno add --jsr @upyo/core @upyo/mailgun
bun  add       @upyo/core @upyo/mailgun
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { MailgunTransport } from "@upyo/mailgun";
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

const transport = new MailgunTransport({
  apiKey: process.env.MAILGUN_KEY!,
  domain: process.env.MAILGUN_DOMAIN!,
  region: process.env.MAILGUN_REGION as "us" | "eu",
});

const receipt = await transport.send(message);
console.log("Email sent:", receipt.successful);
~~~~


Configuration
-------------

See the [Mailgun docs] for more information about configuration options.

[Mailgun docs]: https://documentation.mailgun.com/

### Available Options

 -  `apiKey`: Your Mailgun API key
 -  `domain`: Your Mailgun domain
 -  `region`: Mailgun region (`us` or `eu`, defaults to `us`)
 -  `timeout`: Request timeout in milliseconds (default: 30000)
 -  `retries`: Number of retry attempts (default: 3)
 -  `tracking`: Enable tracking (default: true)
 -  `clickTracking`: Enable click tracking (default: true)
 -  `openTracking`: Enable open tracking (default: true)
