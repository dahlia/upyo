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
in web applications or when you have file data available as `File` instances:

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

When you provide a [`File`] object, Upyo automatically extracts the filename,
content type, and file data.  The attachment will be included as a regular
(non-inline) attachment that recipients can download.


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

When working with binary file content, you can provide the attachment data as
a [`Uint8Array`] for immediate use, or as a `Promise<Uint8Array>` for lazy
loading.  The promise approach is particularly useful when dealing with large
files or when the content needs to be fetched from an external source:

~~~~ typescript twoslash
import { createMessage, type Attachment } from "@upyo/core";
import { readFile } from "node:fs/promises";

// Function to load large files lazily
async function loadLargeDataset(filepath: string): Promise<Uint8Array> {
  console.log(`Loading large file: ${filepath}`);
  const buffer = await readFile(filepath);
  return new Uint8Array(buffer);
}

const attachment: Attachment = {
  filename: "customer-data-2024.csv",
  content: loadLargeDataset("./data/exports/customer-data-2024.csv"),
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

[`Uint8Array`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array


Content type considerations
---------------------------

When creating custom attachments, it's important to specify accurate content
types (media types) to ensure proper handling by email clients.  Common content
types include `"application/pdf"` for PDF files, `"image/png"` for PNG images,
`"text/csv"` for CSV files, and `"application/zip"` for ZIP archives.
The content type helps email clients determine how to display or handle
the attachment appropriately.

Whether you're working with simple file uploads or complex inline attachments
for rich HTML emails, Upyo's attachment system provides the flexibility you need
while handling the underlying complexity of email attachment encoding and
formatting.
