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

Complete messages are excluded from logs by default.  Set `recordMessage` to
`"properties"` to add the complete `Message` object to each lifecycle event
while keeping its log message on one line:

~~~~ typescript
const transport = new LogTapeTransport({
  recordMessage: "properties",
});
~~~~

For local development, `"inline"` also renders the subject and body beneath
the lifecycle message:

~~~~ typescript
const transport = new LogTapeTransport({
  recordMessage: "inline",
});
~~~~

Inline logs use the plain-text body when it is defined, including an empty
string, and otherwise use the HTML body.  Subject and body values remain
LogTape placeholders so sinks can apply their own rendering and redaction.
Both modes expose the complete message, which may contain addresses, bodies,
headers, and attachment data.  Use them only when the configured sinks,
access controls, and redaction rules can safely handle that data.
