import type { Address, Attachment, Message } from "@upyo/core";
import type { ResolvedResendConfig } from "./config.ts";

/**
 * Resend attachment object structure.
 */
interface ResendAttachment {
  filename: string;
  content: string; // base64 encoded
  content_type?: string;
  path?: string;
}

/**
 * Resend email object structure for API requests.
 */
interface ResendEmail {
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: ResendAttachment[];
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
  scheduled_at?: string; // ISO 8601
}

/**
 * Converts a Upyo Message to Resend API JSON format.
 *
 * This function transforms the standardized Upyo message format into
 * the specific format expected by the Resend API.
 *
 * @param message - The Upyo message to convert
 * @param config - The resolved Resend configuration
 * @param options - Optional conversion options
 * @returns JSON object ready for Resend API submission
 *
 * @example
 * ```typescript
 * const emailData = await convertMessage(message, config);
 * const response = await fetch(url, {
 *   method: 'POST',
 *   body: JSON.stringify(emailData),
 *   headers: { 'Content-Type': 'application/json' }
 * });
 * ```
 */
export async function convertMessage(
  message: Message,
  _config: ResolvedResendConfig,
  options: { idempotencyKey?: string; scheduledAt?: Date } = {},
): Promise<ResendEmail> {
  const emailData: ResendEmail = {
    from: formatAddress(message.sender),
    to: message.recipients.length === 1
      ? formatAddress(message.recipients[0])
      : message.recipients.map(formatAddress),
    subject: message.subject,
  };

  // CC recipients
  if (message.ccRecipients.length > 0) {
    emailData.cc = message.ccRecipients.map(formatAddress);
  }

  // BCC recipients
  if (message.bccRecipients.length > 0) {
    emailData.bcc = message.bccRecipients.map(formatAddress);
  }

  // Reply-to
  if (message.replyRecipients.length > 0) {
    // Resend supports only one reply-to address, so we take the first one
    emailData.reply_to = formatAddress(message.replyRecipients[0]);
  }

  // Content
  if ("html" in message.content) {
    emailData.html = message.content.html;
    if (message.content.text) {
      emailData.text = message.content.text;
    }
  } else {
    emailData.text = message.content.text;
  }

  // Attachments
  if (message.attachments.length > 0) {
    emailData.attachments = await Promise.all(
      message.attachments.map(convertAttachment),
    );
  }

  // Tags - Resend uses different format than Upyo
  if (message.tags.length > 0) {
    emailData.tags = message.tags.map((tag, index) => ({
      name: `tag${index + 1}`, // Resend requires name-value pairs
      value: tag,
    }));
  }

  // Custom headers
  const headers: Record<string, string> = {};

  // Priority
  if (message.priority !== "normal") {
    const priorityMap = {
      "high": "1",
      "normal": "3",
      "low": "5",
    };
    headers["X-Priority"] = priorityMap[message.priority];
  }

  // Custom headers from message
  for (const [key, value] of message.headers.entries()) {
    // Skip standard headers that are handled separately
    if (!isStandardHeader(key)) {
      headers[key] = value;
    }
  }

  // Idempotency key (for deduplication)
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  if (Object.keys(headers).length > 0) {
    emailData.headers = headers;
  }

  // Scheduled sending
  if (options.scheduledAt) {
    emailData.scheduled_at = options.scheduledAt.toISOString();
  }

  return emailData;
}

/**
 * Converts multiple Upyo Messages to Resend batch API format.
 *
 * This function handles the batch conversion with proper validation
 * for Resend's batch API limitations.
 *
 * @param messages - Array of Upyo messages to convert
 * @param config - The resolved Resend configuration
 * @param options - Optional conversion options
 * @returns Array of JSON objects ready for Resend batch API
 */
export async function convertMessagesBatch(
  messages: Message[],
  _config: ResolvedResendConfig,
  options: { idempotencyKey?: string } = {},
): Promise<ResendEmail[]> {
  // Resend batch API limitations
  if (messages.length > 100) {
    throw new Error("Resend batch API supports maximum 100 emails per request");
  }

  // Check for unsupported features in batch mode
  for (const message of messages) {
    if (message.attachments.length > 0) {
      throw new Error("Attachments are not supported in Resend batch API");
    }
    if (message.tags.length > 0) {
      throw new Error("Tags are not supported in Resend batch API");
    }
  }

  const batchData = await Promise.all(
    messages.map((message, index) =>
      convertMessage(message, _config, {
        ...options,
        // Generate unique idempotency key for each message if provided
        idempotencyKey: options.idempotencyKey
          ? `${options.idempotencyKey}-${index}`
          : undefined,
      })
    ),
  );

  return batchData;
}

/**
 * Formats an Address object into a string suitable for Resend API.
 *
 * @param address - The address to format
 * @returns Formatted address string
 */
function formatAddress(address: Address): string {
  if (address.name) {
    // If the name contains special characters, quote it
    const name = address.name.includes('"') || address.name.includes(",") ||
        address.name.includes("<") || address.name.includes(">")
      ? `"${address.name.replace(/"/g, '\\"')}"`
      : address.name;
    return `${name} <${address.address}>`;
  }
  return address.address;
}

/**
 * Converts a Upyo Attachment to Resend attachment format.
 *
 * @param attachment - The Upyo attachment to convert
 * @returns Resend attachment object
 */
async function convertAttachment(
  attachment: Attachment,
): Promise<ResendAttachment> {
  const content = await attachment.content;
  const resendAttachment: ResendAttachment = {
    filename: attachment.filename,
    content: await uint8ArrayToBase64(content),
  };

  if (attachment.contentType) {
    resendAttachment.content_type = attachment.contentType;
  }

  return resendAttachment;
}

/**
 * Converts a Uint8Array to base64 string using pure JavaScript implementation.
 * This avoids deprecated APIs like btoa() and Node.js-specific Buffer.
 *
 * @param bytes - The Uint8Array to convert
 * @returns Base64 encoded string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;

  while (i < bytes.length) {
    const a = bytes[i++];
    const b = i < bytes.length ? bytes[i++] : 0;
    const c = i < bytes.length ? bytes[i++] : 0;

    const bitmap = (a << 16) | (b << 8) | c;

    result += chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      chars.charAt((bitmap >> 6) & 63) +
      chars.charAt(bitmap & 63);
  }

  // Add padding
  const padding = 3 - ((bytes.length - 1) % 3);
  if (padding < 3) {
    result = result.slice(0, -padding) + "=".repeat(padding);
  }

  return result;
}

/**
 * Checks if a header is a standard email header that should not be prefixed.
 *
 * @param headerName - The header name to check
 * @returns True if the header is a standard header
 */
function isStandardHeader(headerName: string): boolean {
  const standardHeaders = new Set([
    "from",
    "to",
    "cc",
    "bcc",
    "reply-to",
    "subject",
    "content-type",
    "content-transfer-encoding",
    "mime-version",
    "date",
    "message-id",
  ]);

  return standardHeaders.has(headerName.toLowerCase());
}

/**
 * Generates a random idempotency key for request deduplication.
 *
 * @returns A unique string suitable for use as an idempotency key
 */
export function generateIdempotencyKey(): string {
  // Generate a UUID-like string
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);

  return `${timestamp}-${random1}${random2}`;
}
