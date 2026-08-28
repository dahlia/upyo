import type { Address, Message } from "@upyo/core";
import { Buffer } from "node:buffer";
import type { ResolvedSmtpDsn } from "./delivery-status.ts";
import { type DkimConfig, signMessage } from "./dkim/index.ts";

export interface SmtpMessage {
  readonly envelope: SmtpEnvelope;
  readonly raw: string;
}

export interface SmtpEnvelope {
  readonly from: string;
  readonly to: string[];
  readonly dsn?: ResolvedSmtpDsn;
}

/**
 * Converts a message to its SMTP envelope and wire representation.
 *
 * @param message The message to convert.
 * @param dkimConfig Optional DKIM signing configuration.
 * @param dsn Optional validated SMTP delivery status notification parameters.
 * @returns The converted SMTP message.
 * @throws {RangeError} If a header contains a token that cannot be folded
 * within the RFC 5322 hard line-length limit.
 */
export async function convertMessage(
  message: Message,
  dkimConfig?: DkimConfig,
  dsn?: ResolvedSmtpDsn,
): Promise<SmtpMessage> {
  const envelope: SmtpEnvelope = {
    from: message.sender.address,
    to: [
      ...message.recipients.map((r) => r.address),
      ...message.ccRecipients.map((r) => r.address),
      ...message.bccRecipients.map((r) => r.address),
    ],
    dsn,
  };

  let raw = await buildRawMessage(message);

  // Apply DKIM signing if configured
  if (dkimConfig) {
    try {
      for (const sig of dkimConfig.signatures) {
        const result = await signMessage(raw, sig);
        raw = `${result.headerName}: ${result.signature}\r\n${raw}`;
      }
    } catch (error) {
      if (dkimConfig.onSigningFailure === "send-unsigned") {
        console.warn("DKIM signing failed, sending unsigned:", error);
      } else {
        throw error;
      }
    }
  }

  return { envelope, raw };
}

async function buildRawMessage(message: Message): Promise<string> {
  const lines: string[] = [];
  const boundary = generateBoundary();
  const hasAttachments = message.attachments.length > 0;
  const hasHtml = "html" in message.content;
  const hasText = "text" in message.content;
  const isMultipart = hasAttachments || (hasHtml && hasText);

  // Standard headers
  lines.push(foldHeader("From", encodeAddress(message.sender)));
  lines.push(
    foldHeader("To", message.recipients.map(encodeAddress).join(", ")),
  );

  if (message.ccRecipients.length > 0) {
    lines.push(
      foldHeader(
        "Cc",
        message.ccRecipients.map(encodeAddress).join(", "),
      ),
    );
  }

  if (message.replyRecipients.length > 0) {
    lines.push(
      foldHeader(
        "Reply-To",
        message.replyRecipients.map(encodeAddress).join(", "),
      ),
    );
  }

  lines.push(foldHeader("Subject", encodeHeaderValue(message.subject, true)));
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${generateMessageId()}>`);

  // Priority header
  if (message.priority !== "normal") {
    const priorityValue = message.priority === "high" ? "1" : "5";
    lines.push(`X-Priority: ${priorityValue}`);
    lines.push(
      `X-MSMail-Priority: ${message.priority === "high" ? "High" : "Low"}`,
    );
  }

  // Custom headers
  for (const [key, value] of message.headers) {
    lines.push(foldHeader(key, encodeHeaderValue(value)));
  }

  // MIME headers
  lines.push("MIME-Version: 1.0");

  if (isMultipart) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");
    lines.push("This is a multi-part message in MIME format.");
    lines.push("");

    // Content part
    lines.push(`--${boundary}`);

    if (hasHtml && hasText) {
      const contentBoundary = generateBoundary();
      lines.push(
        `Content-Type: multipart/alternative; boundary="${contentBoundary}"`,
      );
      lines.push("");

      // Text part
      lines.push(`--${contentBoundary}`);
      lines.push("Content-Type: text/plain; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.text!));
      lines.push("");

      // HTML part
      lines.push(`--${contentBoundary}`);
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.html));
      lines.push("");

      lines.push(`--${contentBoundary}--`);
    } else if (hasHtml) {
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.html));
    } else {
      lines.push("Content-Type: text/plain; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.text));
    }

    // Attachments
    for (const attachment of message.attachments) {
      lines.push("");
      lines.push(`--${boundary}`);
      lines.push(
        foldHeader(
          "Content-Type",
          `${attachment.contentType}; ${
            encodeMimeParameter("name", attachment.filename)
          }`,
        ),
      );
      lines.push("Content-Transfer-Encoding: base64");

      if (attachment.inline) {
        lines.push(
          foldHeader(
            "Content-Disposition",
            `inline; ${encodeMimeParameter("filename", attachment.filename)}`,
          ),
        );
        lines.push(`Content-ID: <${attachment.contentId}>`);
      } else {
        lines.push(
          foldHeader(
            "Content-Disposition",
            `attachment; ${
              encodeMimeParameter("filename", attachment.filename)
            }`,
          ),
        );
      }

      lines.push("");
      lines.push(encodeBase64(await attachment.content));
    }

    lines.push("");
    lines.push(`--${boundary}--`);
  } else {
    // Single part message
    if (hasHtml) {
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.html));
    } else {
      lines.push("Content-Type: text/plain; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(encodeQuotedPrintable(message.content.text));
    }
  }

  return lines.join("\r\n");
}

function generateBoundary(): string {
  return `boundary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateMessageId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}.${random}@upyo.local`;
}

function encodeAddress(address: Address): string {
  if (address.name == null) {
    // No display name, just return the email address
    return address.address;
  }

  // Encode only the display name part, leave email address as-is
  const encodedDisplayName = encodeHeaderValue(address.name, true);
  return `${encodedDisplayName} <${address.address}>`;
}

function encodeHeaderValue(
  value: string,
  encodeLongAsciiWords = false,
): string {
  // RFC 2047 encoding for non-ASCII characters in headers
  const hasLongWord = value.split(/\s+/).some((word) => word.length > 60);
  if (
    !/^[\x20-\x7E]*$/.test(value) ||
    (encodeLongAsciiWords && hasLongWord)
  ) {
    const encodeWord = (text: string): string => {
      const utf8Bytes = new TextEncoder().encode(text);
      const base64 = Buffer.from(utf8Bytes).toString("base64");
      return `=?UTF-8?B?${base64}?=`;
    };
    const maxEncodedLength = 75;
    const encodedWord = encodeWord(value);

    if (encodedWord.length <= maxEncodedLength) {
      return encodedWord;
    }

    const words: string[] = [];
    let currentText = "";

    for (const character of value) {
      const candidate = currentText + character;
      if (encodeWord(candidate).length <= maxEncodedLength) {
        currentText = candidate;
      } else {
        if (currentText.length > 0) {
          words.push(encodeWord(currentText));
        }
        currentText = character;
      }
    }

    if (currentText.length > 0) {
      words.push(encodeWord(currentText));
    }

    return words.join(" ");
  }
  return value;
}

function encodeMimeParameter(name: string, value: string): string {
  const escapedValue = value.replace(/[\\"]/g, "\\$&");
  const quotedParameter = `${name}="${escapedValue}"`;
  if (/^[\x20-\x7E]*$/.test(value) && quotedParameter.length <= 60) {
    return quotedParameter;
  }

  const encodedBytes = Array.from(
    new TextEncoder().encode(value),
    (byte) => {
      const character = String.fromCharCode(byte);
      return /^[A-Za-z0-9!#$&+.^_`|~-]$/.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    },
  );
  const segments: string[] = [];
  let segment = "";

  for (const encodedByte of encodedBytes) {
    if (segment.length + encodedByte.length > 45) {
      segments.push(segment);
      segment = "";
    }
    segment += encodedByte;
  }
  if (segment.length > 0 || segments.length === 0) segments.push(segment);

  return segments.map((part, index) =>
    `${name}*${index}*=${index === 0 ? "UTF-8''" : ""}${part}`
  ).join("; ");
}

function foldHeader(name: string, value: string): string {
  const recommendedLineLength = 78;
  const lines: string[] = [];
  let prefix = `${name}: `;
  let remaining = value;

  while (prefix.length + remaining.length > recommendedLineLength) {
    const availableLength = recommendedLineLength - prefix.length;
    let breakIndex = -1;

    for (
      let index = Math.min(availableLength, remaining.length - 1);
      index >= 0;
      index--
    ) {
      if (remaining[index] === " " || remaining[index] === "\t") {
        breakIndex = index;
        break;
      }
    }

    if (breakIndex < 0) {
      for (
        let index = Math.max(availableLength + 1, 0);
        index < remaining.length;
        index++
      ) {
        if (remaining[index] === " " || remaining[index] === "\t") {
          breakIndex = index;
          break;
        }
      }
    }

    if (breakIndex < 0) break;

    let whitespaceEnd = breakIndex + 1;
    while (
      whitespaceEnd < remaining.length &&
      (remaining[whitespaceEnd] === " " || remaining[whitespaceEnd] === "\t")
    ) {
      whitespaceEnd++;
    }

    if (whitespaceEnd === remaining.length) break;

    lines.push(prefix + remaining.slice(0, breakIndex));
    prefix = remaining.slice(breakIndex, whitespaceEnd);
    remaining = remaining.slice(whitespaceEnd);
  }

  lines.push(prefix + remaining);
  if (lines.some((line) => line.length > 998)) {
    throw new RangeError(
      `Header field ${name} contains a token too long to fold.`,
    );
  }
  return lines.join("\r\n");
}

function encodeQuotedPrintable(text: string): string {
  // First encode the entire string as UTF-8 bytes
  const utf8Bytes = new TextEncoder().encode(text);

  let result = "";
  let lineLength = 0;
  const maxLineLength = 76;

  for (let i = 0; i < utf8Bytes.length; i++) {
    const byte = utf8Bytes[i];
    let encoded = "";

    // Check if byte needs encoding
    if (
      byte < 32 || // Control characters
      byte > 126 || // Non-ASCII
      byte === 61 || // '=' character
      (byte === 46 && lineLength === 0) // '.' at start of line
    ) {
      encoded = `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      encoded = String.fromCharCode(byte);
    }

    // Check if adding this encoded sequence would exceed line length
    if (lineLength + encoded.length > maxLineLength) {
      // Add soft line break (= followed by CRLF)
      result += "=\r\n";
      lineLength = 0;
    }

    result += encoded;
    lineLength += encoded.length;

    // Handle line breaks in the original text
    if (byte === 13 && i + 1 < utf8Bytes.length && utf8Bytes[i + 1] === 10) {
      // CRLF sequence - add LF and reset line length
      i++; // Skip the LF byte since we're handling it here
      result += String.fromCharCode(10);
      lineLength = 0;
    } else if (byte === 10 && (i === 0 || utf8Bytes[i - 1] !== 13)) {
      // Standalone LF - reset line length
      lineLength = 0;
    }
  }

  return result;
}

function encodeBase64(data: Uint8Array): string {
  // Convert Uint8Array to base64 with proper line breaks
  const base64 = Buffer.from(data).toString("base64");
  return base64.replace(/(.{76})/g, "$1\r\n").trim();
}
