import type { Address, Attachment, Message } from "@upyo/core";
import type { ResolvedMailerooConfig } from "./config.ts";

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
 * Maileroo email address object.
 *
 * @since 0.6.0
 */
export interface MailerooEmailAddress {
  /** Email address. */
  readonly address: string;
  /** Optional display name. */
  readonly display_name?: string;
}

/**
 * Maileroo attachment object.
 *
 * @since 0.6.0
 */
export interface MailerooAttachment {
  /** Attachment filename or inline content ID. */
  readonly file_name: string;
  /** Attachment MIME type. */
  readonly content_type?: string;
  /** Base64-encoded attachment content. */
  readonly content: string;
  /** Whether this attachment is treated as inline content. */
  readonly inline?: boolean;
}

/**
 * Maileroo email object structure for API requests.
 *
 * @since 0.6.0
 */
export interface MailerooEmail {
  readonly from: MailerooEmailAddress;
  readonly to: MailerooEmailAddress | readonly MailerooEmailAddress[];
  readonly cc?: MailerooEmailAddress | readonly MailerooEmailAddress[];
  readonly bcc?: MailerooEmailAddress | readonly MailerooEmailAddress[];
  readonly reply_to?: MailerooEmailAddress | readonly MailerooEmailAddress[];
  readonly subject: string;
  readonly html?: string;
  readonly plain?: string;
  readonly tracking?: boolean;
  readonly tags?: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly attachments?: readonly MailerooAttachment[];
}

/**
 * Converts an Upyo message to Maileroo API JSON format.
 *
 * @param message The Upyo message to convert.
 * @param config The resolved Maileroo configuration.
 * @param signal Optional abort signal for cancellation.
 * @returns JSON object ready for Maileroo API submission.
 * @throws {Error} If the caller aborts the operation.
 * @since 0.6.0
 */
export async function convertMessage(
  message: Message,
  config: ResolvedMailerooConfig,
  signal?: AbortSignal,
): Promise<MailerooEmail> {
  signal?.throwIfAborted();

  const emailData: MutableMailerooEmail = {
    from: convertAddress(message.sender),
    to: convertAddressList(message.recipients),
    subject: message.subject,
  };

  const cc = convertOptionalAddressList(message.ccRecipients);
  if (cc !== undefined) emailData.cc = cc;

  const bcc = convertOptionalAddressList(message.bccRecipients);
  if (bcc !== undefined) emailData.bcc = bcc;

  const replyTo = convertOptionalAddressList(message.replyRecipients);
  if (replyTo !== undefined) emailData.reply_to = replyTo;

  if ("html" in message.content) {
    emailData.html = message.content.html;
    if (message.content.text !== undefined) {
      emailData.plain = message.content.text;
    }
  } else {
    emailData.plain = message.content.text;
  }

  if (config.tracking !== undefined) {
    emailData.tracking = config.tracking;
  }

  const tags = convertTags(message, config);
  if (Object.keys(tags).length > 0) {
    emailData.tags = tags;
  }

  const headers = convertHeaders(message);
  if (Object.keys(headers).length > 0) {
    emailData.headers = headers;
  }

  if (message.attachments.length > 0) {
    emailData.attachments = await Promise.all(
      message.attachments.map((attachment) =>
        convertAttachment(
          attachment,
          signal,
        )
      ),
    );
  }

  signal?.throwIfAborted();

  return emailData;
}

type MutableMailerooEmail = {
  -readonly [Key in keyof MailerooEmail]: MailerooEmail[Key];
};

interface Base64Options {
  readonly alphabet?: "base64" | "base64url";
  readonly omitPadding?: boolean;
}

interface NativeBase64Converter {
  toBase64?: (options?: Base64Options) => string;
}

interface BufferConstructorLike {
  from?: (
    buffer: ArrayBufferLike,
    byteOffset: number,
    byteLength: number,
  ) => unknown;
}

function convertAddress(address: Address): MailerooEmailAddress {
  return address.name == null || address.name === ""
    ? { address: address.address }
    : { address: address.address, display_name: address.name };
}

function convertAddressList(
  addresses: readonly Address[],
): MailerooEmailAddress | readonly MailerooEmailAddress[] {
  const converted = addresses.map(convertAddress);
  return converted.length === 1 ? converted[0] : converted;
}

function convertOptionalAddressList(
  addresses: readonly Address[],
): MailerooEmailAddress | readonly MailerooEmailAddress[] | undefined {
  return addresses.length === 0 ? undefined : convertAddressList(addresses);
}

function convertTags(
  message: Message,
  config: ResolvedMailerooConfig,
): Record<string, string> {
  const tags = config.tags == null ? {} : { ...config.tags };

  for (const [index, tag] of message.tags.entries()) {
    tags[`tag${index + 1}`] = tag;
  }

  return tags;
}

function convertHeaders(message: Message): Record<string, string> {
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

  return headers;
}

async function convertAttachment(
  attachment: Attachment,
  signal?: AbortSignal,
): Promise<MailerooAttachment> {
  signal?.throwIfAborted();
  const content = await waitForAttachmentContent(attachment.content, signal);
  signal?.throwIfAborted();
  return {
    file_name: getAttachmentFileName(attachment),
    content_type: attachment.contentType,
    content: uint8ArrayToBase64(content),
    inline: attachment.inline || undefined,
  };
}

function waitForAttachmentContent(
  content: Uint8Array | Promise<Uint8Array>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (content instanceof Uint8Array) {
    return signal?.aborted
      ? Promise.reject(abortReason(signal))
      : Promise.resolve(content);
  }
  if (signal == null) return content;
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(content).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException("The operation was aborted.", "AbortError");
}

function getAttachmentFileName(attachment: Attachment): string {
  return attachment.inline &&
      typeof attachment.contentId === "string" &&
      attachment.contentId !== ""
    ? attachment.contentId
    : attachment.filename;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const nativeToBase64 = getNativeToBase64(bytes);
  if (nativeToBase64 != null) {
    return nativeToBase64();
  }

  const bufferBase64 = getBufferBase64(bytes);
  if (bufferBase64 != null) {
    return bufferBase64;
  }

  const chunkSize = 4096;
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

function getBufferBase64(bytes: Uint8Array): string | undefined {
  const candidate = (globalThis as typeof globalThis & {
    readonly Buffer?: BufferConstructorLike;
  }).Buffer;
  if (typeof candidate?.from !== "function") return undefined;

  try {
    const buffer = candidate.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    if (
      buffer == null ||
      typeof (buffer as { toString?: unknown }).toString !== "function"
    ) {
      return undefined;
    }
    const base64 = (buffer as { toString: (encoding: "base64") => unknown })
      .toString("base64");
    return typeof base64 === "string" ? base64 : undefined;
  } catch {
    return undefined;
  }
}

function isStandardHeader(headerName: string): boolean {
  return STANDARD_HEADERS.has(headerName.toLowerCase());
}
