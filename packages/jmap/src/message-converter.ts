import type { Address, Attachment, Message, Priority } from "@upyo/core";
import { parseMessageId } from "@upyo/core/message-id";

/**
 * JMAP email address structure.
 * @since 0.4.0
 */
export interface JmapEmailAddress {
  readonly email: string;
  readonly name?: string;
}

/**
 * JMAP body part structure for multipart messages.
 * @since 0.4.0
 */
export interface JmapBodyPart {
  readonly partId?: string;
  readonly blobId?: string;
  readonly type: string;
  readonly charset?: string;
  readonly subParts?: readonly JmapBodyPart[];
  readonly name?: string;
  readonly disposition?: "inline" | "attachment";
  readonly cid?: string;
  readonly size?: number;
}

/**
 * JMAP body value for text content.
 * @since 0.4.0
 */
export interface JmapBodyValue {
  readonly value: string;
  readonly isEncodingProblem?: boolean;
  readonly isTruncated?: boolean;
}

/**
 * JMAP header structure.
 * @since 0.4.0
 */
export interface JmapHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * JMAP Email/set create request structure.
 * @since 0.4.0
 */
export interface JmapEmailCreate {
  readonly mailboxIds: Record<string, boolean>;
  readonly keywords?: Record<string, boolean>;
  readonly from: readonly JmapEmailAddress[];
  readonly to?: readonly JmapEmailAddress[];
  readonly cc?: readonly JmapEmailAddress[];
  readonly bcc?: readonly JmapEmailAddress[];
  readonly replyTo?: readonly JmapEmailAddress[];
  readonly subject: string;
  readonly bodyStructure?: JmapBodyPart;
  readonly bodyValues: Record<string, JmapBodyValue>;

  /**
   * The message identifier, as the single-entry array RFC 8621 §4.1.3 uses.
   * The identifier is bare: the `asMessageIds` form these properties alias
   * strips the angle brackets.
   * @since 0.6.0
   */
  readonly messageId?: readonly string[];

  /**
   * The bare identifiers of the messages this one replies to.
   * @since 0.6.0
   */
  readonly inReplyTo?: readonly string[];

  /**
   * The bare identifiers of the conversation this message belongs to.
   * @since 0.6.0
   */
  readonly references?: readonly string[];

  /**
   * The origination date, as an RFC 3339 date-time.
   * @since 0.6.0
   */
  readonly sentAt?: string;

  /**
   * A header field written as an individual property, which is the only form
   * RFC 8621 §4.6 allows when creating an `Email`.  A field that has a
   * structured property above must not also appear here.
   * @since 0.6.0
   */
  readonly [name: `header:${string}`]: string | undefined;
}

/**
 * Formats an Upyo Address to JMAP email address format.
 * @param address The Upyo address to format.
 * @returns The JMAP email address object.
 * @since 0.4.0
 */
export function formatAddress(address: Address): JmapEmailAddress {
  const result: JmapEmailAddress = {
    email: address.address,
  };

  if (address.name) {
    return { ...result, name: address.name };
  }

  return result;
}

/**
 * Gets priority headers based on message priority.
 * @param priority The message priority.
 * @returns Array of JMAP headers for priority, or empty array for normal.
 * @since 0.4.0
 */
export function getPriorityHeaders(priority: Priority): readonly JmapHeader[] {
  switch (priority) {
    case "high":
      return [
        { name: "X-Priority", value: "1" },
        { name: "Importance", value: "high" },
      ];
    case "low":
      return [
        { name: "X-Priority", value: "5" },
        { name: "Importance", value: "low" },
      ];
    default:
      return [];
  }
}

/**
 * Header field names that must not be written as a raw header property.
 *
 * RFC 8621 §4.6 forbids two properties representing the same header field, and
 * the `Email` here already carries a structured property for each of these.
 * `Bcc` matters most: it travels in the submission envelope, so writing it into
 * the message would disclose recipients meant to stay hidden.  `Content-*`
 * belongs on an `EmailBodyPart` rather than on the `Email`.
 */
const structuredHeaders: ReadonlySet<string> = new Set([
  "bcc",
  "cc",
  "from",
  "mime-version",
  "reply-to",
  "subject",
  "to",
]);

/**
 * Extracts the custom headers of a message, dropping those the `Email` object
 * expresses through a structured property of its own.
 *
 * @param message The message to extract headers from.
 * @returns Array of JMAP headers.
 * @throws {TypeError} If a header value contains a carriage return or line
 * feed, which would forge further header fields.
 * @since 0.4.0
 */
export function extractCustomHeaders(message: Message): readonly JmapHeader[] {
  const headers: JmapHeader[] = [];

  for (const [name, value] of message.headers.entries()) {
    const lowered = name.toLowerCase();
    if (structuredHeaders.has(lowered) || lowered.startsWith("content-")) {
      continue;
    }
    if (/[\r\n]/.test(value)) {
      throw new TypeError(
        `Header field ${name} must not contain a carriage return or line feed.`,
      );
    }
    headers.push({ name, value });
  }

  return headers;
}

/**
 * Builds body structure for the message content.
 * @param message The message to build body structure for.
 * @param uploadedBlobs Map of contentId to blobId for attachments.
 * @returns Object containing bodyStructure and bodyValues.
 * @since 0.4.0
 */
export function buildBodyStructure(
  message: Message,
  uploadedBlobs: Map<string, string>,
): { bodyStructure: JmapBodyPart; bodyValues: Record<string, JmapBodyValue> } {
  const bodyValues: Record<string, JmapBodyValue> = {};
  const parts: JmapBodyPart[] = [];

  // Text part (charset is inferred from bodyValues, not specified with partId)
  if ("text" in message.content && message.content.text) {
    bodyValues["text"] = { value: message.content.text };
    parts.push({ partId: "text", type: "text/plain; charset=utf-8" });
  }

  // HTML part
  if ("html" in message.content && message.content.html) {
    bodyValues["html"] = { value: message.content.html };
    parts.push({ partId: "html", type: "text/html; charset=utf-8" });
  }

  let contentPart: JmapBodyPart;

  if (parts.length === 1) {
    // Simple single-part message
    contentPart = parts[0];
  } else if (parts.length > 1) {
    // multipart/alternative for text + HTML
    contentPart = {
      type: "multipart/alternative",
      subParts: parts,
    };
  } else {
    // Fallback to empty text
    bodyValues["text"] = { value: "" };
    contentPart = { partId: "text", type: "text/plain; charset=utf-8" };
  }

  // Separate inline and regular attachments
  const inlineParts = buildInlineAttachmentParts(
    message.attachments,
    uploadedBlobs,
  );
  const attachmentParts = buildAttachmentParts(
    message.attachments,
    uploadedBlobs,
  );

  // If there are inline attachments, wrap content in multipart/related
  let mainBodyPart: JmapBodyPart;
  if (inlineParts.length > 0) {
    mainBodyPart = {
      type: "multipart/related",
      subParts: [contentPart, ...inlineParts],
    };
  } else {
    mainBodyPart = contentPart;
  }

  let bodyStructure: JmapBodyPart;

  // If there are regular attachments, wrap in multipart/mixed
  if (attachmentParts.length > 0) {
    bodyStructure = {
      type: "multipart/mixed",
      subParts: [mainBodyPart, ...attachmentParts],
    };
  } else {
    bodyStructure = mainBodyPart;
  }

  return { bodyStructure, bodyValues };
}

/**
 * Build inline attachment parts from uploaded blobs.
 * @param attachments Array of attachments from the message.
 * @param uploadedBlobs Map of contentId to blobId.
 * @returns Array of JmapBodyPart for inline attachments.
 * @since 0.4.0
 */
function buildInlineAttachmentParts(
  attachments: readonly Attachment[],
  uploadedBlobs: Map<string, string>,
): JmapBodyPart[] {
  const parts: JmapBodyPart[] = [];

  for (const attachment of attachments) {
    const blobId = uploadedBlobs.get(attachment.contentId);
    if (!blobId) continue;

    if (attachment.inline) {
      parts.push({
        type: attachment.contentType,
        blobId,
        name: attachment.filename,
        disposition: "inline",
        cid: attachment.contentId,
      });
    }
  }

  return parts;
}

/**
 * Build regular attachment parts from uploaded blobs.
 * @param attachments Array of attachments from the message.
 * @param uploadedBlobs Map of contentId to blobId.
 * @returns Array of JmapBodyPart for regular attachments.
 * @since 0.4.0
 */
function buildAttachmentParts(
  attachments: readonly Attachment[],
  uploadedBlobs: Map<string, string>,
): JmapBodyPart[] {
  const parts: JmapBodyPart[] = [];

  for (const attachment of attachments) {
    const blobId = uploadedBlobs.get(attachment.contentId);
    if (!blobId) continue;

    if (!attachment.inline) {
      parts.push({
        type: attachment.contentType,
        blobId,
        name: attachment.filename,
        disposition: "attachment",
      });
    }
  }

  return parts;
}

/**
 * Converts an Upyo Message to JMAP Email/set create format.
 * @param message The Upyo message to convert.
 * @param draftMailboxId The mailbox ID to store the draft in.
 * @param uploadedBlobs Map of contentId to blobId for attachments.
 * @returns The JMAP Email/set create object.
 * @throws {TypeError} If the message carries an invalid message identifier or
 * date, or a header value containing a carriage return or line feed.
 * @throws {RangeError} If the year of the date is outside what an RFC 3339
 * date-time can express.
 * @since 0.4.0
 */
export function convertMessage(
  message: Message,
  draftMailboxId: string,
  uploadedBlobs: Map<string, string>,
): JmapEmailCreate {
  const { bodyStructure, bodyValues } = buildBodyStructure(
    message,
    uploadedBlobs,
  );

  const identity = resolveIdentity(message);

  // RFC 8621 §4.6 allows only individual `header:Name` properties on create,
  // never the `headers` list, and forbids a raw header that duplicates a
  // structured property.
  const headerProperties: Record<string, string> = {};
  for (const { name, value } of getPriorityHeaders(message.priority)) {
    headerProperties[`header:${name}`] = value;
  }
  for (const { name, value } of extractCustomHeaders(message)) {
    if (identity.owned.has(name.toLowerCase())) continue;
    headerProperties[`header:${name}`] = value;
  }

  const email: JmapEmailCreate = {
    mailboxIds: { [draftMailboxId]: true },
    from: [formatAddress(message.sender)],
    subject: message.subject,
    bodyStructure,
    bodyValues,
    ...(message.recipients.length > 0 && {
      to: message.recipients.map(formatAddress),
    }),
    ...(message.ccRecipients.length > 0 && {
      cc: message.ccRecipients.map(formatAddress),
    }),
    ...(message.bccRecipients.length > 0 && {
      bcc: message.bccRecipients.map(formatAddress),
    }),
    ...(message.replyRecipients.length > 0 && {
      replyTo: message.replyRecipients.map(formatAddress),
    }),
    ...identity.properties,
    ...headerProperties,
  };

  return email;
}

/**
 * The identity and threading properties an `Email` carries, along with the
 * header field names the message owns and must not repeat as a raw header.
 */
interface JmapIdentity {
  readonly properties: {
    readonly messageId?: readonly string[];
    readonly inReplyTo?: readonly string[];
    readonly references?: readonly string[];
    readonly sentAt?: string;
  };
  readonly owned: ReadonlySet<string>;
}

/**
 * Works out the identity and threading properties of an `Email` from the typed
 * fields of a message.
 *
 * A field the message leaves unset is not owned, so a header supplied through
 * {@link Message.headers} still reaches the server, and the server falls back
 * to generating an identifier and a date of its own.  A threading field set to
 * an empty list is owned but writes no property, which suppresses such a
 * header.
 *
 * @param message The message being converted.
 * @returns The properties to set, and the field names the message owns.
 * @throws {TypeError} If a message identifier is invalid, or the date is not a
 * valid one.
 * @throws {RangeError} If the year of the date is outside what an RFC 3339
 * date-time can express.
 */
function resolveIdentity(message: Message): JmapIdentity {
  const owned = new Set<string>();
  const properties: {
    messageId?: readonly string[];
    inReplyTo?: readonly string[];
    references?: readonly string[];
    sentAt?: string;
  } = {};

  if (message.priority !== "normal") {
    owned.add("x-priority");
    owned.add("importance");
  }
  if (message.messageId != null) {
    owned.add("message-id");
    properties.messageId = [checkMessageId(message.messageId)];
  }
  if (message.date != null) {
    owned.add("date");
    properties.sentAt = formatSentAt(message.date);
  }
  if (message.inReplyTo != null) {
    owned.add("in-reply-to");
    if (message.inReplyTo.length > 0) {
      properties.inReplyTo = message.inReplyTo.map(checkMessageId);
    }
  }
  if (message.references != null) {
    owned.add("references");
    if (message.references.length > 0) {
      properties.references = message.references.map(checkMessageId);
    }
  }

  return { properties, owned };
}

/**
 * Checks a message identifier a message carries.
 *
 * `createMessage()` validates these, but `Message` is a structural type that a
 * caller can build without it.
 *
 * @param id The identifier to check.
 * @returns The identifier, unchanged.
 * @throws {TypeError} If the value is not a valid message identifier.
 */
function checkMessageId(id: string): string {
  const parsed = parseMessageId(id);
  if (parsed == null) {
    throw new TypeError(`Invalid message ID: ${JSON.stringify(id)}`);
  }
  return parsed;
}

/**
 * Formats a date as the RFC 3339 date-time JMAP calls a `Date`.
 *
 * RFC 8620 §1.4 omits a fractional-seconds part that is zero, which
 * `Date.toISOString()` always writes.
 *
 * @param date The date to format.
 * @returns The formatted date.
 * @throws {TypeError} If the date is not a valid one.
 * @throws {RangeError} If its year cannot be written as four digits.
 */
function formatSentAt(date: Date): string {
  const time = date instanceof Date ? date.getTime() : Number.NaN;
  if (Number.isNaN(time)) {
    throw new TypeError(`Invalid date: ${JSON.stringify(date)}`);
  }
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) {
    throw new RangeError(`Year out of range for an RFC 3339 date: ${year}`);
  }
  return date.toISOString().replace(".000Z", "Z");
}
