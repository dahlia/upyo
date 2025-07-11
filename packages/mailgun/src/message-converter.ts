import type { Address, Attachment, Message } from "@upyo/core";
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
): Promise<FormData> {
  const formData = new FormData();

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

  // Custom headers
  for (const [key, value] of message.headers.entries()) {
    // Skip standard headers that are handled separately
    if (!isStandardHeader(key)) {
      formData.append(`h:${key}`, value);
    }
  }

  // Attachments
  for (const attachment of message.attachments) {
    await appendAttachment(formData, attachment);
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
): Promise<void> {
  const blob = new Blob([await attachment.content], {
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
