---
description: >-
  Structured LogTape logging for Upyo email delivery, with log-only and
  decorator modes, configurable categories and levels, and privacy controls.
---

LogTape transport
=================

*This transport is introduced in Upyo 0.6.0.*

The LogTape transport records email delivery lifecycle events as structured
[LogTape] logs.  It can be used by itself during local development, where no
message is actually delivered, or as a decorator around another transport.
In decorator mode, the wrapped transport still performs delivery and its
receipts and errors pass through unchanged.

Upyo does not configure LogTape on behalf of the application.  This follows
LogTape's library-first design and leaves sinks, filters, and category levels
under application control.

[LogTape]: https://logtape.org/


Installation
------------

Install *@upyo/logtape* together with LogTape:

::: code-group

~~~~ bash [npm]
npm add @upyo/logtape @logtape/logtape
~~~~

~~~~ bash [pnpm]
pnpm add @upyo/logtape @logtape/logtape
~~~~

~~~~ bash [Yarn]
yarn add @upyo/logtape @logtape/logtape
~~~~

~~~~ bash [Deno]
deno add jsr:@upyo/logtape jsr:@logtape/logtape
~~~~

~~~~ bash [Bun]
bun add @upyo/logtape @logtape/logtape
~~~~

:::


Log-only usage
--------------

With no wrapped transport, `LogTapeTransport` records the send and returns a
synthetic successful receipt.  This is useful for exercising email workflows
without sending real messages:

~~~~ typescript twoslash
import { configure, getConsoleSink } from "@logtape/logtape";
import { createMessage } from "@upyo/core";
import { LogTapeTransport } from "@upyo/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["upyo"], lowestLevel: "debug", sinks: ["console"] },
  ],
});

const transport = new LogTapeTransport();
const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Welcome",
  content: { text: "Welcome to our service." },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log(receipt.messageId); // "logtape-..."
}
~~~~

The default category is `["upyo"]`.  A log-only receipt uses the provider id
`"logtape"` and a generated message id, but it does not imply that an email
was delivered outside the application.


Decorating another transport
----------------------------

Pass another Upyo transport through the `transport` option to add logs around
real delivery:

~~~~ typescript twoslash
import { LogTapeTransport } from "@upyo/logtape";
import { SmtpTransport } from "@upyo/smtp";

const smtp = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "smtp-user@example.com",
    pass: "smtp-password",
  },
});

const transport = new LogTapeTransport({
  transport: smtp,
  category: ["application", "email"],
});
~~~~

The decorator preserves the wrapped provider id, forwards `AbortSignal`, uses
the wrapped `sendMany()` implementation, and passes successful and failed
receipts through unchanged.  Exceptions are logged with the original error
object and then rethrown.  Explicit disposal is also forwarded to disposable
wrapped transports.  Completion logs are emitted as callers consume receipts.
If a caller stops reading a batch early, the wrapped iterator is closed without
being drained so the logging layer does not start additional delivery work.

LogTape transport can be nested with retry, pool, and OpenTelemetry
transports.  The outer decorator observes the complete operation performed by
the inner transport, so choose the order according to which retries or
failovers should appear as one logged operation.


Categories and levels
---------------------

The lifecycle levels can be changed independently:

~~~~ typescript twoslash
import { LogTapeTransport } from "@upyo/logtape";

const transport = new LogTapeTransport({
  category: ["my-app", "outbound-email"],
  levels: {
    sending: "trace",
    sent: "info",
    failed: "fatal",
  },
});
~~~~

`sending`
:   Level for `email.sending` events.  Defaults to `"debug"`.

`sent`
:   Level for `email.sent` events.  Defaults to `"info"`.

`failed`
:   Level for failed receipts and thrown errors.  Defaults to `"error"`.

Every event includes the operation, transport id, recipient counts,
attachment count, and priority.  Completion events additionally include
duration and receipt or error details.


Recording complete messages
---------------------------

Messages are excluded from structured log properties by default.  Set
`recordMessage: true` to add the complete `Message` object to every lifecycle
event:

~~~~ typescript twoslash
import { LogTapeTransport } from "@upyo/logtape";

const transport = new LogTapeTransport({
  recordMessage: true,
});
~~~~

> [!CAUTION]
> Complete messages can contain personal addresses, subjects, email bodies,
> custom headers, and large attachment data.  Enable this option only for
> sinks with suitable access controls and [redaction].

[redaction]: https://logtape.org/manual/redaction
