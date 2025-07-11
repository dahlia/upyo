import { formatAddress, type Message } from "@upyo/core";

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
  lines.push(`From: ${formatAddress(message.sender)}`);
  lines.push(`To: ${message.recipients.map(formatAddress).join(", ")}`);

  if (message.ccRecipients.length > 0) {
    lines.push(`Cc: ${message.ccRecipients.map(formatAddress).join(", ")}`);
  }

  if (message.replyRecipients.length > 0) {
    lines.push(
      `Reply-To: ${message.replyRecipients.map(formatAddress).join(", ")}`,
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

function encodeHeaderValue(value: string): string {
  // RFC 2047 encoding for non-ASCII characters in headers
  if (!/^[\x20-\x7E]*$/.test(value)) {
    // Convert to UTF-8 bytes then to base64
    const utf8Bytes = new TextEncoder().encode(value);
    const base64 = btoa(String.fromCharCode(...utf8Bytes));
    return `=?UTF-8?B?${base64}?=`;
  }
  return value;
}

function encodeQuotedPrintable(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code < 256) {
        return `=${code.toString(16).toUpperCase().padStart(2, "0")}`;
      }
      // For characters > 255, encode as UTF-8 bytes
      const utf8 = new TextEncoder().encode(char);
      return Array.from(utf8)
        .map((byte) => `=${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .replace(/=$/gm, "=3D")
    .replace(/^\./, "=2E");
}

function encodeBase64(data: Uint8Array): string {
  // Convert Uint8Array to base64 with proper line breaks
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/(.{76})/g, "$1\r\n").trim();
}
