<!-- deno-fmt-ignore-file -->

@upyo/smtp
==========

SMTP transport implementation for the Upyo email library.


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
import { SmtpTransport } from "@upyo/smtp";
import { type Message } from "@upyo/core";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "username",
    pass: "password",
  },
});

const message: Message = {
  sender: { name: "John Doe", address: "john@example.com" },
  recipients: [{ name: "Jane Doe", address: "jane@example.com" }],
  ccRecipients: [],
  bccRecipients: [],
  replyRecipients: [],
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
  attachments: [],
  priority: "normal",
  tags: [],
  headers: new Headers(),
};

const receipt = await transport.send(message);
console.log("Email sent:", receipt.successful);
~~~~

### HTML Email with Attachments

~~~~ typescript
const message: Message = {
  sender: { address: "sender@example.com" },
  recipients: [{ address: "recipient@example.com" }],
  ccRecipients: [],
  bccRecipients: [],
  replyRecipients: [],
  subject: "HTML Email with Attachment",
  content: {
    html: "<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>",
    text: "Hello!\nThis is an HTML email.",
  },
  attachments: [
    {
      filename: "document.pdf",
      content: new Uint8Array(pdfBytes),
      contentType: "application/pdf",
      contentId: "doc1",
      inline: false,
    },
  ],
  priority: "high",
  tags: ["newsletter"],
  headers: new Headers([["X-Campaign-ID", "12345"]]),
};

const receipt = await transport.send(message);
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
