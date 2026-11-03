import type { Attachment, Message } from "@upyo/core";
import { createCalendarAttachment } from "@upyo/core/calendar";
import {
  combineSignals,
  readAttachmentContent,
  resolveThreadingHeaders,
} from "@upyo/core";
import { CloudflareValidationError } from "./errors.ts";

/**
 * The parts of a message that both the REST API and the Workers binding take
 * the same way, after the checks that both apply.
 */
export interface PreparedMessage {
  /**
   * Custom headers to send, already checked.
   */
  readonly headers: Readonly<Record<string, string>>;

  /**
   * The attachments to read and send, including the *invite.ics* part that
   * carries a calendar.
   */
  readonly attachments: readonly Attachment[];
}

/**
 * The most recipients Cloudflare accepts across `to`, `cc`, and `bcc`.  The
 * REST API answers more with a generic error that does not say what is wrong.
 */
const MAX_RECIPIENTS = 50;

/**
 * Checks a message against the rules Cloudflare verifiably enforces, and
 * resolves its headers and attachments.  It reads no attachment content, so
 * every error it throws is about the message itself.
 *
 * @param message The Upyo message to prepare.
 * @returns The checked headers and the attachments to send.
 * @throws {TypeError} If the message carries an invalid message identifier or
 *         calendar.
 * @throws {CloudflareValidationError} If the message has more than 50
 *         recipients, or a custom header is one that Cloudflare generates or
 *         expects in a message field.
 */
export function prepareMessage(message: Message): PreparedMessage {
  const recipientCount =
    message.recipients.length +
    message.ccRecipients.length +
    message.bccRecipients.length;
  if (recipientCount > MAX_RECIPIENTS) {
    throw new CloudflareValidationError(
      `A message can have at most ${MAX_RECIPIENTS} recipients across to, ` +
        `cc, and bcc, but this one has ${recipientCount}.`,
      "cloudflare.too_many_recipients",
    );
  }

  const headers = buildHeaders(message);
  validateHeaders(headers);

  // Neither API has a calendar field, so the scheduling payload travels as an
  // *invite.ics* attachment ahead of the caller's own files.
  const attachments =
    message.calendar == null
      ? message.attachments
      : [createCalendarAttachment(message.calendar), ...message.attachments];

  return { headers, attachments };
}

/**
 * Reads the content of attachments, in order.  Errors come from reading, such
 * as a failed fetch in a lazy attachment, not from the message.
 *
 * @param attachments The attachments to read.
 * @param signal Optional signal to cancel reading.
 * @returns The content of each attachment, in the same order.
 */
export async function readAttachments(
  attachments: readonly Attachment[],
  signal?: AbortSignal,
): Promise<readonly Uint8Array[]> {
  if (attachments.length < 1) return [];
  const cancellation = new AbortController();
  const combined = combineSignals(cancellation.signal, signal);
  try {
    return await Promise.all(
      attachments.map((attachment) =>
        readAttachmentContent(attachment.content, combined.signal),
      ),
    );
  } finally {
    cancellation.abort();
    combined.cleanup();
  }
}

/**
 * Collects the custom headers to send: the message's own, its reply threading,
 * and `X-Priority` from its priority.
 */
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
