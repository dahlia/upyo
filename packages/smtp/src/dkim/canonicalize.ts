/**
 * DKIM Canonicalization algorithms per RFC 6376 Section 3.4.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6376#section-3.4
 * @since 0.4.0
 */

/**
 * Simple header canonicalization.
 *
 * The "simple" header canonicalization algorithm does not change header
 * fields in any way. Header fields are presented to the signing or
 * verification algorithm exactly as they are in the message.
 *
 * @param name - The header field name
 * @param value - The header field value
 * @returns The canonicalized header line (name:value)
 * @see RFC 6376 Section 3.4.1
 * @since 0.4.0
 */
export function canonicalizeHeaderSimple(name: string, value: string): string {
  return `${name}:${value}`;
}

/**
 * Relaxed header canonicalization.
 *
 * The "relaxed" header canonicalization algorithm:
 * - Convert header field names to lowercase
 * - Unfold header field continuation lines
 * - Collapse whitespace sequences to a single space
 * - Remove leading and trailing whitespace from header field values
 *
 * @param name - The header field name
 * @param value - The header field value
 * @returns The canonicalized header line (name:value)
 * @see RFC 6376 Section 3.4.2
 * @since 0.4.0
 */
export function canonicalizeHeaderRelaxed(
  name: string,
  value: string,
): string {
  // Convert header field name to lowercase
  const canonicalName = name.toLowerCase();

  // Unfold header field value (remove CRLF followed by WSP)
  // and collapse all sequences of WSP to a single space
  const canonicalValue = value
    .replace(/\r\n[\t ]+/g, " ") // Unfold continuation lines
    .replace(/[\t ]+/g, " ") // Collapse whitespace sequences
    .trim(); // Remove leading and trailing whitespace

  return `${canonicalName}:${canonicalValue}`;
}

/**
 * Simple body canonicalization.
 *
 * The "simple" body canonicalization algorithm:
 * - Ignores all empty lines at the end of the message body
 * - If the body is empty, a single CRLF is appended
 * - If there is no trailing CRLF on the body, a CRLF is added
 *
 * @param body - The message body
 * @returns The canonicalized body
 * @see RFC 6376 Section 3.4.3
 * @since 0.4.0
 */
export function canonicalizeBodySimple(body: string): string {
  if (body === "") {
    return "\r\n";
  }

  // Remove trailing empty lines (lines containing only CRLF)
  let result = body.replace(/(\r\n)+$/, "");

  // Ensure the body ends with a single CRLF
  if (!result.endsWith("\r\n")) {
    result += "\r\n";
  }

  return result;
}

/**
 * Relaxed body canonicalization.
 *
 * The "relaxed" body canonicalization algorithm:
 * - Reduce all sequences of WSP within a line to a single SP
 * - Remove all trailing WSP at the end of each line (before CRLF)
 * - Ignore all empty lines at the end of the message body
 * - If the body is non-empty and doesn't end with CRLF, add CRLF
 *
 * @param body - The message body
 * @returns The canonicalized body
 * @see RFC 6376 Section 3.4.4
 * @since 0.4.0
 */
export function canonicalizeBodyRelaxed(body: string): string {
  if (body === "") {
    return "";
  }

  // Ensure body ends with CRLF for processing
  let processedBody = body;
  if (!processedBody.endsWith("\r\n")) {
    processedBody += "\r\n";
  }

  // Process each line
  const lines = processedBody.split("\r\n");
  const canonicalizedLines: string[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    // -1 because split creates an empty element after final CRLF
    let line = lines[i];

    // Collapse WSP sequences to single space
    line = line.replace(/[\t ]+/g, " ");

    // Remove trailing WSP
    line = line.replace(/[\t ]+$/, "");

    canonicalizedLines.push(line);
  }

  // Remove trailing empty lines
  while (
    canonicalizedLines.length > 0 &&
    canonicalizedLines[canonicalizedLines.length - 1] === ""
  ) {
    canonicalizedLines.pop();
  }

  // If no content remains, return empty string
  if (canonicalizedLines.length === 0) {
    return "";
  }

  // Join with CRLF and add final CRLF
  return canonicalizedLines.join("\r\n") + "\r\n";
}
