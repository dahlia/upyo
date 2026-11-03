import type { Address, Attachment, Message } from "@upyo/core";
import {
  type PreparedMessage,
  prepareMessage,
  readAttachments,
} from "./message-preparation.ts";

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
 * Cloudflare Email Sending REST API request body.
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
 * Builds the REST API request body, without attachments, from a message and
 * its prepared parts.
 *
 * Recipients keep their display names.  Tags are not supported by the API and
 * are ignored, and so are the `messageId` and `date` fields, because
 * Cloudflare generates both itself.
 *
 * @param message The Upyo message to convert.
 * @param prepared The message's checked headers and attachments.
 * @returns The request body without attachments.
 */
export function buildEmail(
  message: Message,
  prepared: PreparedMessage,
): CloudflareEmail {
  return {
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
    ...(Object.keys(prepared.headers).length > 0 && {
      headers: prepared.headers,
    }),
  };
}

/**
 * Reads attachments and converts them to the REST API format.  Errors come
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
  const contents = await readAttachments(attachments, signal);
  // Cloudflare rejects an inline part without a content ID, and nothing could
  // refer to it anyway, so it goes as a regular attachment.
  return attachments.map((attachment, i) => ({
    content: toBase64(contents[i]),
    filename: attachment.filename,
    type: attachment.contentType,
    ...(attachment.inline && attachment.contentId
      ? { disposition: "inline", content_id: attachment.contentId }
      : { disposition: "attachment" }),
  }));
}

/**
 * Converts an Upyo Message to the REST API JSON format.  It combines
 * `prepareMessage()`, {@link buildEmail}, and {@link convertAttachments}.
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
  const prepared = prepareMessage(message);
  const email = buildEmail(message, prepared);
  const attachments = await convertAttachments(
    prepared.attachments,
    options.signal,
  );
  return attachments.length > 0 ? { ...email, attachments } : email;
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

function toBase64(bytes: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result +=
      chars[(bitmap >> 18) & 63] +
      chars[(bitmap >> 12) & 63] +
      chars[(bitmap >> 6) & 63] +
      chars[bitmap & 63];
  }
  const remainder = bytes.length % 3;
  return remainder === 0
    ? result
    : result.slice(0, remainder - 3) + "=".repeat(3 - remainder);
}
