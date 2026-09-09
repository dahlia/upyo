Composing MIME
==============

*This API is available since Upyo 0.6.0.*

`composeMessage()` from *@upyo/mime* turns a structured message into replayable
MIME bytes without opening a transport connection. Use it to save an *.eml*
file, inspect a message before delivery, or supply the same serialized message
to a raw-message transport. It works in Node.js, Deno, Bun, and edge runtimes
with Web Crypto, including Cloudflare Workers without Node.js compatibility.

~~~~ typescript twoslash
import { createMessage, readAttachmentContent } from "@upyo/core";
import { composeMessage } from "@upyo/mime";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.com",
  bcc: "archive@example.com",
  subject: "A copy for your records",
  content: { text: "Hello!", html: "<p>Hello!</p>" },
});
const composed = await composeMessage(message);
const eml = await readAttachmentContent(composed.content);
// Save eml with your runtime's file or object-storage API.
~~~~

The result implements `RawMessage`. Its envelope contains the sender and all
To, Cc, and Bcc recipients; the MIME has no Bcc header. The generated date,
message identifier, and multipart boundaries stay the same on every read.
Typed identity and threading fields follow the same precedence as
[structured messages](./compose.md).

The bytes use CRLF and include the final line ending. They contain neither SMTP
dot-stuffing nor the DATA terminator. Collecting them as shown above uses memory
proportional to the complete message. For large messages, consume the chunks:

~~~~ typescript twoslash
import type { ComposedMessage } from "@upyo/mime";
declare const composed: ComposedMessage;
declare function writeChunk(bytes: Uint8Array): Promise<void>;
// ---cut-before---
for await (const chunk of composed.content()) {
  await writeChunk(chunk);
}
~~~~

Only treat a saved message as complete after iteration finishes successfully.
An attachment failure, cancellation, or replay error can occur after some bytes
have been written.


Sending composed bytes
----------------------

Both [SMTP](../transports/smtp.md) and [JMAP](../transports/jmap.md) accept the
result directly through `sendRaw()`:

~~~~ typescript twoslash
import type { ComposedMessage } from "@upyo/mime";
import type { SmtpTransport } from "@upyo/smtp";
import type { JmapTransport } from "@upyo/jmap";
declare const composed: ComposedMessage;
declare const smtp: SmtpTransport;
declare const jmap: JmapTransport;
// ---cut-before---
await smtp.sendRaw(composed);
// Or, with a JMAP transport:
await jmap.sendRaw(composed);
~~~~

`encoding` is `"7bit"` or `"utf8"`, based on all MIME headers, including nested
parts and DKIM signatures. Internationalized envelope addresses have their own
transport requirements. The result has a factory source and an explicit
encoding, so raw SMTP delivery does not perform a size-analysis pass or announce
a known `SIZE` before DATA. Server size limits still apply while sending. To
request the existing analysis pass, pass `{ ...composed, encoding: undefined }`
to `sendRaw()`, which reads the source an extra time. Alternatively, collect
bytes first and replace `content` with that byte array.

To change delivery addresses without changing the MIME, pass a copy with a new
`envelope`. SMTP transport DKIM settings do not sign raw messages; use the
composition option below. A JMAP server may modify imported MIME during
submission, so its recipients are not guaranteed to receive identical bytes or
an intact original DKIM signature.


Signing and attachment lifetime
-------------------------------

Pass `dkim` to sign during composition. It accepts the same signature settings
as the [SMTP DKIM configuration](../transports/smtp.md#dkim-signing).

~~~~ typescript twoslash
import type { Message } from "@upyo/core";
declare const message: Message;
declare const privateKey: string;
// ---cut-before---
import { composeMessage } from "@upyo/mime";

const composed = await composeMessage(message, {
  dkim: {
    bodyMode: "streaming",
    signatures: [{
      signingDomain: "example.com",
      selector: "mail",
      privateKey,
    }],
  },
});
~~~~

Without signing, composition neither awaits promised attachment bytes nor opens
attachment factories. Each content reader reads the attachments when it reaches
them. Keep byte arrays immutable, and make factories return fresh, independent
readers with identical bytes. Metadata and signing options are copied during
composition; attachment bytes remain caller-owned.

The default DKIM body mode, `"buffered"`, reads the body once before composition
resolves and retains it for subsequent readers. `"streaming"` hashes it once
before resolving, then reads it again for every content reader. Multiple
signatures share those passes. A changed streaming body throws
`MimeAttachmentReplayError`, a `RawMessageValidationError` whose `field` is
`"content"`. Raw transports report it as a nonretryable raw-message validation
failure.

Signing failures throw by default. `onSigningFailure: "send-unsigned"` logs a
warning and continues; signatures completed before a later signing failure
remain on the message. Attachment-read failures and cancellation still throw.


Cancellation
------------

`composeMessage(message, { signal })` uses the signal during preparation and
for every future reader. Calling `composed.content(readerSignal)` additionally
cancels that reader alone. Readers can run concurrently; cancelling one does
not cancel the others. Cancellation preserves the signal's reason.

Stopping a `for await` loop closes the active attachment reader. Factories
should honor their signal during acquisition and reading so they can release
resources promptly. No reader stays open after composition itself finishes,
and the composed result does not need disposal.
