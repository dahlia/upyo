import type { Address, Attachment, Message } from "@upyo/core";
import {
  type PreparedMessage,
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

/**
 * Formats the sender or reply-to address as a REST API address object.
 */
function formatAddress(address: Address): CloudflareAddress {
  return address.name
    ? { address: address.address, name: address.name }
    : { address: address.address };
}

/**
 * `Uint8Array.prototype.toBase64()`, which TypeScript's libraries do not
 * declare yet and not every runtime has.
 */
interface NativeBase64Converter {
  toBase64?: () => string;
}

/**
 * Encodes bytes as base64 with the runtime's native encoder when it has one,
 * which is far faster for a large attachment, and with `btoa()` over 32 KiB
 * chunks otherwise.
 */
function toBase64(bytes: Uint8Array): string {
  const candidate: Uint8Array & NativeBase64Converter = bytes;
  if (typeof candidate.toBase64 === "function") return candidate.toBase64();
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(chunks.join(""));
}
