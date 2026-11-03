import type { Address, Attachment, Message } from "@upyo/core";
import type {
  CloudflareBindingAddress,
  CloudflareBindingAttachment,
  CloudflareBindingMessage,
} from "./binding.ts";
import {
  type PreparedMessage,
  readAttachments,
} from "./message-preparation.ts";

/**
 * Builds the Workers binding message, without attachments, from a message and
 * its prepared parts.
 *
 * Named addresses become `{ name, email }` objects, so names need no quoting.
 * Tags are ignored, and so are the `messageId` and `date` fields, because
 * Cloudflare generates both itself.
 *
 * @param message The Upyo message to convert.
 * @param prepared The message's checked headers and attachments.
 * @returns The binding message without attachments.
 */
export function buildBindingMessage(
  message: Message,
  prepared: PreparedMessage,
): CloudflareBindingMessage {
  return {
    from: formatAddress(message.sender),
    to: message.recipients.map(formatAddress),
    ...(message.ccRecipients.length > 0 && {
      cc: message.ccRecipients.map(formatAddress),
    }),
    ...(message.bccRecipients.length > 0 && {
      bcc: message.bccRecipients.map(formatAddress),
    }),
    // The binding takes a single reply-to address, so the first one is used.
    ...(message.replyRecipients.length > 0 && {
      replyTo: formatAddress(message.replyRecipients[0]),
    }),
    subject: message.subject,
    ...("html" in message.content
      ? {
          html: message.content.html,
          ...(message.content.text ? { text: message.content.text } : {}),
        }
      : { text: message.content.text }),
    ...(Object.keys(prepared.headers).length > 0 && {
      headers: { ...prepared.headers },
    }),
  };
}

/**
 * Reads attachments and converts them to the Workers binding format, with raw
 * bytes as content.  An inline part without a content ID is sent as a regular
 * attachment, because the binding requires a content ID for inline parts.
 * Errors come from reading the content, not from the message.
 *
 * @param attachments The attachments to convert.
 * @param signal Optional signal to cancel reading.
 * @returns The converted attachments.
 */
export async function convertBindingAttachments(
  attachments: readonly Attachment[],
  signal?: AbortSignal,
): Promise<CloudflareBindingAttachment[]> {
  const contents = await readAttachments(attachments, signal);
  return attachments.map((attachment, i) =>
    attachment.inline && attachment.contentId
      ? {
          disposition: "inline",
          contentId: attachment.contentId,
          filename: attachment.filename,
          type: attachment.contentType,
          content: contents[i],
        }
      : {
          disposition: "attachment",
          filename: attachment.filename,
          type: attachment.contentType,
          content: contents[i],
        },
  );
}

function formatAddress(address: Address): string | CloudflareBindingAddress {
  return address.name
    ? { name: address.name, email: address.address }
    : address.address;
}
