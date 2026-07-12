import type { Address, Attachment, Message } from "@upyo/core";
import type { ResolvedMailtrapConfig } from "./config.ts";

const STANDARD_HEADERS = new Set([
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
  "x-priority",
]);

/**
 * Mailtrap address object structure.
 *
 * @since 0.6.0
 */
export interface MailtrapAddress {
  readonly email: string;
  readonly name?: string;
}

/**
 * Mailtrap attachment object structure.
 *
 * @since 0.6.0
 */
export interface MailtrapAttachment {
  readonly content: string;
  readonly filename: string;
  readonly type?: string;
  readonly disposition?: string;
  readonly content_id?: string;
}

/**
 * Mailtrap email object structure for API requests.
 *
 * @since 0.6.0
 */
export interface MailtrapEmail {
  readonly from: MailtrapAddress;
  readonly to: readonly MailtrapAddress[];
  readonly subject: string;
  readonly cc?: readonly MailtrapAddress[];
  readonly bcc?: readonly MailtrapAddress[];
  readonly reply_to?: MailtrapAddress;
  readonly text?: string;
  readonly html?: string;
  readonly headers?: Record<string, string>;
  readonly attachments?: readonly MailtrapAttachment[];
  readonly category: string;
  readonly custom_variables?: Record<string, string>;
}

/**
 * Converts an Upyo message to Mailtrap API JSON format.
 *
 * @param message The Upyo message to convert.
 * @param config The resolved Mailtrap configuration.
 * @returns JSON object ready for Mailtrap API submission.
 * @throws {RangeError} If the message has no text or HTML content.
 * @since 0.6.0
 */
export async function convertMessage(
  message: Message,
  config: ResolvedMailtrapConfig,
): Promise<MailtrapEmail> {
  const emailData: MutableMailtrapEmail = {
    from: formatAddress(message.sender),
    to: message.recipients.map(formatAddress),
    subject: message.subject,
    category: resolveCategory(message.tags, config.defaultCategory),
  };

  if (message.ccRecipients.length > 0) {
    emailData.cc = message.ccRecipients.map(formatAddress);
  }

  if (message.bccRecipients.length > 0) {
    emailData.bcc = message.bccRecipients.map(formatAddress);
  }

  if (message.replyRecipients.length > 0) {
    emailData.reply_to = formatAddress(message.replyRecipients[0]);
  }

  if ("html" in message.content) {
    emailData.html = message.content.html;
    if (message.content.text) {
      emailData.text = message.content.text;
    }
  } else {
    emailData.text = message.content.text;
  }

  if (!emailData.text && !emailData.html) {
    throw new RangeError(
      "Mailtrap requires at least one of text or HTML content.",
    );
  }

  const customVariables = buildCustomVariables(message.tags, config.metadata);
  if (Object.keys(customVariables).length > 0) {
    emailData.custom_variables = customVariables;
  }

  const headers: Record<string, string> = {};
  if (message.priority !== "normal") {
    const priorityMap = {
      "high": "1",
      "normal": "3",
      "low": "5",
    };
    headers["X-Priority"] = priorityMap[message.priority];
  }

  for (const [key, value] of message.headers.entries()) {
    if (!isStandardHeader(key)) {
      headers[key] = value;
    }
  }

  if (Object.keys(headers).length > 0) {
    emailData.headers = headers;
  }

  if (message.attachments.length > 0) {
    emailData.attachments = await Promise.all(
      message.attachments.map(convertAttachment),
    );
  }

  return emailData;
}

type MutableMailtrapEmail = {
  -readonly [Key in keyof MailtrapEmail]: MailtrapEmail[Key];
};

function resolveCategory(
  tags: readonly string[],
  fallback: string,
): string {
  return tags[0] ?? fallback;
}

function buildCustomVariables(
  tags: readonly string[],
  metadata: Record<string, string> | undefined,
): Record<string, string> {
  const customVariables: Record<string, string> = {};

  if (metadata != null) {
    for (const [key, value] of Object.entries(metadata)) {
      customVariables[key] = value;
    }
  }

  for (const tag of tags.slice(1)) {
    customVariables[`tag_${tag}`] = tag;
  }

  return customVariables;
}

function formatAddress(address: Address): MailtrapAddress {
  if (address.name) {
    return { email: address.address, name: address.name };
  }
  return { email: address.address };
}

async function convertAttachment(
  attachment: Attachment,
): Promise<MailtrapAttachment> {
  const contentBytes = await attachment.content;
  const converted: {
    content: string;
    filename: string;
    type?: string;
    disposition?: string;
    content_id?: string;
  } = {
    content: uint8ArrayToBase64(contentBytes),
    filename: attachment.filename,
  };

  if (attachment.contentType) {
    converted.type = attachment.contentType;
  }

  if (attachment.inline && attachment.contentId) {
    converted.disposition = "inline";
    converted.content_id = attachment.contentId;
  } else {
    converted.disposition = "attachment";
  }

  return converted;
}

interface Base64Options {
  readonly alphabet?: "base64" | "base64url";
  readonly omitPadding?: boolean;
}

interface NativeBase64Converter {
  toBase64?: (options?: Base64Options) => string;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const nativeToBase64 = getNativeToBase64(bytes);
  if (nativeToBase64 != null) {
    return nativeToBase64();
  }

  const chunkSize = 0x8000;
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }

  return btoa(chunks.join(""));
}

function getNativeToBase64(
  bytes: Uint8Array,
): (() => string) | undefined {
  const candidate: Uint8Array & NativeBase64Converter = bytes;
  const toBase64 = candidate.toBase64;
  if (typeof toBase64 !== "function") return undefined;
  return () => toBase64.call(bytes);
}

function isStandardHeader(headerName: string): boolean {
  return STANDARD_HEADERS.has(headerName.toLowerCase());
}
