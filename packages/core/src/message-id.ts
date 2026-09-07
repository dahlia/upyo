/**
 * Syntax of the message identifiers carried by the `Message-ID`, `In-Reply-To`,
 * and `References` header fields.
 *
 * Identifiers are handled in their *bare* form throughout Upyo, without the
 * enclosing angle brackets, the same way {@link Attachment.contentId} is.  The
 * brackets belong to the wire syntax and are added when a message is
 * serialized.
 *
 * @module
 * @since 0.6.0
 */

import type { Message } from "./message.ts";

/**
 * Generates a globally unique message identifier rooted in a domain.
 *
 * The identifier is a random UUID followed by `@` and the domain, which makes
 * it unique within the scope RFC 5322 §3.6.4 asks the generator to ensure.
 * The same construction is used for attachment content IDs.
 *
 * The domain has to be a valid identifier right-hand side: a dot-atom such as
 * `example.com` or an address literal such as `[192.0.2.1]`.  A URL, a host
 * with a port, or a value carrying whitespace is rejected.  A domain written
 * in a non-Latin script is converted to its ASCII (Punycode) form so that the
 * *generated* identifier travels through mail software that predates RFC 6532;
 * a non-ASCII domain that is not a DNS name is kept as it is.  An identifier
 * supplied by a caller is never rewritten this way.
 *
 * @example
 * ```ts
 * import { generateMessageId } from "@upyo/core/message-id";
 * const messageId = generateMessageId("example.com");
 * // "1e2ee2e1-…-…@example.com"
 * ```
 *
 * @param domain The domain the identifier is rooted in.
 * @returns A bare message identifier, without angle brackets.
 * @throws {TypeError} If the domain is not a valid identifier right-hand side.
 * @since 0.6.0
 */
export function generateMessageId(domain: string): string {
  return `${crypto.randomUUID()}@${normalizeIdRight(domain)}`;
}

/**
 * Parses a message identifier, with or without the enclosing angle brackets,
 * into its bare form.
 *
 * This is the inverse of {@link formatMessageId}, and it returns `undefined`
 * rather than throwing, the way {@link parseAddress} does.
 *
 * It parses *one* identifier.  An `In-Reply-To` or `References` field arriving
 * from elsewhere may hold several identifiers, comments, folded whitespace, and
 * obsolete syntax, none of which this function accepts; splitting such a field
 * is the caller's job.
 *
 * @example
 * ```ts
 * import { parseMessageId } from "@upyo/core/message-id";
 * parseMessageId("<abc@example.com>");  // "abc@example.com"
 * parseMessageId("not an identifier");  // undefined
 * ```
 *
 * @param value The identifier to parse.
 * @returns The bare identifier, or `undefined` if the value is not one.
 * @since 0.6.0
 */
export function parseMessageId(value: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const bare = value.length > 1 && value.startsWith("<") && value.endsWith(">")
    ? value.slice(1, -1)
    : value;
  return isMessageId(bare) ? bare : undefined;
}

/**
 * Formats a bare message identifier for a header field, by enclosing it in
 * angle brackets.
 *
 * This is the inverse of {@link parseMessageId}.  It takes the *bare* form, so
 * an already enclosed identifier is rejected rather than enclosed twice.  What
 * it guarantees is syntax; a header field also has to fit the line-length limit
 * the serializing transport enforces.
 *
 * @example
 * ```ts
 * import { formatMessageId } from "@upyo/core/message-id";
 * formatMessageId("abc@example.com");  // "<abc@example.com>"
 * ```
 *
 * @param id The bare identifier to format.
 * @returns The identifier enclosed in angle brackets.
 * @throws {TypeError} If the value is not a valid bare identifier.
 * @since 0.6.0
 */
export function formatMessageId(id: string): string {
  if (!isMessageId(id)) {
    throw new TypeError(`Invalid message ID: ${JSON.stringify(id)}`);
  }
  return `<${id}>`;
}

/**
 * Tells whether a value is a message identifier in its bare form.
 *
 * The accepted syntax is `id-left "@" id-right` from RFC 5322 §3.6.4, extended
 * with UTF-8 by RFC 6532, and then narrowed by a few deliberate restrictions
 * described on {@link isDotAtomText} and {@link isNoFoldLiteral}.
 *
 * @param id The value to check.
 * @returns Whether the value is a bare message identifier.
 */
function isMessageId(id: string): boolean {
  // A modern `id-left` is a dot-atom, which cannot contain an at sign, so the
  // first one separates the two halves.  An `id-right` written as an address
  // literal may contain further at signs.
  const separator = id.indexOf("@");
  if (separator < 0) return false;
  const left = id.slice(0, separator);
  const right = id.slice(separator + 1);
  return isDotAtomText(left) &&
    (isDotAtomText(right) || isNoFoldLiteral(right));
}

/**
 * Normalizes a domain for {@link generateMessageId}.
 *
 * @param domain The domain to normalize.
 * @returns The domain, converted to its ASCII form when it is a DNS name
 *          written in a non-Latin script.
 * @throws {TypeError} If the domain is not a valid identifier right-hand side.
 */
function normalizeIdRight(domain: string): string {
  if (typeof domain !== "string" || !isIdRight(domain)) {
    throw new TypeError(`Invalid message ID domain: ${JSON.stringify(domain)}`);
  }
  if (!hasNonAscii(domain) || !dnsNamePattern.test(domain)) return domain;
  // `URL` applies IDNA, which is the only Punycode implementation available on
  // every runtime Upyo targets.  It is used for the conversion alone; the
  // value has already been validated, and the result is validated again.
  let url: URL;
  try {
    url = new URL(`http://${domain}/`);
  } catch {
    return domain;
  }
  const ascii = url.hostname;
  return url.host === ascii && url.pathname === "/" && isIdRight(ascii)
    ? ascii
    : domain;
}

/**
 * The shape a domain has to have before {@link normalizeIdRight} hands it to
 * `URL` for IDNA conversion.  Anything else, such as an address literal or a
 * dot-atom using punctuation `URL` would read as a delimiter, is left alone,
 * since the conversion would silently truncate it.  Combining marks are
 * allowed: a decomposed spelling is as much a DNS name as its precomposed
 * equivalent, and IDNA normalizes the two to the same label.
 */
const dnsNamePattern = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\-.]*$/u;

/**
 * Tells whether a value is a valid `id-right`.
 *
 * @param value The value to check.
 * @returns Whether the value is a valid `id-right`.
 */
function isIdRight(value: string): boolean {
  return isDotAtomText(value) || isNoFoldLiteral(value);
}

/**
 * Tells whether a value is a `dot-atom-text`: one or more `atext` runs joined
 * by single dots, so neither a leading, a trailing, nor a doubled dot.
 *
 * @param value The value to check.
 * @returns Whether the value is a `dot-atom-text`.
 */
function isDotAtomText(value: string): boolean {
  if (value === "") return false;
  for (const atom of value.split(".")) {
    if (atom === "") return false;
    for (const character of atom) {
      if (!isAtext(character)) return false;
    }
  }
  return true;
}

/**
 * Tells whether a value is a `no-fold-literal`: an address literal such as
 * `[192.0.2.1]`.
 *
 * An empty literal is rejected, which RFC 5322 would allow: it identifies
 * nothing, and a generator that produces one is more likely broken than
 * deliberate.
 *
 * @param value The value to check.
 * @returns Whether the value is a `no-fold-literal`.
 */
function isNoFoldLiteral(value: string): boolean {
  if (value.length < 3 || !value.startsWith("[") || !value.endsWith("]")) {
    return false;
  }
  for (const character of value.slice(1, -1)) {
    if (!isDtext(character)) return false;
  }
  return true;
}

/**
 * The ASCII punctuation RFC 5322 allows in an atom, besides letters and digits.
 */
const asciiAtextSymbols = "!#$%&'*+-/=?^_`{|}~";

/**
 * Tells whether a character is `atext`, the character class an atom is built
 * from, extended with UTF-8 by RFC 6532.
 *
 * @param character A single character, which may be a surrogate pair.
 * @returns Whether the character is `atext`.
 */
function isAtext(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint == null) return false;
  if (codePoint > 0x7f) return isNonAsciiText(codePoint);
  return /[A-Za-z0-9]/.test(character) ||
    asciiAtextSymbols.includes(character);
}

/**
 * Tells whether a character is `dtext`, the character class the inside of an
 * address literal is built from, extended with UTF-8 by RFC 6532.
 *
 * Angle brackets are excluded although RFC 5322 permits them here.  They are
 * unambiguous only to a parser that tracks the literal, and an identifier
 * carrying one would be truncated by every reader that simply looks for the
 * closing bracket of the field.
 *
 * @param character A single character, which may be a surrogate pair.
 * @returns Whether the character is `dtext`.
 */
function isDtext(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint == null) return false;
  if (codePoint > 0x7f) return isNonAsciiText(codePoint);
  return (codePoint >= 0x21 && codePoint <= 0x5a ||
    codePoint >= 0x5e && codePoint <= 0x7e) &&
    character !== "<" && character !== ">";
}

/**
 * Tells whether a code point beyond ASCII may appear in a header field under
 * RFC 6532.  An unpaired surrogate may not: it cannot be encoded as UTF-8.
 *
 * @param codePoint The code point to check.
 * @returns Whether the code point is usable.
 */
function isNonAsciiText(codePoint: number): boolean {
  return codePoint < 0xd800 || codePoint > 0xdfff;
}

/**
 * Tells whether a value contains a character beyond ASCII.
 *
 * @param value The value to check.
 * @returns Whether the value contains a character beyond ASCII.
 */
function hasNonAscii(value: string): boolean {
  return !/^[\x20-\x7E]*$/.test(value);
}

/**
 * Works out the reply threading header fields a transport should write for a
 * message, from {@link Message.inReplyTo} and {@link Message.references}.
 *
 * The three states those fields can be in map onto the result like this:
 *
 *  -  A field the message leaves unset is absent from the map.  The message
 *     does not own the header, so a transport may still write one supplied
 *     through {@link Message.headers}.
 *  -  A field set to an empty list maps to `null`.  The message owns the
 *     header and deliberately writes nothing, which suppresses a custom header
 *     of the same name.
 *  -  A field with identifiers in it maps to the formatted field value.
 *
 * Keys are the canonical field names, `In-Reply-To` and `References`.  A header
 * field name is case insensitive, so compare accordingly when deciding whether
 * a custom header is shadowed.
 *
 * @example
 * ```ts
 * import { resolveThreadingHeaders } from "@upyo/core/message-id";
 * // for a message replying to <122@example.com>:
 * // Map { "In-Reply-To" => "<122@example.com>" }
 * ```
 *
 * @param message The message being converted.
 * @returns The header fields the message owns, keyed by canonical name.
 * @throws {TypeError} If the message carries an invalid identifier.
 * @since 0.6.0
 */
export function resolveThreadingHeaders(
  message: Message,
): ReadonlyMap<string, string | null> {
  const resolved = new Map<string, string | null>();
  const fields = [
    ["In-Reply-To", message.inReplyTo],
    ["References", message.references],
  ] as const;
  for (const [name, ids] of fields) {
    if (ids == null) continue;
    resolved.set(
      name,
      ids.length < 1 ? null : ids.map(formatMessageId).join(" "),
    );
  }
  return resolved;
}
