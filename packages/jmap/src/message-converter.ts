import type { Address, Message, Priority } from "@upyo/core";

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
  readonly headers?: readonly JmapHeader[];
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
 * Extracts custom headers from message headers.
 * @param message The message to extract headers from.
 * @returns Array of JMAP headers.
 * @since 0.4.0
 */
export function extractCustomHeaders(message: Message): readonly JmapHeader[] {
  const headers: JmapHeader[] = [];

  for (const [name, value] of message.headers.entries()) {
    headers.push({ name, value });
  }

  return headers;
}

/**
 * Builds body structure for the message content.
 * @param message The message to build body structure for.
 * @param _uploadedBlobs Map of contentId to blobId for attachments.
 * @returns Object containing bodyStructure and bodyValues.
 * @since 0.4.0
 */
export function buildBodyStructure(
  message: Message,
  _uploadedBlobs: Map<string, string>,
): { bodyStructure: JmapBodyPart; bodyValues: Record<string, JmapBodyValue> } {
  const bodyValues: Record<string, JmapBodyValue> = {};
  const parts: JmapBodyPart[] = [];

  // Text part
  if ("text" in message.content && message.content.text) {
    bodyValues["text"] = { value: message.content.text };
    parts.push({ partId: "text", type: "text/plain", charset: "utf-8" });
  }

  // HTML part
  if ("html" in message.content && message.content.html) {
    bodyValues["html"] = { value: message.content.html };
    parts.push({ partId: "html", type: "text/html", charset: "utf-8" });
  }

  let bodyStructure: JmapBodyPart;

  if (parts.length === 1) {
    // Simple single-part message
    bodyStructure = parts[0];
  } else if (parts.length > 1) {
    // multipart/alternative for text + HTML
    bodyStructure = {
      type: "multipart/alternative",
      subParts: parts,
    };
  } else {
    // Fallback to empty text
    bodyValues["text"] = { value: "" };
    bodyStructure = { partId: "text", type: "text/plain", charset: "utf-8" };
  }

  return { bodyStructure, bodyValues };
}

/**
 * Converts an Upyo Message to JMAP Email/set create format.
 * @param message The Upyo message to convert.
 * @param draftMailboxId The mailbox ID to store the draft in.
 * @param uploadedBlobs Map of contentId to blobId for attachments.
 * @returns The JMAP Email/set create object.
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

  const headers: JmapHeader[] = [];

  // Add priority headers
  if (message.priority !== "normal") {
    headers.push(...getPriorityHeaders(message.priority));
  }

  // Add custom headers
  headers.push(...extractCustomHeaders(message));

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
    ...(headers.length > 0 && { headers }),
  };

  return email;
}
