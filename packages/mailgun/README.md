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
import { MailgunTransport } from '@upyo/mailgun';

const transport = new MailgunTransport({
  apiKey: 'your-api-key',
  domain: 'your-domain.com'
});

const message = {
  sender: { address: 'sender@example.com' },
  recipients: [{ address: 'recipient@example.com' }],
  subject: 'Hello from Mailgun!',
  content: { text: 'Hello, World!' }
};

const receipt = await transport.send(message);
console.log('Message sent:', receipt.messageId);
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
