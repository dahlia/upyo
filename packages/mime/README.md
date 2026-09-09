@upyo/mime
==========

Portable MIME composition and DKIM signing for [Upyo]. Compose a structured
message without a transport connection, then save its bytes or pass it to
`sendRaw()` on an SMTP or JMAP transport.

~~~~ typescript
import { createMessage, readAttachmentContent } from "@upyo/core";
import { composeMessage } from "@upyo/mime";

const composed = await composeMessage(createMessage({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Hello",
  content: { text: "Hello!" },
}));
const eml = await readAttachmentContent(composed.content);
~~~~

See the [MIME composition guide] for streaming, signing, cancellation, and
attachment lifetime. Runtime code uses web APIs and works without Node.js
compatibility in edge environments.

[Upyo]: https://upyo.org/
[MIME composition guide]: https://upyo.org/messages/mime
