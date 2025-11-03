---
description: >-
  Complete guide to using Upyo's SMTP transport for universal email delivery,
  including connection pooling, TLS security, authentication methods, and bulk sending.
---

SMTP
====

SMTP (Simple Mail Transfer Protocol) is the standard protocol for sending emails
across networks, as defined in [RFC 5321].  Most email providers offer SMTP
servers alongside their proprietary APIs, making SMTP a universal fallback
option when specific transports aren't available for your email provider.
The SMTP protocol provides reliable, widely-supported email delivery with
features like authentication, encryption, and delivery confirmation.

Upyo provides a comprehensive SMTP transport through the *@upyo/smtp* package,
offering connection pooling, TLS support, multiple authentication methods,
and efficient bulk sending capabilities.

> [!CAUTION]
> The SMTP transport currently does not support edge functions or web browsers.
> If you need to use Upyo in these environments, consider using other transports
> like [Mailgun](./mailgun.md) or similar services that provide HTTP APIs.

[RFC 5321]: https://datatracker.ietf.org/doc/html/rfc5321


Installation
------------

To use the SMTP transport, you need to install the *@upyo/smtp* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/smtp
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/smtp
~~~~

~~~~ sh [Yarn]
yarn add @upyo/smtp
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/smtp
~~~~

~~~~ sh [Bun]
bun add @upyo/smtp
~~~~

:::


Basic usage
-----------

The SMTP transport requires connection details for your SMTP server,
including the hostname, port, and authentication credentials.
Most email providers offer SMTP access through their settings or
developer documentation.

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";
import { createMessage } from "@upyo/core";

// Create transport with basic configuration
const transport = new SmtpTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "your-email@gmail.com",
    pass: "your-app-password",
  },
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Hello from Upyo SMTP",
  content: { text: "This email was sent using the SMTP transport." },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}

// Clean up connections when done
await transport.closeAllConnections();
~~~~

The transport automatically handles connection management, protocol negotiation,
and message formatting. When you're finished sending emails, it's important to
close connections to free up resources.


Automatic resource management
-----------------------------

Modern JavaScript environments support automatic resource cleanup using
the [`await using`] statement, which automatically closes SMTP connections
when the transport goes out of scope:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";
import { createMessage } from "@upyo/core";

await using transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "username",
    pass: "password",
  },
});

const message = createMessage({
  from: "system@example.com",
  to: "user@example.com",
  subject: "System Notification",
  content: { text: "Your backup completed successfully." },
});

await transport.send(message);
// Connections are automatically closed when transport goes out of scope
~~~~

This approach eliminates the need to manually call
`~SmtpTransport.closeAllConnections()` and ensures proper cleanup
even if errors occur.

[`await using`]: https://github.com/tc39/proposal-async-explicit-resource-management#await-using-declarations


Connection configuration
------------------------

The SMTP transport offers extensive configuration options to work with different
email providers and security requirements.  Connection settings control
timeouts, pooling, and protocol behavior:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "mail.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "user@example.com",
    pass: "secure-password",
    method: "plain",
  },
  connectionTimeout: 30000,
  socketTimeout: 60000,
  localName: "mail.mycompany.com",
  pool: true,
  poolSize: 10,
});
~~~~

The `~SmtpConfig.host` and `~SmtpConfig.port` specify your SMTP server details,
while `~SmtpConfig.secure` determines whether to use TLS encryption.
Connection and socket timeouts prevent hanging connections,
and the `~SmtpConfig.localName` identifies your server during
the SMTP handshake.  Connection pooling improves performance by reusing
connections across multiple messages.


Authentication methods
----------------------

The SMTP transport supports multiple authentication mechanisms commonly used by
email providers.  The most widely supported method is PLAIN authentication,
which works with virtually all SMTP servers:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

// PLAIN authentication (most common)
const gmailTransport = new SmtpTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "your-email@gmail.com",
    pass: "your-app-password",
    method: "plain",
  },
});

// LOGIN authentication for older servers
const outlookTransport = new SmtpTransport({
  host: "smtp-mail.outlook.com",
  port: 587,
  secure: false,
  auth: {
    user: "your-email@outlook.com",
    pass: "your-password",
    method: "login",
  },
});
~~~~

When using services like Gmail, you'll need to generate an app-specific password
rather than using your regular account password.  The transport automatically
detects server capabilities and chooses the appropriate authentication method
if you don't specify one.


TLS and security configuration
------------------------------

Security is crucial for email transmission, and the SMTP transport provides
comprehensive TLS configuration options.  You can control encryption,
certificate validation, and TLS protocol versions:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "secure-smtp.example.com",
  port: 465,
  secure: true,
  auth: {
    user: "secure@example.com",
    pass: "password",
  },
  tls: {
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    ca: ["-----BEGIN CERTIFICATE-----\n..."],
  },
});
~~~~

Setting `secure: true` establishes a TLS connection from the start,
while `rejectUnauthorized: true` ensures certificate validation.
You can specify custom certificate authorities, client certificates,
and acceptable TLS versions based on your security requirements.

### STARTTLS support

The SMTP transport automatically supports STARTTLS, which allows upgrading
a plain connection to an encrypted TLS connection.  When `secure` is set to
`false` and the server advertises STARTTLS capability, the transport will
automatically upgrade the connection before authentication:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

// STARTTLS will be used automatically with port 587
const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,  // Standard submission port with STARTTLS
  secure: false,  // Start with plain connection
  auth: {
    user: "user@example.com",
    pass: "password",
  },
});
~~~~

This configuration is commonly used with port 587 (mail submission port)
and is required by many modern email providers including Protonmail, Office 365,
and others that enforce encryption via STARTTLS.  The transport follows
[RFC 3207] for STARTTLS negotiation and automatically re-negotiates
capabilities after the connection is upgraded.

> [!TIP]
> Use `secure: false` with port 587 for STARTTLS, or `secure: true` with
> port 465 for direct TLS connections.  The transport will handle the
> encryption appropriately in both cases.

[RFC 3207]: https://datatracker.ietf.org/doc/html/rfc3207


Bulk email sending
------------------

For sending multiple emails efficiently, the SMTP transport provides
a `~SmtpTransport.sendMany()` method that reuses connections and handles errors
gracefully.  This approach is much more efficient than
calling `~SmtpTransport.send()` multiple times:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";
import { createMessage } from "@upyo/core";

await using transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "bulk@example.com",
    pass: "password",
  },
  poolSize: 5,
});

const messages = [
  createMessage({
    from: "newsletter@example.com",
    to: "subscriber1@example.com",
    subject: "Weekly Newsletter #1",
    content: { text: "Welcome to our newsletter!" },
  }),
  createMessage({
    from: "newsletter@example.com",
    to: "subscriber2@example.com",
    subject: "Weekly Newsletter #2",
    content: { text: "Thank you for subscribing!" },
  }),
];

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Message ${receipt.messageId} sent successfully`);
  } else {
    console.error(`Failed to send message: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

The `~SmtpTransport.sendMany()` method processes messages sequentially,
providing individual receipts for each message.  Connection pooling ensures
efficient resource usage, and failed messages don't prevent subsequent messages
from being sent.


Development and testing
-----------------------

For local development and testing, you can use development SMTP servers or
configure the transport for testing environments.  The package supports various
testing scenarios including mock servers:

~~~~ typescript twoslash
import { SmtpTransport } from "@upyo/smtp";

// Local development with Mailpit (popular SMTP testing tool)
const devTransport = new SmtpTransport({
  host: "localhost",
  port: 1025,
  secure: false,
  // No authentication needed for local testing
});

// Testing configuration with relaxed security
const testTransport = new SmtpTransport({
  host: "test-smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "test@example.com",
    pass: "test-password",
  },
  tls: {
    rejectUnauthorized: false, // For self-signed certificates in test environments
  },
  connectionTimeout: 5000, // Shorter timeouts for faster test feedback
});
~~~~

> [!TIP]
>  [Mailpit] is an excellent development SMTP server that provides a modern
> web interface for testing email functionality.  It acts as an SMTP server
> that accepts all emails but doesn't deliver them, instead storing them
> locally for inspection.  Mailpit offers features like HTML and plain text
> email viewing, attachment downloads, search functionality, and even webhook
> testing for email events.
>
> You can install Mailpit as a standalone binary, run it via Docker,
> or use package managers like Homebrew.  The default configuration listens on
> port 1025 for SMTP and provides a web UI on port 8025, making it perfect for
> local development workflows where you need to verify email content and
> formatting without sending real emails.

[Mailpit]: https://mailpit.axllent.org/
