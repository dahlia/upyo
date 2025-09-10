<!-- deno-fmt-ignore-file -->

@upyo/plunk
===========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[Plunk] transport for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/plunk
[JSR badge]: https://jsr.io/badges/@upyo/plunk
[npm]: https://www.npmjs.com/package/@upyo/plunk
[npm badge]: https://img.shields.io/npm/v/@upyo/plunk?logo=npm
[Plunk]: https://www.useplunk.com/
[Upyo]: https://upyo.org/


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/plunk
pnpm add       @upyo/core @upyo/plunk
yarn add       @upyo/core @upyo/plunk
deno add --jsr @upyo/core @upyo/plunk
bun  add       @upyo/core @upyo/plunk
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { PlunkTransport } from "@upyo/plunk";
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

const transport = new PlunkTransport({
  apiKey: process.env.PLUNK_API_KEY!,
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

See the [Plunk docs] for more information about configuration options.

[Plunk docs]: https://docs.useplunk.com/

### Available Options

 -  `apiKey`: Your Plunk API key
 -  `baseUrl`: API base URL (default: `https://api.useplunk.com`)
 -  `timeout`: Request timeout in milliseconds (default: `30000`)
 -  `retries`: Number of retry attempts (default: `3`)
 -  `validateSsl`: Whether to validate SSL certificates (default: `true`)
 -  `headers`: Additional HTTP headers (default: `{}`)

### Self-hosted instances

This transport supports self-hosted Plunk instances. Set the `baseUrl` to your
domain followed by `/api`:

~~~~ typescript
import { PlunkTransport } from "@upyo/plunk";

const transport = new PlunkTransport({
  apiKey: "your-api-key",
  baseUrl: "https://mail.yourcompany.com/api",
});
~~~~
