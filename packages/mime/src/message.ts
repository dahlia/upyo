import {
  type Address,
  type AttachmentContent,
  type Message,
  readAttachmentContent,
} from "@upyo/core";
import {
  formatMessageId,
  generateMessageId,
  resolveThreadingHeaders,
} from "@upyo/core/message-id";
import { resolveCalendarContent } from "@upyo/core/calendar";
import { type DkimConfig, validateDkimBodyMode } from "./dkim/types.ts";
import { attachmentEncodedSize, encodeAttachment } from "./mime-stream.ts";
import { base64, utf8 } from "./bytes.ts";
/** A per-attempt MIME plan with stable headers and replayable body bytes. */
export interface PreparedMimeMessage {
  readonly encoding: "7bit" | "utf8";
  readonly dkim?: DkimConfig;
  readonly headers: string;
  /** Includes the final transport CRLF, but not SMTP transparency or terminator. */
  body(signal?: AbortSignal, progress?: () => void): AsyncIterable<Uint8Array>;
  /** Unknown factory sizes do not cause a speculative read. */
  size(
    signal?: AbortSignal,
    checkSize?: (size: number) => void,
  ): Promise<number | undefined>;
}

/**
 * Freezes message metadata without reading attachment content.
 * @param message Message whose metadata will be frozen.
 * @param dkimConfig Optional signing configuration.
 * @returns A deterministic MIME plan for one send attempt.
 * @throws {RangeError} If a header cannot fit the RFC 5322 line limit.
 * @throws {TypeError} If the message carries an invalid message identifier or
 * date, an address or identity header containing a carriage return or line
 * feed, or an invalid custom header field name.
 */
export function prepareMimeMessage(
  message: Message,
  dkimConfig?: DkimConfig,
): PreparedMimeMessage {
  // Observe every promise before validation can throw or an earlier reader stalls.
  for (const attachment of message.attachments) {
    if (attachment.content instanceof Promise) {
      attachment.content.catch(() => {});
    }
  }
  const dkim = dkimConfig == null ? undefined : {
    ...dkimConfig,
    signatures: dkimConfig.signatures.map((signature) => ({
      ...signature,
      headerFields: signature.headerFields == null
        ? undefined
        : [...signature.headerFields],
    })),
  };
  if (dkim != null) validateDkimBodyMode(dkim);
  const parts = buildMimeParts(message);
  const first = parts[0];
  if (typeof first !== "string") throw new TypeError("Missing MIME headers.");
  const separator = first.indexOf("\r\n\r\n") + 4;
  const headers = first.slice(0, separator);
  parts[0] = first.slice(separator);

  const encoding =
    [headers, ...parts.filter((part) => typeof part === "string")].some(
        hasNonAscii,
      )
      ? "utf8"
      : "7bit";
  return {
    encoding,
    dkim,
    headers,
    async *body(signal, progress) {
      for (const part of parts) {
        signal?.throwIfAborted();
        if (typeof part === "string") {
          const bytes = utf8(part);
          for (let offset = 0; offset < bytes.length; offset += 65536) {
            signal?.throwIfAborted();
            yield bytes.subarray(offset, offset + 65536);
          }
        } else {
          yield* encodeAttachment(part.content, signal, progress);
        }
      }
    },
    async size(signal, checkSize) {
      let size = utf8(headers).length;
      let unknown = false;
      for (const part of parts) {
        signal?.throwIfAborted();
        if (typeof part === "string") size += utf8(part).length;
        else {
          if (part.content instanceof Promise) {
            part.content = await readAttachmentContent(part.content, signal);
          }
          if (typeof part.content === "function") unknown = true;
          else {size += attachmentEncodedSize(
              part.content instanceof Uint8Array
                ? part.content.byteLength
                : part.content.size,
            );}
        }
        if (!Number.isSafeInteger(size)) {
          throw new RangeError("Message size exceeds the safe integer range.");
        }
      }
      checkSize?.(size);
      return unknown ? undefined : size;
    },
  };
}

type MimePart = string | { content: AttachmentContent };

function buildMimeParts(message: Message): MimePart[] {
  const lines: MimePart[] = [];
  const boundary = generateBoundary();
  const hasAttachments = message.attachments.length > 0;
  const alternatives = buildAlternatives(message);
  const isMultipart = hasAttachments || alternatives.length > 1;

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

  // The identity and threading fields all carry structured values, so they are
  // written verbatim rather than RFC 2047 encoded.
  lines.push(foldHeader("Date", resolveDate(message)));
  lines.push(foldHeader("Message-ID", resolveMessageId(message)));
  const threading = resolveThreadingHeaders(message);
  for (const name of ["In-Reply-To", "References"]) {
    // A field the message does not own falls back to a custom header, one it
    // owns but left empty writes nothing at all.
    const owned = threading.get(name);
    const value = owned === undefined ? overridden(message, name) : owned;
    if (value != null) lines.push(foldHeader(name, value));
  }

  // Names already written above, plus Cc and Reply-To even when the message
  // carries no such recipients: a custom header there would list addresses the
  // envelope never receives.  The identity and threading names are here
  // unconditionally too, even when nothing was written: each of them has had
  // its one chance to be emitted above, from the typed field or from the very
  // custom header this loop would otherwise write again.
  const composed = new Set([
    "from",
    "to",
    "cc",
    "reply-to",
    "subject",
    "date",
    "message-id",
    "in-reply-to",
    "references",
  ]);

  // Priority header
  if (message.priority !== "normal") {
    const priorityValue = message.priority === "high" ? "1" : "5";
    lines.push(`X-Priority: ${priorityValue}`);
    lines.push(
      `X-MSMail-Priority: ${message.priority === "high" ? "High" : "Low"}`,
    );
    composed.add("x-priority");
    composed.add("x-msmail-priority");
  }

  // Custom headers
  for (const [key, value] of message.headers) {
    const name = key.toLowerCase();
    if (composed.has(name) || reservedHeaders.has(name)) continue;
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

    if (alternatives.length > 1) {
      const contentBoundary = generateBoundary();
      lines.push(
        `Content-Type: multipart/alternative; boundary="${contentBoundary}"`,
      );
      lines.push("");

      for (const alternative of alternatives) {
        lines.push(`--${contentBoundary}`);
        lines.push(`Content-Type: ${alternative.contentType}`);
        lines.push(`Content-Transfer-Encoding: ${alternative.encoding}`);
        lines.push("");
        lines.push(alternative.body);
        lines.push("");
      }

      lines.push(`--${contentBoundary}--`);
    } else {
      lines.push(`Content-Type: ${alternatives[0].contentType}`);
      lines.push(`Content-Transfer-Encoding: ${alternatives[0].encoding}`);
      lines.push("");
      lines.push(alternatives[0].body);
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
        lines.push(foldHeader("Content-ID", `<${attachment.contentId}>`));
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
      lines.push({ content: attachment.content });
    }

    lines.push("");
    lines.push(`--${boundary}--`);
  } else {
    // Single part message
    lines.push(`Content-Type: ${alternatives[0].contentType}`);
    lines.push(`Content-Transfer-Encoding: ${alternatives[0].encoding}`);
    lines.push("");
    lines.push(alternatives[0].body);
  }

  const parts: MimePart[] = [];
  let text = "";
  for (const line of lines) {
    if (typeof line === "string") text += line;
    else {
      parts.push(text, line);
      text = "";
    }
    text += "\r\n";
  }
  parts.push(text);
  return parts;
}

/**
 * One body alternative, already encoded and ready to be written into a part.
 */
interface MimeAlternative {
  readonly contentType: string;
  readonly encoding: "quoted-printable" | "base64";
  readonly body: string;
}

/**
 * Collects the body alternatives of a message, least preferred first.
 *
 * RFC 2046 §5.1.4 orders a `multipart/alternative` by increasing richness, so a
 * client picks the last one it understands.  Plain text comes first, then HTML,
 * then the calendar object: a client that schedules should act on the
 * invitation rather than render the prose describing it.
 *
 * The presence of a body is tested with `in` rather than truthiness, so an
 * empty string a caller supplied deliberately still produces its part.
 *
 * @param message The message being composed.
 * @returns At least one alternative, in the order they are written.
 * @throws {TypeError} If the calendar content is not valid.
 */
function buildAlternatives(message: Message): MimeAlternative[] {
  const alternatives: MimeAlternative[] = [];

  if ("text" in message.content && message.content.text !== undefined) {
    alternatives.push({
      contentType: "text/plain; charset=utf-8",
      encoding: "quoted-printable",
      body: encodeQuotedPrintable(message.content.text),
    });
  }

  if ("html" in message.content) {
    alternatives.push({
      contentType: "text/html; charset=utf-8",
      encoding: "quoted-printable",
      body: encodeQuotedPrintable(message.content.html),
    });
  }

  if (message.calendar != null) {
    // Re-validated here rather than trusted from the message: `Message` is a
    // structural interface, and the method is written into a `Content-Type`
    // parameter, the same reason `formatMessageId()` checks again below.
    const calendar = resolveCalendarContent(message.calendar);
    alternatives.push({
      // The parameter repeats the object's own METHOD property, which RFC 6047
      // §2.4 requires.  Base64 keeps the CRLF structure RFC 5545 §3.1 makes
      // normative intact, which quoted-printable would not.
      contentType: `text/calendar; charset=utf-8; method=${calendar.method}`,
      encoding: "base64",
      body: encodeBase64Body(calendar.content),
    });
  }

  if (alternatives.length < 1) {
    alternatives.push({
      contentType: "text/plain; charset=utf-8",
      encoding: "quoted-printable",
      body: "",
    });
  }

  return alternatives;
}

/**
 * Encodes a body as Base64, wrapped at the 76 columns RFC 2045 §6.8 allows.
 *
 * The result carries no trailing CRLF, because MIME assembly appends one to
 * every line it writes.
 *
 * @param text The body to encode.
 * @returns The wrapped Base64 payload.
 */
function encodeBase64Body(text: string): string {
  const encoded = base64(utf8(text));
  const lines: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += 76) {
    lines.push(encoded.slice(offset, offset + 76));
  }
  return lines.join("\r\n");
}

/**
 * Reads a header field that overrides a generated default.
 *
 * Unlike custom headers, the value is written verbatim rather than RFC 2047
 * encoded, so it cannot rely on `encodeHeaderValue()` to neutralize control
 * characters.  `ImmutableHeaders` is a structural type, so a `Message` may
 * carry an adapter that never rejected CR or LF the way a platform `Headers`
 * does.
 *
 * @param message The message whose headers are read.
 * @param name The header field name.
 * @returns The supplied value, or `undefined` when the message has none.
 * @throws {TypeError} If the value contains a carriage return or line feed,
 * which would inject additional header fields into the message.
 */
function overridden(message: Message, name: string): string | undefined {
  const value = message.headers.get(name);
  if (value == null) return undefined;
  if (/[\r\n]/.test(value)) {
    throw new TypeError(
      `Header field ${name} must not contain a carriage return or line feed.`,
    );
  }
  return value;
}

/**
 * Header fields the composer owns but writes after the custom headers, or
 * deliberately omits.  A custom header with one of these names is dropped
 * rather than appended: the structured `Message` fields are authoritative,
 * RFC 5322 §3.6 allows at most one of each, and a duplicate placed before the
 * composer's own field makes parsers that take the first occurrence read the
 * wrong value.
 */
const reservedHeaders: ReadonlySet<string> = new Set([
  // Bcc recipients travel in the SMTP envelope only, so a Bcc header would
  // disclose them to every recipient.
  "bcc",
  "content-transfer-encoding",
  "content-type",
  "mime-version",
]);

/**
 * Tells whether a value contains a character outside ASCII, which a message
 * can only carry with the SMTPUTF8 extension (RFC 6531).
 *
 * @param value The value to check.
 * @returns Whether the value contains a character outside ASCII.
 */
function hasNonAscii(value: string): boolean {
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) > 0x7f) return true;
  }
  return false;
}

function generateBoundary(): string {
  return `boundary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Resolves the origination date: the typed field, then a custom header, then
 * the time of conversion.
 *
 * @param message The message being composed.
 * @returns The `Date` field value.
 * @throws {TypeError} If the message carries an invalid date, or a custom
 * `Date` header containing a carriage return or line feed.
 */
function resolveDate(message: Message): string {
  return message.date === undefined
    ? overridden(message, "Date") ?? formatDate(new Date())
    : formatDate(message.date);
}

/**
 * Resolves the message identifier: the typed field, then a custom header, then
 * one generated within the sender's domain.
 *
 * @param message The message being composed.
 * @returns The `Message-ID` field value, enclosed in angle brackets.
 * @throws {TypeError} If the message carries an invalid identifier, or a custom
 * `Message-ID` header containing a carriage return or line feed.
 */
function resolveMessageId(message: Message): string {
  if (message.messageId !== undefined) {
    return formatMessageId(message.messageId);
  }
  const custom = overridden(message, "Message-ID");
  if (custom != null) return custom;
  return formatMessageId(generateSenderMessageId(message.sender.address));
}

/**
 * Generates an identifier rooted in the sender's domain.
 *
 * `parseAddress()` validates a domain with `URL`, which accepts spellings the
 * identifier grammar does not, such as the trailing dot of a fully qualified
 * name or a host carrying a port.  A sender written that way used to be
 * delivered, so an unusable domain falls back to `localhost` rather than
 * failing the send.  Uniqueness holds either way: the left half is a UUID.
 *
 * @param address The sender's address.
 * @returns A bare message identifier.
 */
function generateSenderMessageId(address: string): string {
  const domain = domainOf(address).replace(/\.$/, "");
  try {
    return generateMessageId(domain);
  } catch {
    return generateMessageId("localhost");
  }
}

/**
 * Extracts the domain of an address.
 *
 * The separator is the first at sign outside a quoted local part, since a
 * quoted one may contain at signs of its own, as in `"a@b"@example.com`.
 *
 * @param address The address to read.
 * @returns The domain, or the whole address when it carries no separator.
 */
function domainOf(address: string): string {
  let quoted = false;
  for (let index = 0; index < address.length; index++) {
    const character = address[index];
    if (quoted && character === "\\") index++;
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === "@") return address.slice(index + 1);
  }
  return address;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formats a date as an RFC 5322 §3.3 `date-time` in UTC.
 *
 * `Date.toUTCString()` is close but ends in the obsolete `GMT` zone rather than
 * the numeric `+0000` the current grammar asks for.
 *
 * @param date The date to format.
 * @returns The formatted date.
 * @throws {TypeError} If the date is invalid, or earlier than the grammar can
 * express.
 */
function formatDate(date: Date): string {
  const time = date instanceof Date ? date.getTime() : Number.NaN;
  const year = Number.isNaN(time) ? Number.NaN : date.getUTCFullYear();
  if (Number.isNaN(time) || year < 1900) {
    throw new TypeError(`Invalid date: ${JSON.stringify(date)}`);
  }
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${dayNames[date.getUTCDay()]}, ${pad(date.getUTCDate())} ` +
    `${monthNames[date.getUTCMonth()]} ${year.toString().padStart(4, "0")} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`;
}

function encodeAddress(address: Address): string {
  if (/[\r\n]/.test(address.address)) {
    throw new TypeError(
      "Address must not contain a carriage return or line feed.",
    );
  }
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
      const encoded = base64(utf8Bytes);
      return `=?UTF-8?B?${encoded}?=`;
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
  if (!/^[\x21-\x39\x3b-\x7e]+$/.test(name)) {
    throw new TypeError(
      "Header field name must contain printable ASCII characters other than colon.",
    );
  }
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
  if (lines.some((line) => utf8(line).length > 998)) {
    throw new RangeError(
      `Header field ${name} contains a token too long to fold.`,
    );
  }
  return lines.join("\r\n");
}

function encodeQuotedPrintable(text: string): string {
  const bytes = utf8(text);
  let result = "";
  let column = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 13 && bytes[i + 1] === 10) {
      result += "\r\n";
      column = 0;
      i++;
      continue;
    }
    const escaped = byte < 32 || byte > 126 || byte === 61 ||
      (byte === 32 &&
        (i + 1 === bytes.length || bytes[i + 1] === 13 ||
          bytes[i + 1] === 10)) ||
      (byte === 46 && column === 0);
    const encoded = escaped
      ? `=${byte.toString(16).toUpperCase().padStart(2, "0")}`
      : String.fromCharCode(byte);
    if (column + encoded.length > 75) {
      result += "=\r\n";
      column = 0;
    }
    result += encoded;
    column += encoded.length;
  }
  return result;
}
