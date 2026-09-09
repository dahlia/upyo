---
description: >-
  Learn how to create email messages with Upyo's createMessage() function,
  including multiple recipients, rich content, priority settings, and custom headers.
---

Composing messages
==================

Creating email messages in Upyo is straightforward and flexible. The library
provides the `createMessage()` function from the *@upyo/core* package,
which accepts various input formats and automatically handles validation
and type conversion for you.

To serialize a message without sending it, use the
[MIME composition API](./mime.md).


Basic message creation
----------------------

To create a simple email message, you need to provide at minimum a sender
address, recipient address, subject, and content. The `createMessage()` function
accepts these in a convenient object format:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});
~~~~

The function automatically converts string email addresses to proper `Address`
objects and validates the input.  You can provide email addresses as simple
strings like `"user@example.com"` or with display names using the format
`"Name <user@server.com>"` like `"John Doe <john@example.com>"`.
You can also provide `Address` objects directly if you prefer to work with
the structured format.


Multiple recipients
-------------------

When you need to send an email to multiple recipients, you can provide arrays
for the `to`, `cc`, and `bcc` fields.  Each field accepts either a single
address or an array of addresses, and you can mix different formats including
plain email addresses, display name formats, and `Address` objects:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "Support Team <support@example.com>",
  to: ["recipient1@example.com", "John Smith <john@example.com>"],
  cc: { name: "Manager", address: "manager@example.com" },
  bcc: ["archive@example.com", "backup@example.com"],
  subject: "Team Update",
  content: { text: "Here's the latest team update." },
});
~~~~

You can also specify a custom reply-to address using the `replyTo` field,
which is useful when you want replies to go to a different address than
the sender:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "noreply@example.com",
  to: "customer@example.com",
  replyTo: "support@example.com",
  subject: "Welcome to our service",
  content: { text: "Thank you for signing up!" },
});
~~~~


Internationalized addresses
---------------------------

Upyo accepts internationalized mailbox addresses with UTF-8 local parts and
Unicode domains, as defined by the internationalized email framework in
[RFC 6530]:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "josé@example.com",
  to: "用户@例子.广告",
  subject: "Hello",
  content: { text: "Welcome!" },
});
~~~~

The local part is limited to 64 UTF-8 octets.  Upyo preserves the spelling and
Unicode normalization supplied by the caller because changing a local part can
change the mailbox it identifies.

Provider support still depends on the selected transport.  The
[SMTP transport](../transports/smtp.md#internationalized-addresses) negotiates
the `SMTPUTF8` extension automatically and reports a failed receipt when the
server cannot accept an internationalized address.

[RFC 6530]: https://www.rfc-editor.org/rfc/rfc6530


Rich content
------------

Upyo supports both plain text and HTML email content.  You can provide just text
content, just HTML content, or both. When you provide both, email clients will
choose the appropriate format to display:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "newsletter@example.com",
  to: "subscriber@example.com",
  subject: "Monthly Newsletter",
  content: {
    html: "<h1>Welcome to our newsletter!</h1><p>This month we have exciting updates.</p>",
    text: "Welcome to our newsletter! This month we have exciting updates.",
  },
});
~~~~

A message can also carry an iCalendar object alongside the text and HTML, which
is what turns it into a meeting invitation rather than an email that mentions a
meeting.  See [Calendar invitations](./calendar.md).

If you only need plain text, you can simply provide the `text` property:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "system@example.com",
  to: "user@example.com",
  subject: "System Notification",
  content: { text: "Your backup has completed successfully." },
});
~~~~


Message priority and organization
---------------------------------

You can set the priority level of your messages to help recipients understand
their importance. Upyo supports three priority levels: `"high"`, `"normal"`,
and `"low"`:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "alerts@example.com",
  to: "admin@example.com",
  subject: "Server Alert",
  content: { text: "The server is experiencing high load." },
  priority: "high",
});
~~~~

For better organization and filtering, you can add tags to your messages.
Tags are simple strings that can help you categorize and search your
emails later:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "support@example.com",
  to: "customer@example.com",
  subject: "Ticket Update",
  content: { text: "Your support ticket has been updated." },
  tags: ["support", "customer-service", "urgent"],
});
~~~~


Custom headers
--------------

Sometimes you need to include custom email headers for specific functionality
or compliance requirements. You can add custom headers using the `headers` field
as a simple object, a standard [`Headers`] instance, or an `ImmutableHeaders`
instance (which is an immutable version compatible with the standard
[`Headers`] interface):

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

// Using a simple object
const message1 = createMessage({
  from: "app@example.com",
  to: "user@example.com",
  subject: "Password Reset",
  content: { text: "Click the link to reset your password." },
  headers: {
    "X-Mailer": "Upyo Email Library",
    "X-Priority": "1",
    "List-Unsubscribe": "<mailto:unsubscribe@example.com>",
  },
});
~~~~

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
// ---cut-before---
// Using standard Headers object
const headers = new Headers();
headers.set("X-Mailer", "Upyo Email Library");
headers.set("X-Priority", "1");

const message2 = createMessage({
  from: "app@example.com",
  to: "user@example.com",
  subject: "Password Reset",
  content: { text: "Click the link to reset your password." },
  headers,
});
~~~~

The `createMessage()` function handles all the complexity of email message
construction, ensuring that your messages are properly formatted and valid
before sending them through your chosen transport.

[`Headers`]: https://developer.mozilla.org/en-US/docs/Web/API/Headers

### Headers the transport owns

A few header fields come from the message itself rather than from `headers`, so
a transport that composes the message ignores custom headers that would collide
with them: `From`, `To`, `Cc`, `Bcc`, `Reply-To`, `Subject`, `MIME-Version`,
`Content-Type`, and `Content-Transfer-Encoding`.  Use the corresponding
`createMessage()` fields to set those.  Note that `Bcc` in particular is carried
in the envelope and never written into the message, so blind recipients stay
hidden from everyone who receives it.

`Date`, `Message-ID`, `In-Reply-To`, and `References` have dedicated fields too,
described in the next section.  They differ from the fields above in that a
custom header is still honored when the dedicated field is left unset, so the
header form keeps working.


Message identity and reply threading
------------------------------------

Applications that correlate replies, such as a helpdesk matching an incoming
answer back to a ticket, need to choose the outgoing message identifier rather
than discover it afterwards.  `createMessage()` takes four fields for that:

`messageId`
:   The RFC 5322 message identifier.  The enclosing angle brackets are
    optional and stripped, so `<abc@example.com>` and `abc@example.com` mean
    the same thing.

`date`
:   The origination date.  With neither this nor a custom `Date` header set, a
    transport that composes the message uses the time of conversion, so a retry
    carries a later date.

`inReplyTo`
:   The identifier, or identifiers, of the messages this one replies to.

`references`
:   The identifiers of the conversation, oldest first.  A reply usually carries
    the parent's references followed by the parent's own identifier, which is
    how a mail client reconstructs a thread.

Mint an identifier with `generateMessageId()` before sending, store it with
whatever the message is about, and the value survives conversion and any
delivery retry, because a retry re-sends the very same message:

~~~~ typescript twoslash
declare function storeTicketMessageId(id: string): Promise<void>;
// ---cut-before---
import { createMessage, generateMessageId } from "@upyo/core";

const messageId = generateMessageId("example.com");
await storeTicketMessageId(messageId);

const message = createMessage({
  from: "support@example.com",
  to: "customer@example.net",
  subject: "Re: Your request",
  content: { text: "Thanks for getting in touch." },
  messageId,
  date: new Date("2026-09-01T10:00:00Z"),
});
~~~~

When the customer answers, their reply carries `In-Reply-To: <that identifier>`,
which is what ties the answer back to the ticket.  Composing the next message in
the thread is the mirror image:

~~~~ typescript twoslash
interface InboundMessage {
  readonly messageId: string;
  readonly references: readonly string[];
}
declare const inbound: InboundMessage;
// ---cut-before---
import { createMessage } from "@upyo/core";

const reply = createMessage({
  from: "support@example.com",
  to: "customer@example.net",
  subject: "Re: Your request",
  content: { text: "Here is the answer." },
  inReplyTo: inbound.messageId,
  references: [...inbound.references, inbound.messageId],
});
~~~~

An identifier that is not valid is rejected rather than repaired, since these
fields are written into the message as given:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

try {
  createMessage({
    from: "support@example.com",
    to: "customer@example.net",
    subject: "Re: Your request",
    content: { text: "Thanks for getting in touch." },
    messageId: "not an identifier",
  });
} catch (error) {
  console.error(error); // TypeError: Invalid message ID: "not an identifier"
}
~~~~

`parseMessageId()` normalizes a single identifier and returns `undefined`
instead of throwing, which is convenient for values arriving from elsewhere.
It parses one identifier, so an `In-Reply-To` field carrying several has to be
split first.

### Dropping an inherited header

`inReplyTo` and `references` distinguish three states, which matters when a
message is assembled from a template that already carries these headers:

 -  Leaving the field unset defers to a custom `In-Reply-To` or `References`
    header.
 -  Setting it to a non-empty array replaces that header.
 -  Setting it to an empty array suppresses the header, so the message
    deliberately starts a new thread.

### Transport support

`Message-ID` and `Date` are only as durable as the transport carrying them.  A
provider that composes the message on its own side may assign or rewrite both,
whatever the message asked for.

| Transport          | `Message-ID` and `Date` | `In-Reply-To` and `References` |
| ------------------ | ----------------------- | ------------------------------ |
| *@upyo/smtp*       | Written as given        | Written as given               |
| *@upyo/jmap*       | Written as given        | Written as given               |
| *@upyo/mailgun*    | Not sent                | Sent as a custom header        |
| *@upyo/sendgrid*   | Not sent                | Sent as a custom header        |
| *@upyo/mailtrap*   | Not sent                | Sent as a custom header        |
| *@upyo/maileroo*   | Not sent                | Sent as a custom header        |
| *@upyo/lettermint* | Not sent                | Sent as a custom header        |
| *@upyo/resend*     | Not sent                | Sent as a custom header        |
| *@upyo/plunk*      | Not sent                | Sent as a custom header        |
| *@upyo/ses*        | Not sent                | Not sent                       |

“Not sent” describes Upyo, not the provider.  Most of these APIs accept a
custom `Message-ID` without documenting whether the value survives their
pipeline; Lettermint documents that it replaces one unless a separate opt-in
header accompanies it, and Amazon SES documents that it overrides both fields
even for a raw MIME message.  Rather than promise preservation Upyo cannot
verify, those transports leave the fields alone.  *@upyo/ses* sends no custom
headers at all.

Providers also cap header values well below the length a long thread produces:
768 characters for Maileroo, around 995 for Plunk and Amazon SES.  Upyo does not
truncate a `References` chain, so an over-long one surfaces as a provider error.

> [!NOTE]
> A message identifier supports *correlation*.  It is not a capability, so
> receiving one proves nothing about who sent it; it does not deduplicate
> anything, nor make delivery exactly-once; and a recipient's mail client may
> thread by subject regardless.

### `Message-ID` is not `Receipt.messageId`

The `messageId` on a successful [`Receipt`] is the delivery handle the transport
or the provider reports back: an SMTP queue identifier, a provider UUID, a JMAP
submission id.  It is chosen by the far side, differs in shape between
transports, and is not the RFC 5322 `Message-ID` the message carries.  Use it to
look a delivery up in a provider's dashboard; use `message.messageId` to
correlate a reply.

[`Receipt`]: https://jsr.io/@upyo/core/doc/receipt/~/Receipt
