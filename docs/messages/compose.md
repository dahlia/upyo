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
