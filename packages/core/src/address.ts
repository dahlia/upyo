/**
 * A type alias for email address strings that must contain an @ symbol.
 * @since 0.2.0
 */
export type EmailAddress = `${string}@${string}`;

/**
 * A pair of name (which is optional) and email address.
 */
export interface Address {
  /**
   * The name of the person or entity associated with the email address.
   */
  readonly name?: string;

  /**
   * The email address itself.
   */
  readonly address: EmailAddress;
}

/**
 * Formats an address object into a string representation.  This function is
 * an inverse of the {@link parseAddress} function.
 *
 * @example Formatting an address with a name
 * ```ts
 * import { type Address, formatAddress } from "@upyo/core/address";
 * const address: Address = { name: "John Doe", address: "john@example.com" };
 * console.log(formatAddress(address)); // "John Doe <john@example.com>"
 * ```
 *
 * @example Formatting an address without a name
 * ```ts
 * import { type Address, formatAddress } from "@upyo/core/address";
 * const address: Address = { address: "jane@examle.com" };
 * console.log(formatAddress(address)); // "jane@example.com"
 * ```
 *
 * @param address The address object to format.
 * @return A string representation of the address.
 */
export function formatAddress(address: Address): string {
  return address.name == null
    ? address.address
    : `${address.name} <${address.address}>`;
}

/**
 * Parses a string representation of an email address into an {@link Address}
 * object.  This function is an inverse of the {@link formatAddress} function.
 *
 * @example Parsing an address with a name
 * ```ts
 * import { parseAddress } from "@upyo/core/address";
 * const address = parseAddress("John Doe <john@example.com>");
 * console.log(address); // { name: "John Doe", address: "john@example.com" }
 * ```
 *
 * @example Parsing an address without a name
 * ```ts
 * import { parseAddress } from "@upyo/core/address";
 * const address = parseAddress("jane@example.com");
 * console.log(address); // { address: "jane@example.com" }
 * ```
 *
 * @example Trying to parse an invalid address
 * ```ts
 * import { parseAddress } from "@upyo/core/address";
 * const address = parseAddress("invalid-email");
 * console.log(address); // undefined
 * ```
 *
 * @param address The string representation of the address to parse.
 * @returns An {@link Address} object if the parsing is successful,
 *          or `undefined` if the input is invalid.
 */
export function parseAddress(address: string): Address | undefined {
  if (!address || typeof address !== "string") {
    return undefined;
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return undefined;
  }

  // Check for name and angle bracket format: "Name <email@domain.com>"
  const nameAngleBracketMatch = trimmed.match(/^(.+?)\s*<(.+?)>$/);
  if (nameAngleBracketMatch) {
    const name = nameAngleBracketMatch[1].trim();
    const email = nameAngleBracketMatch[2].trim();

    if (!isValidEmail(email)) {
      return undefined;
    }

    // Remove quotes from name if present
    const cleanName = name.replace(/^"(.+)"$/, "$1");
    return { name: cleanName, address: email as EmailAddress };
  }

  // Check for angle bracket format without name: "<email@domain.com>"
  const angleBracketMatch = trimmed.match(/^<(.+?)>$/);
  if (angleBracketMatch) {
    const email = angleBracketMatch[1].trim();

    if (!isValidEmail(email)) {
      return undefined;
    }

    return { address: email as EmailAddress };
  }

  // Check for plain email format: "email@domain.com"
  if (isValidEmail(trimmed)) {
    return { address: trimmed as EmailAddress };
  }

  return undefined;
}

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }

  // Prevent SMTP command injection by disallowing newlines
  if (email.includes("\r") || email.includes("\n")) {
    return false;
  }

  // Find the @ symbol that separates local and domain parts
  // If the local part is quoted, we need to find the @ after the closing quote
  let atIndex = -1;
  let inQuotes = false;
  let escaped = false;

  for (let i = 0; i < email.length; i++) {
    const char = email[i];

    if (char === '"' && !escaped) {
      inQuotes = !inQuotes;
    } else if (char === "@" && !inQuotes) {
      if (atIndex === -1) {
        atIndex = i;
      } else {
        // Multiple @ symbols outside quotes
        return false;
      }
    }
    escaped = char === "\\" && !escaped;
  }

  if (atIndex === -1) {
    return false;
  }

  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex + 1);

  return isValidLocalPart(localPart) && isValidDomainPart(domainPart);
}

function isValidLocalPart(localPart: string): boolean {
  if (
    !localPart ||
    localPart.length === 0 ||
    new TextEncoder().encode(localPart).byteLength > 64
  ) {
    return false;
  }

  // Check for quoted string format
  if (localPart.startsWith('"') && localPart.endsWith('"')) {
    const quotedContent = localPart.slice(1, -1);
    for (let i = 0; i < quotedContent.length;) {
      const codePoint = quotedContent.codePointAt(i);
      if (codePoint == null || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return false;
      }
      if (codePoint > 0x7f) {
        i += codePoint > 0xffff ? 2 : 1;
        continue;
      }

      if (codePoint === 0x5c) {
        const escapedCodePoint = quotedContent.codePointAt(i + 1);
        if (
          escapedCodePoint == null || escapedCodePoint < 0x20 ||
          escapedCodePoint > 0x7e
        ) return false;
        i += 2;
        continue;
      }

      if (
        codePoint < 0x20 || codePoint === 0x22 || codePoint === 0x5c ||
        codePoint > 0x7e
      ) return false;
      i++;
    }
    return true;
  }

  // Check for dot-atom format (RFC 5322)
  // No leading/trailing dots, no consecutive dots
  if (
    localPart.startsWith(".") || localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return false;
  }

  // RFC 6531 extends atext with any well-formed non-ASCII UTF-8 character.
  const asciiAtext = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]$/;
  return localPart.split(".").every((atom) =>
    atom.length > 0 && Array.from(atom).every((character) => {
      if (asciiAtext.test(character)) return true;
      const codePoint = character.codePointAt(0);
      return codePoint != null && codePoint > 0x7f &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    })
  );
}

function isValidDomainPart(domainPart: string): boolean {
  if (!domainPart || domainPart.length === 0 || domainPart.length > 253) {
    return false;
  }

  // Check for domain literal format [IP]
  if (domainPart.startsWith("[") && domainPart.endsWith("]")) {
    const literal = domainPart.slice(1, -1);
    // Use URL.canParse() for IP validation
    try {
      return URL.canParse(`http://${literal}/`);
    } catch {
      return false;
    }
  }

  // For regular domain format, use URL.canParse() for validation
  try {
    // URL.canParse() expects a valid URL, so we prepend http://
    return URL.canParse(`http://${domainPart}/`);
  } catch {
    return false;
  }
}

/**
 * Type guard function that checks if a given value is a valid email address.
 *
 * @example
 * ```ts
 * import { isEmailAddress } from "@upyo/core/address";
 *
 * const userInput = "user@example.com";
 * if (isEmailAddress(userInput)) {
 *   // TypeScript now knows userInput is EmailAddress type
 *   console.log(userInput); // Type: `${string}@${string}`
 * }
 * ```
 *
 * @param email The value to check
 * @returns `true` if the value is a valid email address, `false` otherwise
 */
export function isEmailAddress(email: unknown): email is EmailAddress {
  return typeof email === "string" && isValidEmail(email);
}
