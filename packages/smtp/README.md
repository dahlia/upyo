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
 -  STARTTLS support for secure connection upgrade
 -  DKIM signing support (RSA-SHA256 and Ed25519-SHA256)


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
| `dkim`              | `DkimConfig`     |               | DKIM signing configuration       |

### `SmtpAuth`

| Option   | Type                               | Default   | Description |
|----------|------------------------------------|-----------|-------------|
| `user`   | `string`                           |           | Username    |
| `pass`   | `string`                           |           | Password    |
| `method` | `"plain" \| "login" \| "cram-md5"` | `"plain"` | Auth method |


DKIM signing
------------

DKIM (DomainKeys Identified Mail) signing is supported for improved email
deliverability and authentication:

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { readFileSync } from "node:fs";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: { user: "user@example.com", pass: "password" },
  dkim: {
    signatures: [{
      signingDomain: "example.com",
      selector: "mail",
      privateKey: readFileSync("./dkim-private.pem", "utf8"),
    }],
  },
});
~~~~

### `DkimConfig`

| Option             | Type                           | Default   | Description                           |
|--------------------|--------------------------------|-----------|---------------------------------------|
| `signatures`       | `DkimSignature[]`              |           | Array of DKIM signature configs       |
| `onSigningFailure` | `"throw" \| "send-unsigned"`   | `"throw"` | Action when signing fails             |

### `DkimSignature`

| Option             | Type                               | Default             | Description                             |
|--------------------|------------------------------------|---------------------|-----------------------------------------|
| `signingDomain`    | `string`                           |                     | Domain for DKIM key (d= tag)            |
| `selector`         | `string`                           |                     | DKIM selector (s= tag)                  |
| `privateKey`       | `string \| CryptoKey`              |                     | Private key (PEM string or `CryptoKey`) |
| `algorithm`        | `"rsa-sha256" \| "ed25519-sha256"` | `"rsa-sha256"`      | Signing algorithm                       |
| `canonicalization` | `string`                           | `"relaxed/relaxed"` | Header/body canonicalization            |
| `headerFields`     | `string[]`                         | From, To, ...       | Headers to sign                         |


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
