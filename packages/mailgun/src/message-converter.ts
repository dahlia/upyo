import type { Address, Attachment, Message } from "@upyo/core";
import { createCalendarAttachment } from "@upyo/core/calendar";
import { readAttachmentContent, resolveThreadingHeaders } from "@upyo/core";
import type { ResolvedMailgunConfig } from "./config.ts";

/**
 * Converts a Upyo Message to Mailgun API FormData format.
 *
 * This function transforms the standardized Upyo message format into
 * the specific format expected by the Mailgun API.
 *
 * @param message - The Upyo message to convert
 * @param config - The resolved Mailgun configuration
 * @returns FormData object ready for Mailgun API submission
 * @throws {TypeError} If the message carries an invalid message identifier.
 *
 * @example
 * ```typescript
 * const formData = await convertMessage(message, config);
 * const response = await fetch(url, { method: 'POST', body: formData });
 * ```
 */
export async function convertMessage(
  message: Message,
  config: ResolvedMailgunConfig,
  signal?: AbortSignal,
): Promise<FormData> {
  const formData = new FormData();
  // A transport that cannot compose a `text/calendar` alternative carries the
  // scheduling payload as an *invite.ics* part instead, ahead of the caller's
  // own files so that a client looking for the first calendar part finds it.
  const attachments = message.calendar == null
    ? message.attachments
    : [createCalendarAttachment(message.calendar), ...message.attachments];

  // Required fields
  formData.append("from", formatAddress(message.sender));

  // Recipients
  for (const recipient of message.recipients) {
    formData.append("to", formatAddress(recipient));
  }

  // CC recipients
  for (const ccRecipient of message.ccRecipients) {
    formData.append("cc", formatAddress(ccRecipient));
  }

  // BCC recipients
  for (const bccRecipient of message.bccRecipients) {
    formData.append("bcc", formatAddress(bccRecipient));
  }

  // Reply-to
  if (message.replyRecipients.length > 0) {
    const replyTo = message.replyRecipients.map(formatAddress).join(", ");
    formData.append("h:Reply-To", replyTo);
  }

  // Subject
  formData.append("subject", message.subject);

  // Content
  if ("html" in message.content) {
    formData.append("html", message.content.html);
    if (message.content.text) {
      formData.append("text", message.content.text);
    }
  } else {
    formData.append("text", message.content.text);
  }

  // Priority
  if (message.priority !== "normal") {
    const priorityMap = {
      "high": "1",
      "normal": "3",
      "low": "5",
    };
    formData.append("h:X-Priority", priorityMap[message.priority]);
  }

  // Tags
  for (const tag of message.tags) {
    formData.append("o:tag", tag);
  }

  // Reply threading comes from the typed fields when the message defines them,
  // and from a custom header otherwise.  A field the message owns but left
  // empty writes nothing, which is how a caller drops an inherited header.
  const threading = resolveThreadingHeaders(message);
  const ownedHeaders = new Set(
    [...threading.keys()].map((name) => name.toLowerCase()),
  );

  // Custom headers
  for (const [key, value] of message.headers.entries()) {
    // Skip standard headers that are handled separately
    if (!isStandardHeader(key) && !ownedHeaders.has(key.toLowerCase())) {
      formData.append(`h:${key}`, value);
    }
  }
  for (const [name, value] of threading) {
    if (value != null) formData.append(`h:${name}`, value);
  }

  // Attachments
  for (const attachment of attachments) {
    await appendAttachment(formData, attachment, signal);
  }

  // Tracking options
  if (config.tracking !== undefined) {
    formData.append("o:tracking", config.tracking ? "yes" : "no");
  }

  if (config.clickTracking !== undefined) {
    formData.append("o:tracking-clicks", config.clickTracking ? "yes" : "no");
  }

  if (config.openTracking !== undefined) {
    formData.append("o:tracking-opens", config.openTracking ? "yes" : "no");
  }

  return formData;
}

/**
 * Formats an address for Mailgun API.
 *
 * @param address - The address to format
 * @returns Formatted address string
 */
function formatAddress(address: Address): string {
  if (address.name) {
    // Escape quotes in the name
    const escapedName = address.name.replace(/"/g, '\\"');
    return `"${escapedName}" <${address.address}>`;
  }
  return address.address;
}

/**
 * Appends an attachment to the FormData.
 *
 * @param formData - The FormData to append to
 * @param attachment - The attachment to append
 */
async function appendAttachment(
  formData: FormData,
  attachment: Attachment,
  signal?: AbortSignal,
): Promise<void> {
  const content = await readAttachmentContent(attachment.content, signal);
  // Ensure ArrayBuffer type compatibility for Blob constructor
  const buffer = content.buffer instanceof ArrayBuffer
    ? content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    )
    : content.slice(); // fallback to create new Uint8Array if SharedArrayBuffer
  const blob = new Blob([buffer], {
    type: attachment.contentType,
  });

  if (attachment.contentId) {
    // Inline attachment
    formData.append("inline", blob, attachment.filename);
  } else {
    // Regular attachment
    formData.append("attachment", blob, attachment.filename);
  }
}

/**
 * Checks if a header is a standard email header that should not be prefixed with 'h:'.
 *
 * @param headerName - The header name to check
 * @returns True if it's a standard header
 */
function isStandardHeader(headerName: string): boolean {
  const standardHeaders = [
    "from",
    "to",
    "cc",
    "bcc",
    "reply-to",
    "subject",
    "date",
    "message-id",
    "content-type",
    "content-transfer-encoding",
    "mime-version",
  ];

  return standardHeaders.includes(headerName.toLowerCase());
}
