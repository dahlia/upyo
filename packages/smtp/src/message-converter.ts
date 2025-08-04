import type { Address, Message } from "@upyo/core";
import { Buffer } from "node:buffer";

export interface SmtpMessage {
  readonly envelope: SmtpEnvelope;
  readonly raw: string;
}

export interface SmtpEnvelope {
  readonly from: string;
  readonly to: string[];
}

export async function convertMessage(message: Message): Promise<SmtpMessage> {
  const envelope: SmtpEnvelope = {
    from: message.sender.address,
    to: [
      ...message.recipients.map((r) => r.address),
      ...message.ccRecipients.map((r) => r.address),
      ...message.bccRecipients.map((r) => r.address),
    ],
  };

  const raw = await buildRawMessage(message);

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
  lines.push(`From: ${encodeAddress(message.sender)}`);
  lines.push(`To: ${message.recipients.map(encodeAddress).join(", ")}`);

  if (message.ccRecipients.length > 0) {
    lines.push(`Cc: ${message.ccRecipients.map(encodeAddress).join(", ")}`);
  }

  if (message.replyRecipients.length > 0) {
    lines.push(
      `Reply-To: ${message.replyRecipients.map(encodeAddress).join(", ")}`,
    );
  }

  lines.push(`Subject: ${encodeHeaderValue(message.subject)}`);
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
    lines.push(`${key}: ${encodeHeaderValue(value)}`);
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
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      );
      lines.push("Content-Transfer-Encoding: base64");

      if (attachment.inline) {
        lines.push(
          `Content-Disposition: inline; filename="${attachment.filename}"`,
        );
        lines.push(`Content-ID: <${attachment.contentId}>`);
      } else {
        lines.push(
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
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
  const encodedDisplayName = encodeHeaderValue(address.name);
  return `${encodedDisplayName} <${address.address}>`;
}

function encodeHeaderValue(value: string): string {
  // RFC 2047 encoding for non-ASCII characters in headers
  if (!/^[\x20-\x7E]*$/.test(value)) {
    // Convert to UTF-8 bytes then to base64
    const utf8Bytes = new TextEncoder().encode(value);
    const base64 = Buffer.from(utf8Bytes).toString("base64");

    // Handle long headers by splitting into multiple encoded words
    const maxEncodedLength = 75; // RFC 2047 recommends max 75 chars per encoded word
    const encodedWord = `=?UTF-8?B?${base64}?=`;

    if (encodedWord.length <= maxEncodedLength) {
      return encodedWord;
    }

    // Split into multiple encoded words if too long
    const words = [];
    let currentBase64 = "";

    for (let i = 0; i < base64.length; i += 4) {
      const chunk = base64.slice(i, i + 4);
      const testWord = `=?UTF-8?B?${currentBase64}${chunk}?=`;

      if (testWord.length <= maxEncodedLength) {
        currentBase64 += chunk;
      } else {
        if (currentBase64) {
          words.push(`=?UTF-8?B?${currentBase64}?=`);
        }
        currentBase64 = chunk;
      }
    }

    if (currentBase64) {
      words.push(`=?UTF-8?B?${currentBase64}?=`);
    }

    return words.join(" ");
  }
  return value;
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
