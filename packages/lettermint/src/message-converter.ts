import type { Address, Attachment, Message } from "@upyo/core";
import type { ResolvedLettermintConfig } from "./config.ts";

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
 * Lettermint attachment object structure.
 *
 * @since 0.5.0
 */
export interface LettermintAttachment {
  /** Attachment filename. */
  readonly filename: string;
  /** Base64-encoded attachment content. */
  readonly content: string;
  /** Attachment MIME type. */
  readonly content_type: string;
  /** Content-ID for inline attachments. */
  readonly content_id?: string;
}

/**
 * Lettermint settings payload structure.
 *
 * @since 0.5.0
 */
export interface LettermintSettingsPayload {
  /** Whether Lettermint should track email opens. */
  readonly track_opens?: boolean;
  /** Whether Lettermint should track link clicks. */
  readonly track_clicks?: boolean;
}

/**
 * Lettermint email object structure for API requests.
 *
 * @since 0.5.0
 */
export interface LettermintEmail {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly route?: string;
  readonly tag?: string | null;
  readonly html?: string;
  readonly text?: string;
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
  readonly reply_to?: readonly string[];
  readonly headers?: Record<string, string>;
  readonly metadata?: Record<string, string>;
  readonly settings?: LettermintSettingsPayload;
  readonly attachments?: readonly LettermintAttachment[];
}

/**
 * Converts an Upyo message to Lettermint API JSON format.
 *
 * @param message The Upyo message to convert.
 * @param config The resolved Lettermint configuration.
 * @returns JSON object ready for Lettermint API submission.
 * @throws {RangeError} If the message has more than one tag.
 * @since 0.5.0
 */
export async function convertMessage(
  message: Message,
  config: ResolvedLettermintConfig,
): Promise<LettermintEmail> {
  if (message.tags.length > 1) {
    throw new RangeError(
      "Lettermint supports at most one tag per message.",
    );
  }

  const emailData: MutableLettermintEmail = {
    from: formatAddress(message.sender),
    to: message.recipients.map(formatAddress),
    subject: message.subject,
  };

  if (message.ccRecipients.length > 0) {
    emailData.cc = message.ccRecipients.map(formatAddress);
  }

  if (message.bccRecipients.length > 0) {
    emailData.bcc = message.bccRecipients.map(formatAddress);
  }

  if (message.replyRecipients.length > 0) {
    emailData.reply_to = message.replyRecipients.map(formatAddress);
  }

  if ("html" in message.content) {
    emailData.html = message.content.html;
    if (message.content.text) {
      emailData.text = message.content.text;
    }
  } else {
    emailData.text = message.content.text;
  }

  if (config.route) {
    emailData.route = config.route;
  }

  if (message.tags.length === 1) {
    emailData.tag = message.tags[0];
  } else if (config.tag !== undefined) {
    emailData.tag = config.tag;
  }

  if (config.metadata != null && Object.keys(config.metadata).length > 0) {
    emailData.metadata = { ...config.metadata };
  }

  const settings = convertSettings(config);
  if (settings != null) {
    emailData.settings = settings;
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

type MutableLettermintEmail = {
  -readonly [Key in keyof LettermintEmail]: LettermintEmail[Key];
};

interface Base64Options {
  readonly alphabet?: "base64" | "base64url";
  readonly omitPadding?: boolean;
}

interface NativeBase64Converter {
  toBase64?: (options?: Base64Options) => string;
}

function convertSettings(
  config: ResolvedLettermintConfig,
): LettermintSettingsPayload | undefined {
  if (config.settings == null) return undefined;

  const settings: {
    track_opens?: boolean;
    track_clicks?: boolean;
  } = {};

  if (config.settings.trackOpens !== undefined) {
    settings.track_opens = config.settings.trackOpens;
  }

  if (config.settings.trackClicks !== undefined) {
    settings.track_clicks = config.settings.trackClicks;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function formatAddress(address: Address): string {
  if (address.name) {
    const escapedName = address.name.replace(/\\/g, "\\\\").replace(
      /"/g,
      '\\"',
    );
    return `"${escapedName}" <${address.address}>`;
  }
  return address.address;
}

async function convertAttachment(
  attachment: Attachment,
): Promise<LettermintAttachment> {
  const content = await attachment.content;
  const converted: {
    filename: string;
    content: string;
    content_type: string;
    content_id?: string;
  } = {
    filename: attachment.filename,
    content: uint8ArrayToBase64(content),
    content_type: attachment.contentType,
  };

  if (attachment.inline && attachment.contentId) {
    converted.content_id = attachment.contentId;
  }

  return converted;
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

/**
 * Generates a random idempotency key for request deduplication.
 *
 * @returns A unique string suitable for use as an idempotency key.
 * @since 0.5.0
 */
export function generateIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
