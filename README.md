<!-- deno-fmt-ignore-file -->

<img src="docs/public/logo.svg" width="128" height="128" align="right">

Upyo
====

> [!CAUTION]
> This project is in early development and subject to change without notice.

Upyo is a simple and cross-runtime library for sending email messages using
SMTP and various email providers.  It works on Node.js, Deno, Bun, and edge
functions.

Here's a quick demo of sending an email using the Mailgun transport:

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


Packages
--------

Upyo is a monorepo which contains several packages.  The main package is
*@upyo/core*, which provides the shared types and common interfaces for
sending email messages.  Other packages implement specific transports for
sending messages.  The following is a list of the available packages:

| Package                              | JSR                       | npm                       | Description                                    |
| ------------------------------------ | ------------------------- | ------------------------- | ---------------------------------------------- |
| [@upyo/core](/packages/core/)        | [JSR][jsr:@upyo/core]     | [npm][npm:@upyo/core]     | Shared types and interfaces for email messages |
| [@upyo/smtp](/packages/smtp/)        | [JSR][jsr:@upyo/smtp]     | [npm][npm:@upyo/smtp]     | SMTP transport                                 |
| [@upyo/mailgun](/packages/mailgun)   | [JSR][jsr:@upyo/mailgun]  | [npm][npm:@upyo/mailgun]  | [Mailgun] transport                            |
| [@upyo/sendgrid](/packages/sendgrid) | [JSR][jsr:@upyo/sendgrid] | [npm][npm:@upyo/sendgrid] | [SendGrid] transport                           |

[jsr:@upyo/core]: https://jsr.io/@upyo/core
[npm:@upyo/core]: https://www.npmjs.com/package/@upyo/core
[jsr:@upyo/smtp]: https://jsr.io/@upyo/smtp
[npm:@upyo/smtp]: https://www.npmjs.com/package/@upyo/smtp
[jsr:@upyo/mailgun]: https://jsr.io/@upyo/mailgun
[npm:@upyo/mailgun]: https://www.npmjs.com/package/@upyo/mailgun
[jsr:@upyo/sendgrid]: https://jsr.io/@upyo/sendgrid
[npm:@upyo/sendgrid]: https://www.npmjs.com/package/@upyo/sendgrid
[Mailgun]: https://www.mailgun.com/
[SendGrid]: https://sendgrid.com/


Etymology
---------

The name <q>Upyo</q> is derived from the Korean word <q>郵票</q> (upyo),
which means *postage stamp*.  It reflects the library's purpose of sending
email messages, similar to how a postage stamp is used to send physical mail.
