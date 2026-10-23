import type { Address, Attachment, Message } from "@upyo/core";
import { CloudflareValidationError } from "./errors.ts";
import { createCalendarAttachment } from "@upyo/core/calendar";
import {
  combineSignals,
  readAttachmentContent,
  resolveThreadingHeaders,
} from "@upyo/core";

/**
 * Cloudflare address object, used for the sender and the reply-to address.
 */
interface CloudflareAddress {
  readonly address: string;
  readonly name?: string;
}

/**
 * Cloudflare attachment object structure.
 */
export interface CloudflareAttachment {
  readonly content: string; // base64 encoded
  readonly filename: string;
  readonly type: string;
  readonly disposition: "attachment" | "inline";
  readonly content_id?: string;
}

/**
 * Cloudflare Email Sending request body.
 */
export interface CloudflareEmail {
  readonly from: CloudflareAddress;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly bcc?: readonly string[];
  readonly reply_to?: CloudflareAddress;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly attachments?: readonly CloudflareAttachment[];
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * A message checked and converted except for its attachments, whose content
 * may still have to be read.
 */
export interface PreparedMessage {
  /**
   * The request body without attachments.
   */
  readonly email: CloudflareEmail;

  /**
   * The attachments to read and send, including the *invite.ics* part that
   * carries a calendar.
   */
  readonly attachments: readonly Attachment[];
}

/**
 * The most recipients Cloudflare accepts across `to`, `cc`, and `bcc`.  The
 * API answers more with a generic error that does not say what is wrong.
 */
const MAX_RECIPIENTS = 50;

/**
 * Checks a message and converts everything but its attachments.  It reads no
 * attachment content, so every error it throws is about the message itself.
 *
 * Recipients keep their display names.  Tags are not supported by the API and
 * are ignored, and so are the `messageId` and `date` fields, because
 * Cloudflare generates both itself.
 *
 * @param message The Upyo message to convert.
 * @returns The request body without attachments, and the attachments to send.
 * @throws {TypeError} If the message carries an invalid message identifier or
 *         calendar.
 * @throws {CloudflareValidationError} If the message has more than 50
 *         recipients, or a custom header is one that Cloudflare generates or
 *         expects in a message field.
 */
export function prepareMessage(message: Message): PreparedMessage {
  const recipientCount = message.recipients.length +
    message.ccRecipients.length + message.bccRecipients.length;
  if (recipientCount > MAX_RECIPIENTS) {
    throw new CloudflareValidationError(
      `A message can have at most ${MAX_RECIPIENTS} recipients across to, ` +
        `cc, and bcc, but this one has ${recipientCount}.`,
      "cloudflare.too_many_recipients",
    );
  }

  const headers = buildHeaders(message);
  validateHeaders(headers);

  // The API has no calendar field, so the scheduling payload travels as an
  // *invite.ics* attachment ahead of the caller's own files.
  const attachments = message.calendar == null
    ? message.attachments
    : [createCalendarAttachment(message.calendar), ...message.attachments];

  const email: CloudflareEmail = {
    from: formatAddress(message.sender),
    to: message.recipients.map(formatRecipient),
    ...(message.ccRecipients.length > 0 && {
      cc: message.ccRecipients.map(formatRecipient),
    }),
    ...(message.bccRecipients.length > 0 && {
      bcc: message.bccRecipients.map(formatRecipient),
    }),
    // The API accepts a single reply-to address, so the first one is used.
    ...(message.replyRecipients.length > 0 && {
      reply_to: formatAddress(message.replyRecipients[0]),
    }),
    subject: message.subject,
    ...("html" in message.content
      ? {
        html: message.content.html,
        ...(message.content.text ? { text: message.content.text } : {}),
      }
      : { text: message.content.text }),
    ...(Object.keys(headers).length > 0 && { headers }),
  };

  return { email, attachments };
}

/**
 * Reads attachments and converts them to the Cloudflare format.  Errors come
 * from reading the content, such as a failed fetch in a lazy attachment, not
 * from the message.
 *
 * @param attachments The attachments to convert.
 * @param signal Optional signal to cancel reading.
 * @returns The converted attachments.
 */
export async function convertAttachments(
  attachments: readonly Attachment[],
  signal?: AbortSignal,
): Promise<readonly CloudflareAttachment[]> {
  if (attachments.length < 1) return [];
  const cancellation = new AbortController();
  const combined = combineSignals(cancellation.signal, signal);
  try {
    return await Promise.all(
      attachments.map((attachment) =>
        convertAttachment(attachment, combined.signal)
      ),
    );
  } finally {
    cancellation.abort();
    combined.cleanup();
  }
}

/**
 * Converts an Upyo Message to the Cloudflare Email Sending API JSON format.
 * It combines {@link prepareMessage} and {@link convertAttachments}.
 *
 * @param message The Upyo message to convert.
 * @param options Optional conversion options.
 * @returns JSON object ready for Cloudflare API submission.
 * @throws {TypeError} If the message carries an invalid message identifier or
 *         calendar.
 * @throws {CloudflareValidationError} If the message has more than 50
 *         recipients, or a custom header is one that Cloudflare generates or
 *         expects in a message field.
 */
export async function convertMessage(
  message: Message,
  options: { readonly signal?: AbortSignal } = {},
): Promise<CloudflareEmail> {
  const { email, attachments } = prepareMessage(message);
  const converted = await convertAttachments(attachments, options.signal);
  return converted.length > 0 ? { ...email, attachments: converted } : email;
}

function buildHeaders(message: Message): Record<string, string> {
  const headers: Record<string, string> = {};

  // Reply threading comes from the typed fields when the message defines them,
  // and from a custom header otherwise.  A field the message owns but left
  // empty writes nothing, which is how a caller drops an inherited header.
  const threading = resolveThreadingHeaders(message);
  const ownedHeaders = new Set(
    [...threading.keys()].map((name) => name.toLowerCase()),
  );
  for (const [key, value] of message.headers.entries()) {
    if (!ownedHeaders.has(key.toLowerCase())) headers[key] = value;
  }
  for (const [name, value] of threading) {
    if (value != null) headers[name] = value;
  }

  // A priority header the message sets itself wins over the one derived from
  // `priority`, so that the request never carries the name twice.
  if (message.priority !== "normal" && !message.headers.has("X-Priority")) {
    headers["X-Priority"] = message.priority === "high" ? "1" : "5";
  }

  return headers;
}

/**
 * Formats a recipient as `Name <address>`, or as the bare address when it has
 * no name.  A name with characters that are special in an address list is
 * quoted.
 */
function formatRecipient(address: Address): string {
  if (!address.name) return address.address;
  const name = /^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]+$/.test(address.name)
    ? address.name
    : `"${address.name.replace(/[\\"]/g, "\\$&")}"`;
  return `${name} <${address.address}>`;
}

function formatAddress(address: Address): CloudflareAddress {
  return address.name
    ? { address: address.address, name: address.name }
    : { address: address.address };
}

async function convertAttachment(
  attachment: Attachment,
  signal?: AbortSignal,
): Promise<CloudflareAttachment> {
  const content = await readAttachmentContent(attachment.content, signal);
  return {
    content: toBase64(content),
    filename: attachment.filename,
    type: attachment.contentType,
    disposition: attachment.inline ? "inline" : "attachment",
    ...(attachment.inline && attachment.contentId
      ? { content_id: attachment.contentId }
      : {}),
  };
}

function toBase64(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars[(bitmap >> 18) & 63] + chars[(bitmap >> 12) & 63] +
      chars[(bitmap >> 6) & 63] + chars[bitmap & 63];
  }
  const remainder = bytes.length % 3;
  return remainder === 0
    ? result
    : result.slice(0, remainder - 3) + "=".repeat(3 - remainder);
}

/**
 * Headers that Cloudflare generates itself.  Sending one makes the API reject
 * the whole request, so a message carrying one is rejected before sending
 * instead of having the header dropped without notice.
 */
const PLATFORM_HEADERS: ReadonlySet<string> = new Set([
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "dkim-signature",
  "return-path",
  "received",
  "feedback-id",
  "tls-required",
  "tls-report-domain",
  "tls-report-submitter",
  "cfbl-address",
  "cfbl-feedback-id",
]);

/**
 * Headers that Cloudflare expects through dedicated API fields, mapped to the
 * message field that carries them.
 */
const FIELD_HEADERS: ReadonlyMap<string, string> = new Map([
  ["from", "sender"],
  ["to", "recipients"],
  ["cc", "ccRecipients"],
  ["bcc", "bccRecipients"],
  ["subject", "subject"],
  ["reply-to", "replyRecipients"],
]);

/**
 * Rejects the custom headers that Cloudflare answers with an error, so that
 * the message fails with a message that names the header.  Everything else,
 * such as which other headers are on Cloudflare's allowlist and its limits on
 * header names, values, and total size, is left to Cloudflare, which reports
 * it in its response and may change it.
 *
 * @throws {CloudflareValidationError} If a header is one that Cloudflare
 *         generates or expects in a message field.
 */
function validateHeaders(headers: Readonly<Record<string, string>>): void {
  for (const name of Object.keys(headers)) {
    const lowered = name.toLowerCase();
    if (PLATFORM_HEADERS.has(lowered) || lowered.startsWith("arc-")) {
      throw new CloudflareValidationError(
        `Header ${name} is generated by Cloudflare and cannot be set.`,
        "cloudflare.header_not_allowed",
      );
    }
    const field = FIELD_HEADERS.get(lowered);
    if (field != null) {
      throw new CloudflareValidationError(
        `Header ${name} cannot be set as a custom header; use the ${field} ` +
          "field of the message instead.",
        "cloudflare.header_use_api_field",
      );
    }
  }
}
