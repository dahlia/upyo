---
description: >-
  JMAP transport guide for sending emails via JMAP protocol (RFC 8620/8621),
  including session discovery, identity resolution, and configuration options.
---

JMAP
====

[JMAP] (JSON Meta Application Protocol) is a modern, efficient protocol for
email access and submission, designed as a replacement for IMAP and SMTP.
It provides a standardized JSON-based API for interacting with mail servers,
with features like efficient synchronization, typed error responses, and
stateless operations. JMAP is defined in [RFC 8620] (core) and [RFC 8621]
(mail) and is increasingly adopted by modern email providers.

Upyo provides a fully compliant JMAP transport through the *@upyo/jmap*
package, supporting session discovery, automatic identity resolution,
configurable retry logic, and comprehensive error handling.

[JMAP]: https://jmap.io/
[RFC 8620]: https://www.rfc-editor.org/rfc/rfc8620
[RFC 8621]: https://www.rfc-editor.org/rfc/rfc8621


Installation
------------

To use the JMAP transport, you need to install the *@upyo/jmap* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/jmap
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/jmap
~~~~

~~~~ sh [Yarn]
yarn add @upyo/jmap
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/jmap
~~~~

~~~~ sh [Bun]
bun add @upyo/jmap
~~~~

:::


Getting started
---------------

Before using the JMAP transport, you'll need access to a JMAP-compatible
mail server and a bearer token for authentication. The JMAP session URL
is typically available at `/.well-known/jmap` on the mail server.

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

const message = createMessage({
  from: "support@example.com",
  to: "customer@example.com",
  subject: "Welcome to our service",
  content: { text: "Thank you for signing up!" },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

The JMAP transport handles session discovery automatically, caching the
session for performance while refreshing it when needed. It automatically
finds the appropriate account with mail capabilities and resolves the
sender identity based on the from address.


Session discovery and caching
-----------------------------

JMAP uses a session resource to discover server capabilities, API endpoints,
and account information. The transport automatically fetches and caches
this session:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  sessionCacheTtl: 600000, // Cache session for 10 minutes
});
~~~~

The session cache TTL (time-to-live) controls how long the session is
cached before being refreshed. The default is 5 minutes (300000ms), which
balances performance with keeping the session reasonably fresh.

If you know your account ID ahead of time, you can specify it directly
to skip the account discovery step:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  accountId: "u1234567", // Specific account ID
});
~~~~


Identity resolution
-------------------

JMAP requires an identity ID for email submission. The transport
automatically resolves the appropriate identity by matching the sender
email address with the identities available on the server:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

// Identity is automatically resolved from the "from" address
const message = createMessage({
  from: "alice@example.com", // Will match identity with this email
  to: "bob@example.net",
  subject: "Meeting tomorrow",
  content: { text: "See you at 10am!" },
});

await transport.send(message);
~~~~

If you want to use a specific identity, you can provide the identity ID
directly in the configuration:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  identityId: "i1234567", // Specific identity ID
});
~~~~


Bulk email sending
------------------

For sending multiple emails, the JMAP transport provides efficient
sequential processing with comprehensive error handling:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  retries: 3,
  timeout: 30000,
});

const subscribers = [
  "user1@example.com",
  "user2@example.com",
  "user3@example.com",
];

const messages = subscribers.map(email =>
  createMessage({
    from: "newsletter@example.com",
    to: email,
    subject: "Weekly Update",
    content: { text: "Here's what's new this week..." },
  })
);

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Email sent: ${receipt.messageId}`);
  } else {
    console.error(`Failed: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~

The `~JmapTransport.sendMany()` method processes emails sequentially,
yielding a receipt for each message. Failed emails don't prevent
subsequent emails from being sent, and the session is efficiently
reused across all messages.


Error handling
--------------

The JMAP transport provides detailed error information through the
`JmapApiError` class and helper functions:

~~~~ typescript twoslash
import { JmapTransport, JmapApiError, isCapabilityError } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Test",
  content: { text: "Hello!" },
});

try {
  const receipt = await transport.send(message);
  if (!receipt.successful) {
    console.error("Send failed:", receipt.errorMessages);
  }
} catch (error) {
  if (error instanceof JmapApiError) {
    console.error("JMAP API error:", error.statusCode, error.responseBody);
    if (error.jmapErrorType) {
      console.error("Error type:", error.jmapErrorType);
    }
  }
  if (isCapabilityError(error)) {
    console.error("Server missing required JMAP capabilities");
  }
}
~~~~


Advanced configuration
----------------------

The JMAP transport includes comprehensive configuration options for
timeout handling, retry behavior, and custom headers:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  timeout: 15000,         // 15 second timeout
  retries: 5,             // Retry failed requests 5 times
  sessionCacheTtl: 60000, // Cache session for 1 minute
  headers: {
    "X-Custom-Header": "MyApp-v1.0",
    "X-Environment": "production",
  },
});
~~~~

The transport uses exponential backoff for retries, with delays of 1s,
2s, 4s, etc. between attempts. Client errors (4xx responses) are not
retried, as they typically indicate a problem with the request itself.


Request cancellation
--------------------

The JMAP transport supports request cancellation using the standard
`AbortSignal` API:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Test",
  content: { text: "Hello!" },
});

const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

const receipt = await transport.send(message, {
  signal: controller.signal,
});

if (!receipt.successful) {
  console.log("Send was cancelled or failed:", receipt.errorMessages);
}
~~~~


Compatible servers
------------------

The JMAP transport works with any JMAP-compliant mail server. Some notable
JMAP implementations include:

[Stalwart Mail Server]
:   Open source JMAP server

[Cyrus IMAP]
:   Supports JMAP alongside IMAP

[Fastmail]
:   Commercial email provider with full JMAP support

[Apache James]
:   Modular mail server with JMAP support

[Stalwart Mail Server]: https://stalw.art/
[Cyrus IMAP]: https://www.cyrusimap.org/
[Fastmail]: https://www.fastmail.com/
[Apache James]: https://james.apache.org/


Limitations
-----------

The current JMAP transport implementation has the following limitations:

 -  *Attachments*: File attachments are not yet supported. This feature
    requires implementing the blob upload API and is planned for a future
    release.
 -  *Inline attachments*: Inline images and other embedded content
    (multipart/related) are not yet supported.

> [!TIP]
> If your use case requires attachments, consider using the SMTP transport
> or one of the HTTP-based transports (SendGrid, Mailgun, SES) which fully
> support attachments.
