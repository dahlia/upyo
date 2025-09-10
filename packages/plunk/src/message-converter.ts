import type { Attachment, Message } from "@upyo/core";
import type { ResolvedPlunkConfig } from "./config.ts";

/**
 * Plunk attachment object.
 */
interface PlunkAttachment {
  filename: string;
  content: string;
  type: string;
}

/**
 * Plunk email object structure for API requests.
 */
interface PlunkEmail {
  to: string | string[];
  subject: string;
  body: string;
  subscribed?: boolean;
  name?: string;
  from?: string;
  reply?: string;
  headers?: Record<string, string>;
  attachments?: PlunkAttachment[];
}

/**
 * Converts a Upyo message to Plunk API format.
 *
 * This function transforms the standardized Upyo message format into the
 * format expected by the Plunk HTTP API, handling email addresses,
 * content conversion, attachments, and headers.
 *
 * @param message - The Upyo message to convert
 * @param config - Resolved Plunk configuration
 * @returns Promise that resolves to Plunk-formatted email data
 */
export async function convertMessage(
  message: Message,
  _config: ResolvedPlunkConfig,
): Promise<PlunkEmail> {
  // Convert recipients - Plunk accepts either string or array
  const recipients = message.recipients.map((addr) => addr.address);
  const to = recipients.length === 1 ? recipients[0] : recipients;

  // Convert sender information
  const senderName = message.sender.name;
  const senderEmail = message.sender.address;

  // Convert reply-to (use first reply recipient)
  const replyTo = message.replyRecipients.length > 0
    ? message.replyRecipients[0].address
    : undefined;

  // Convert content - HTML takes precedence over text
  let body: string;
  if ("html" in message.content && message.content.html) {
    body = message.content.html;
  } else if ("text" in message.content && message.content.text) {
    body = message.content.text;
  } else {
    body = "";
  }

  // Convert headers - merge custom headers but exclude standard ones
  const customHeaders: Record<string, string> = {};
  if (message.headers) {
    for (const [key, value] of message.headers.entries()) {
      // Skip headers that are handled by dedicated fields
      const lowerKey = key.toLowerCase();
      if (
        !["to", "from", "reply-to", "subject", "content-type"].includes(
          lowerKey,
        )
      ) {
        customHeaders[lowerKey] = value;
      }
    }
  }

  // Convert attachments (limit to 5 as per Plunk documentation)
  const attachments: PlunkAttachment[] = [];
  const maxAttachments = Math.min(message.attachments.length, 5);

  for (let i = 0; i < maxAttachments; i++) {
    const attachment = message.attachments[i];
    const convertedAttachment = await convertAttachment(attachment);
    if (convertedAttachment) {
      attachments.push(convertedAttachment);
    }
  }

  // Build Plunk email object
  const plunkEmail: PlunkEmail = {
    to,
    subject: message.subject,
    body,
    subscribed: false, // Default to false for transactional emails
  };

  // Add optional fields if present
  if (senderName) {
    plunkEmail.name = senderName;
  }

  if (senderEmail) {
    plunkEmail.from = senderEmail;
  }

  if (replyTo) {
    plunkEmail.reply = replyTo;
  }

  if (Object.keys(customHeaders).length > 0) {
    plunkEmail.headers = customHeaders;
  }

  if (attachments.length > 0) {
    plunkEmail.attachments = attachments;
  }

  return plunkEmail;
}

/**
 * Converts a Upyo attachment to Plunk format.
 *
 * @param attachment - The Upyo attachment to convert
 * @returns Promise that resolves to Plunk attachment or null if conversion fails
 */
async function convertAttachment(
  attachment: Attachment,
): Promise<PlunkAttachment | null> {
  try {
    // Get content as Uint8Array
    const content = await attachment.content;

    // Convert to base64
    const base64Content = arrayBufferToBase64(content);

    return {
      filename: attachment.filename,
      content: base64Content,
      type: attachment.contentType,
    };
  } catch (error) {
    // Log error but don't fail the entire send operation
    console.warn(
      `Failed to convert attachment ${attachment.filename}:`,
      error,
    );
    return null;
  }
}

/**
 * Converts an ArrayBuffer or Uint8Array to base64 string.
 *
 * @param buffer - The buffer to convert
 * @returns Base64 encoded string
 */
function arrayBufferToBase64(buffer: Uint8Array): string {
  // Use btoa if available (browser/Node.js with --experimental-fetch)
  if (typeof btoa !== "undefined") {
    const binaryString = Array.from(buffer, (byte) => String.fromCharCode(byte))
      .join("");
    return btoa(binaryString);
  }

  // Fallback for environments without btoa
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;

  while (i < buffer.length) {
    const a = buffer[i++];
    const b = i < buffer.length ? buffer[i++] : 0;
    const c = i < buffer.length ? buffer[i++] : 0;

    const bitmap = (a << 16) | (b << 8) | c;

    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < buffer.length ? chars.charAt((bitmap >> 6) & 63) : "=";
    result += i - 1 < buffer.length ? chars.charAt(bitmap & 63) : "=";
  }

  return result;
}
