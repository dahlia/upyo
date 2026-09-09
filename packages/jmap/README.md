<!-- deno-fmt-ignore-file -->

@upyo/jmap
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[JMAP] transport for the [Upyo] email library.  Implements [RFC 8620] (core)
and [RFC 8621] (mail) for sending emails via JMAP protocol.

[JSR badge]: https://jsr.io/badges/@upyo/jmap
[JSR]: https://jsr.io/@upyo/jmap
[npm badge]: https://img.shields.io/npm/v/@upyo/jmap?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/jmap
[JMAP]: https://jmap.io/
[Upyo]: https://upyo.org/
[RFC 8620]: https://www.rfc-editor.org/rfc/rfc8620
[RFC 8621]: https://www.rfc-editor.org/rfc/rfc8621


Features
--------

 -  RFC 8620 (JMAP Core) and RFC 8621 (JMAP Mail) compliant
 -  Bearer token authentication
 -  Automatic session discovery and caching
 -  Automatic identity resolution from sender email
 -  File attachment support (blob upload)
 -  Inline attachment support (multipart/related)
 -  Exponential backoff retry with configurable attempts
 -  Request timeout support
 -  AbortSignal support for cancellation


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/jmap
pnpm add       @upyo/core @upyo/jmap
yarn add       @upyo/core @upyo/jmap
deno add --jsr @upyo/core @upyo/jmap
bun  add       @upyo/core @upyo/jmap
~~~~


Usage
-----

~~~~ typescript
import { createMessage } from "@upyo/core";
import { JmapTransport } from "@upyo/jmap";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new JmapTransport({
  sessionUrl: process.env.JMAP_SESSION_URL!,
  bearerToken: process.env.JMAP_BEARER_TOKEN!,
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

### Authentication Options

Either `bearerToken` or `basicAuth` must be provided:

| Option        | Type                                     | Description                                                |
| ------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `sessionUrl`  | `string`                                 | JMAP session URL (e.g., `https://server/.well-known/jmap`) |
| `bearerToken` | `string`                                 | Bearer token for authentication                            |
| `basicAuth`   | `{ username: string, password: string }` | Basic authentication credentials                           |

### Optional Options

| Option            | Type                     | Default       | Description                                                                         |
| ----------------- | ------------------------ | ------------- | ----------------------------------------------------------------------------------- |
| `accountId`       | `string`                 | Auto-detected | JMAP account ID (defaults to first account with mail capability)                    |
| `identityId`      | `string`                 | Auto-resolved | Identity ID for sending (defaults to identity matching sender email)                |
| `timeout`         | `number`                 | `30000`       | Request timeout in milliseconds                                                     |
| `retries`         | `number`                 | `3`           | Number of retry attempts for failed requests                                        |
| `sessionCacheTtl` | `number`                 | `300000`      | Session cache TTL in milliseconds (5 minutes)                                       |
| `headers`         | `Record<string, string>` | `{}`          | Additional HTTP headers to include in requests                                      |
| `baseUrl`         | `string`                 | -             | Base URL for rewriting session URLs (useful when server returns internal hostnames) |


Error Handling
--------------

The transport returns a `Receipt` discriminated union:

~~~~ typescript
const receipt = await transport.send(message);

if (receipt.successful) {
  // Success: receipt.messageId contains the submission ID
  console.log("Sent:", receipt.messageId);
} else {
  // Failure: receipt.errorMessages contains error details
  console.error("Failed:", receipt.errorMessages);
}
~~~~

You can also catch specific JMAP errors:

~~~~ typescript
import { JmapApiError, isCapabilityError } from "@upyo/jmap";

try {
  const receipt = await transport.send(message);
} catch (error) {
  if (error instanceof JmapApiError) {
    console.error("JMAP error:", error.statusCode, error.responseBody);
  }
  if (isCapabilityError(error)) {
    console.error("Server missing required capabilities");
  }
}
~~~~


Sending raw MIME
----------------

*This feature is introduced in Upyo 0.6.0.*

`JmapTransport` implements the optional `RawTransport` interface. It uploads
serialized MIME, imports the uploaded blob into Drafts, and submits that Email
with an explicit delivery envelope:

~~~~ typescript
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
