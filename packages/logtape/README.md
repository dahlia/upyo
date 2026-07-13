<!-- deno-fmt-ignore-file -->

@upyo/logtape
=============

*@upyo/logtape* records Upyo email delivery lifecycle events through
[LogTape].  It can act as a log-only transport during local development or
decorate another transport while preserving its delivery behavior.

[LogTape]: https://logtape.org/


Installation
------------

~~~~ bash
deno add jsr:@upyo/logtape jsr:@logtape/logtape
pnpm add @upyo/logtape @logtape/logtape
~~~~


Usage
-----

Configure LogTape in your application, then create a log-only transport:

~~~~ typescript
import { configure, getConsoleSink } from "@logtape/logtape";
import { LogTapeTransport } from "@upyo/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["upyo"], lowestLevel: "debug", sinks: ["console"] },
  ],
});

const transport = new LogTapeTransport();
const receipt = await transport.send(message);
~~~~

To deliver messages through another transport, pass it in the options object:

~~~~ typescript
const transport = new LogTapeTransport({
  transport: smtpTransport,
  category: ["application", "email"],
  levels: {
    sending: "debug",
    sent: "info",
    failed: "error",
  },
});
~~~~

Complete messages are excluded from structured logs by default.  Set
`recordMessage: true` only when the configured sinks and redaction rules can
safely handle addresses, bodies, headers, and attachment data.
