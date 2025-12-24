<!-- deno-fmt-ignore-file -->

@upyo/jmap
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

[JMAP] transport for the [Upyo] email library.  Implements [RFC 8620] (core)
and [RFC 8621] (mail) for sending emails via JMAP protocol.

[JSR]: https://jsr.io/@upyo/jmap
[JSR badge]: https://jsr.io/badges/@upyo/jmap
[npm]: https://www.npmjs.com/package/@upyo/jmap
[npm badge]: https://img.shields.io/npm/v/@upyo/jmap?logo=npm
[JMAP]: https://jmap.io/
[RFC 8620]: https://www.rfc-editor.org/rfc/rfc8620
[RFC 8621]: https://www.rfc-editor.org/rfc/rfc8621
[Upyo]: https://upyo.org/


Features
--------

 -  RFC 8620 (JMAP Core) and RFC 8621 (JMAP Mail) compliant
 -  Bearer token authentication
 -  Automatic session discovery and caching
 -  Automatic identity resolution from sender email
 -  Exponential backoff retry with configurable attempts
 -  Request timeout support
 -  AbortSignal support for cancellation


TODO
----

 -  [ ] Attachment support (blob upload)
 -  [ ] Inline attachments (multipart/related)


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

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `sessionUrl` | `string` | JMAP session URL (e.g., `https://server/.well-known/jmap`) |
| `bearerToken` | `string` | Bearer token for authentication |

### Optional Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `accountId` | `string` | Auto-detected | JMAP account ID (defaults to first account with mail capability) |
| `identityId` | `string` | Auto-resolved | Identity ID for sending (defaults to identity matching sender email) |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `retries` | `number` | `3` | Number of retry attempts for failed requests |
| `sessionCacheTtl` | `number` | `300000` | Session cache TTL in milliseconds (5 minutes) |
| `headers` | `Record<string, string>` | `{}` | Additional HTTP headers to include in requests |


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
