---
description: >-
  Guide to adding file attachments to emails using JavaScript File objects
  or custom Attachment objects, including inline attachments and binary content.
---

Attachments
===========

Email attachments in Upyo are handled seamlessly through the `createMessage()`
function from the *@upyo/core* package. You can attach files to your messages
using either JavaScript [`File`] objects or custom `Attachment` objects,
giving you flexibility in how you handle file content and metadata.

[`File`]: https://developer.mozilla.org/en-US/docs/Web/API/File


Attaching files
---------------

The simplest way to add attachments to your email is by using JavaScript
[`File`] objects.  This is particularly useful when working with file uploads
in web applications or when you have file data available as [`File`] instances:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { readFile } from "node:fs/promises";

// Read a PDF file from the filesystem
const fileContent = await readFile("./reports/monthly-report.pdf");
const file = new File([fileContent], "monthly-report.pdf", { type: "application/pdf" });

const message = createMessage({
  from: "finance@example.com",
  to: "manager@example.com",
  subject: "Monthly Report - October 2024",
  content: { text: "Please find the October monthly report attached for your review." },
  attachments: file,
});
~~~~

When you provide a [`File`] object, Upyo extracts its filename and content type
and retains the file without reading it.  The attachment will be included as a
regular (non-inline) attachment.  The `readFile()` call in this example
allocates the complete file before constructing the message; use a content
factory below when the file should be read incrementally.


Multiple attachments
--------------------

You can attach multiple files to a single message by providing an array of
[`File`] objects or mixing different attachment types:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { readFile } from "node:fs/promises";

// Read multiple files from the filesystem
const contractContent = await readFile("./legal/Q4-contract.pdf");
const budgetContent = await readFile("./finance/Q4-budget.xlsx");

const document = new File([contractContent], "Q4-contract.pdf", {
  type: "application/pdf"
});

const spreadsheet = new File([budgetContent], "Q4-budget.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});

const message = createMessage({
  from: "finance@example.com",
  to: "ceo@example.com",
  subject: "Q4 Financial Documents",
  content: { text: "Please find the Q4 contract and budget documents attached for your review." },
  attachments: [document, spreadsheet],
});
~~~~


Custom attachment objects
-------------------------

For more control over attachment behavior, you can create custom `Attachment`
objects instead of using [`File`] instances. This approach is useful when you
need to specify additional metadata or when working with inline attachments for
HTML emails:

~~~~ typescript twoslash
import { createMessage, type Attachment } from "@upyo/core";
import { readFile } from "node:fs/promises";

// Read company logo for inline attachment
const logoContent = await readFile("./assets/company-logo.png");

const logoAttachment: Attachment = {
  filename: "company-logo.png",
  content: logoContent,
  contentType: "image/png",
  contentId: "company-logo",
  inline: true,
};

const message = createMessage({
  from: "marketing@example.com",
  to: "customer@example.com",
  subject: "Welcome to Acme Corp!",
  content: {
    html: `
      <h1>Welcome to Acme Corp!</h1>
      <p>We are excited to have you on board.</p>
      <img src="cid:company-logo" alt="Acme Corp Logo" style="width: 200px;">
    `,
    text: "Welcome to Acme Corp! We are excited to have you on board.",
  },
  attachments: logoAttachment,
});
~~~~

In this example, the attachment is marked as inline (`inline: true`) and
referenced in the HTML content using the `contentId` as `cid:company-logo`.
This allows the image to be displayed directly within the email body rather
than as a separate downloadable attachment.


Working with binary content
---------------------------

*Blob attachments, replayable content factories, and SMTP attachment streaming
are available since Upyo 0.6.0.*

When working with binary file content, you can provide the attachment data as
a [`Uint8Array`], a `Promise<Uint8Array>`, a `Blob`, or a replayable content
factory.  A promise represents a read that has already started; it does not
defer that read until sending and still allocates the whole attachment.

A factory opens a fresh reader when the transport needs the bytes:

~~~~ typescript twoslash
import { createMessage, type Attachment } from "@upyo/core";
import { createReadStream } from "node:fs";

const attachment: Attachment = {
  filename: "customer-data-2024.csv",
  content: (signal) => createReadStream(
    "./data/exports/customer-data-2024.csv",
    { signal },
  ),
  contentType: "text/csv",
  contentId: "customer-dataset",
  inline: false,
};

const message = createMessage({
  from: "data@example.com",
  to: "analyst@example.com",
  subject: "Customer Data Export - 2024",
  content: { text: "The 2024 customer dataset you requested is attached. This file contains anonymized customer analytics data." },
  attachments: attachment,
});
~~~~

The factory receives an optional `AbortSignal` and returns an
`AsyncIterable<Uint8Array>` or a promise for one.  Every invocation must return
an independent reader producing identical bytes.  Retries, concurrent sends,
and streaming DKIM may open the same attachment more than once.  Do not return
an already-open stream from a factory, or change the underlying file while a
send is pending.  A rejected byte-array promise cannot restart its read.

Factories should honor cancellation during acquisition and reading, and release
resources in `finally` when implemented as async generators.  Upyo requests
iterator cleanup on early exit but does not wait indefinitely for a producer
that ignores cancellation.  Yield bounded chunks that remain valid until the
next read; Upyo copies them when collecting a complete attachment.

Unsigned SMTP streams attachments through MIME encoding to the socket.  Its
additional attachment memory is bounded by fixed processing buffers and the
largest source chunk, excluding caller-owned data, text/HTML, headers, and
runtime/socket buffers.  HTTP transports accept the same inputs but collect the
bytes for their provider payloads.  Plunk retains its existing behavior of
omitting attachments whose reads fail, except that caller cancellation aborts
the send.  See [SMTP DKIM body modes](../transports/smtp.md#body-processing) for
the signing tradeoffs.

[`Uint8Array`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array

### Reading attachment content in custom transports

Since Upyo 0.6.0, `Attachment.content` is an `AttachmentContent` union, and
`createMessage()` retains `File` objects instead of converting them to
byte-array promises.  Code that previously used `await attachment.content`
should use `readAttachmentContent()` when it needs a complete byte array:

~~~~ typescript twoslash
import { type Attachment, readAttachmentContent } from "@upyo/core";

async function readFileAttachment(
  attachment: Attachment,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return await readAttachmentContent(attachment.content, signal);
}
~~~~

Use `iterateAttachmentContent(content, signal)` instead when a custom transport
can consume chunks incrementally.  Neither helper caches factory results.


Content type considerations
---------------------------

When creating custom attachments, it's important to specify accurate content
types (media types) to ensure proper handling by email clients.  Common content
types include `"application/pdf"` for PDF files, `"image/png"` for PNG images,
`"text/csv"` for CSV files, and `"application/zip"` for ZIP archives.
The content type helps email clients determine how to display or handle
the attachment appropriately.

If the content type comes from outside your application, pass it to
`createMessage()` rather than to a `Message` object you build yourself.
The SMTP transport writes the content type and the content ID into the MIME
part headers as given, so a value carrying a carriage return or line feed would
end that header field and turn the rest into further header fields.
`createMessage()` rejects both characters with a `TypeError`.  A browser's
declared upload type is a common source of such a value.

Whether you're working with simple file uploads or complex inline attachments
for rich HTML emails, Upyo's attachment system provides the flexibility you need
while handling the underlying complexity of email attachment encoding and
formatting.
