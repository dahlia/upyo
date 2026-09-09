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
mail server and authentication credentials. The JMAP session URL
is typically available at `/.well-known/jmap` on the mail server.

### Bearer token authentication

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});
~~~~

### Basic authentication

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  basicAuth: {
    username: "user@example.com",
    password: "your-password",
  },
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
batch processing that combines all messages into a single HTTP request:

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

The `~JmapTransport.sendMany()` method batches all emails into a single
JMAP request, significantly reducing HTTP round-trips. Each message
gets its own receipt, and partial failures are handled gracefully—if
some emails fail, others in the batch can still succeed.


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

### URL rewriting

Some JMAP servers may return internal hostnames in session URLs that are
not accessible from the client. The `baseUrl` option allows you to rewrite
these URLs:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
  // Rewrite URLs returned by the server to use this base URL
  baseUrl: "https://mail.example.com",
});
~~~~

This is useful when connecting to containerized servers or when the server
returns hostnames that differ from the external access URL.


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


Attachments
-----------

The JMAP transport supports file attachments via blob upload. Attachments
are uploaded to the server before being referenced in the email:

~~~~ typescript twoslash
// @noErrors: 2322
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Document attached",
  content: { text: "Please find the document attached." },
  attachments: [
    new File(
      [await fetch("https://example.com/doc.pdf").then(r => r.arrayBuffer())],
      "document.pdf",
      { type: "application/pdf" }
    ),
  ],
});

await transport.send(message);
~~~~

### Inline attachments

For inline images in HTML emails, use the `inline` property and reference
the attachment via `cid:` URL in the HTML content:

~~~~ typescript twoslash
// @noErrors: 2322
import { JmapTransport } from "@upyo/jmap";
import { createMessage } from "@upyo/core";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Email with inline image",
  content: {
    html: '<p>Here is an image:</p><img src="cid:logo">',
  },
  attachments: [
    {
      filename: "logo.png",
      content: await fetch("https://example.com/logo.png").then(r => r.arrayBuffer()),
      contentType: "image/png",
      contentId: "logo",
      inline: true,
    },
  ],
});

await transport.send(message);
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


Sending raw MIME
----------------

Use [MIME composition](../messages/mime.md) to create raw bytes from an Upyo
message without opening a transport connection.

`JmapTransport` implements the optional `RawTransport` interface. It uploads
serialized MIME, imports the uploaded blob into Drafts, and submits that Email
with an explicit delivery envelope:

~~~~ typescript twoslash
import { JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-token",
});
const receipt = await transport.sendRaw({
  envelope: { from: "sender@example.com", to: ["recipient@example.net"] },
  content: new TextEncoder().encode(
    "From: sender@example.com\r\nSubject: Hello\r\n\r\nHello!\r\n"
  ),
  encoding: "7bit",
});
~~~~

Content accepts bytes, promised bytes, Blob, or replayable attachment-style
factories. Declaring `encoding` reads the source once per successful send;
omitting it adds an analysis pass before upload. Every reader must reproduce
the same bytes. `7bit` requires ASCII, `8bit` asserts ASCII MIME headers with an
8-bit body, and `utf8` permits internationalized headers. Automatic analysis
conservatively selects `utf8` for any non-ASCII byte. With `8bit`, the caller
must ensure nested MIME headers are ASCII; Upyo checks only top-level headers.
Use `utf8` or omit `encoding` if unsure. No transcoding occurs.

Sources must have CRLF line endings including the final CRLF, nonempty headers,
no NUL, and no line longer than 998 bytes excluding CRLF. Uploads stream without
collecting the message in memory. Progress refreshes the inactivity timeout;
cancellation stops source reads and requests source cleanup. Response parsing
also remains subject to timeout. Pass an `AbortSignal` through `signal` in the
second argument to `sendRaw()`.

The envelope is independent of MIME headers. A configured `identityId` takes
precedence; otherwise Upyo selects the identity matching the envelope sender,
or falls back to the first available identity. A null sender also uses that
fallback. The server may reject the chosen identity, envelope, or null sender.

Upyo does not compose or repair the uploaded bytes. JMAP servers may repair
imported MIME and modify messages during submission; RFC 8621 requires removal
of Bcc during submission. Raw JMAP delivery therefore does not guarantee that
an existing signature or byte-for-byte representation reaches the recipient.

Import and submission are each attempted once. `jmap.raw_import_failed` with
`retryable: true` means no submission was issued, although an imported Email
may remain after a lost response. A definite server rejection is non-retryable.
`jmap.raw_submission_unknown` means submission may have succeeded: inspect the
server state before attempting another send. It is marked non-retryable to
avoid duplicate delivery. Cancellation cannot recall a submitted message.

An `alreadyExists` import result is reused only when the existing Email refers
to the exact uploaded blob; matching Message-ID alone is insufficient. Upyo
leaves imported Emails in Drafts and does not delete them after success or
failure. The server expires unreferenced uploaded blobs according to its policy.

See [RFC 8620] for uploads and request errors, and [RFC 8621] for import and
submission behavior.


Verifying the configuration
---------------------------

`~JmapTransport.verify()` checks live JMAP settings without creating or sending
an email. It fetches a fresh Session, checks the required capabilities and a
writable account, and reads the drafts mailbox and available identities.
A configured `identityId` is checked against the server as well.

~~~~ typescript twoslash
import { JmapApiError, JmapTransport } from "@upyo/jmap";

const transport = new JmapTransport({
  sessionUrl: "https://mail.example.com/.well-known/jmap",
  bearerToken: "your-bearer-token",
});

try {
  await transport.verify({ signal: AbortSignal.timeout(10_000) });
} catch (error) {
  if (error instanceof JmapApiError) {
    console.error(error.message, error.statusCode, error.jmapErrorType);
  } else {
    throw error;
  }
}
~~~~

Verification rejects with `~JmapApiError` on failure, including malformed
responses and timeouts. Cancellation preserves the caller's abort reason.
It does not return a delivery receipt. Existing HTTP error details remain
available on the error.

With no `accountId`, verification uses the first mail-capable account, as
`send()` does. It fails if that account lacks submission capability or is
read-only. Set `accountId` explicitly in a multi-account session. The default
account selection for `sendRaw()` can differ.

Each Session fetch, `Mailbox/get`, and `Identity/get` operation has `timeout`
as its total budget, including reading the response body and any retries.
This can stop an operation before all configured retries have run. The three
operations run sequentially; an abort signal can bound the entire verification.
Verification neither reads nor updates the transport's Session cache.

Only Session discovery and read-only JMAP methods are used. No blobs, drafts,
or submissions are created. Success does not guarantee a mailbox's write
permissions, acceptance of a particular sender or message, or eventual
delivery. See the
[optional verification capability](./custom.md#verifying-transport-configuration)
for use with a generic transport.
