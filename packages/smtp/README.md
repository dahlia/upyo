<!-- deno-fmt-ignore-file -->

@upyo/smtp
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

SMTP transport implementation for the [Upyo] email library.

[JSR]: https://jsr.io/@upyo/smtp
[JSR badge]: https://jsr.io/badges/@upyo/smtp
[npm]: https://www.npmjs.com/package/@upyo/smtp
[npm badge]: https://img.shields.io/npm/v/@upyo/smtp?logo=npm
[Upyo]: https://upyo.org/


Features
--------

 -  Full SMTP protocol implementation
 -  TLS/SSL support
 -  Connection pooling
 -  Multiple authentication methods
 -  HTML and plain text email support
 -  File attachments (regular and inline)
 -  Multiple recipients (To, CC, BCC)
 -  Custom headers
 -  Priority levels
 -  Comprehensive testing utilities
 -  TypeScript support
 -  Cross-runtime compatibility (Node.js, Bun, Deno)


TODO
----

- [ ] STARTTLS support (currently only supports direct TLS)


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/smtp
pnpm add       @upyo/core @upyo/smtp
yarn add       @upyo/core @upyo/smtp
deno add --jsr @upyo/core @upyo/smtp
bun  add       @upyo/core @upyo/smtp
~~~~


Usage
-----

### Basic Email Sending

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "username",
    pass: "password",
  },
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const receipt = await transport.send(message);
console.log("Email sent:", receipt.successful);
~~~~

### Sending Multiple Emails

~~~~ typescript
const messages = [message1, message2, message3];

for await (const receipt of transport.sendMany(messages)) {
  console.log(`Email ${receipt.messageId}: ${receipt.successful ? "sent" : "failed"}`);
}
~~~~


Configuration options
---------------------

### `SmtpConfig`

| Option              | Type             | Default       | Description                      |
|---------------------|------------------|---------------|----------------------------------|
| `host`              | `string`         |               | SMTP server hostname             |
| `port`              | `number`         | `587`         | SMTP server port                 |
| `secure`            | `boolean`        | `true`        | Use TLS/SSL connection           |
| `auth`              | `SmtpAuth`       |               | Authentication configuration     |
| `tls`               | `SmtpTlsOptions` |               | TLS configuration                |
| `connectionTimeout` | `number`         | `60000`       | Connection timeout (ms)          |
| `socketTimeout`     | `number`         | `60000`       | Socket timeout (ms)              |
| `localName`         | `string`         | `"localhost"` | Local hostname for `HELO`/`EHLO` |
| `pool`              | `boolean`        | `true`        | Enable connection pooling        |
| `poolSize`          | `number`         | `5`           | Maximum pool connections         |

### `SmtpAuth`

| Option   | Type                               | Default   | Description |
|----------|------------------------------------|-----------|-------------|
| `user`   | `string`                           |           | Username    |
| `pass`   | `string`                           |           | Password    |
| `method` | `"plain" \| "login" \| "cram-md5"` | `"plain"` | Auth method |


Testing
-------

### Mock SMTP Server

For unit testing, use the included mock SMTP server:

~~~~ typescript
import { MockSmtpServer, SmtpTransport } from "@upyo/smtp";

const server = new MockSmtpServer();
const port = await server.start();

const transport = new SmtpTransport({
  host: "localhost",
  port,
  secure: false,
  auth: { user: "test", pass: "test" },
});

// Send test email
await transport.send(message);

// Check received messages
const received = server.getReceivedMessages();
console.log(received[0].data); // Raw email content

await server.stop();
~~~~
