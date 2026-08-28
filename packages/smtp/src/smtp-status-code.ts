import type { SmtpEnhancedStatusCode } from "./smtp-receipt.ts";

/**
 * Parses an enhanced SMTP status code from the beginning of reply text.
 *
 * RFC 2034 requires the enhanced class to agree with the three-digit SMTP
 * reply class.  RFC 3463 also prohibits leading zeroes and limits the subject
 * and detail fields to three digits.
 *
 * @param replyCode The three-digit SMTP reply code.
 * @param response The textual part of the SMTP reply.
 * @returns The parsed enhanced status code, or `undefined` when the reply does
 *          not begin with a valid, consistent code.
 * @since 0.6.0
 */
export function parseEnhancedSmtpStatusCode(
  replyCode: number,
  response: string,
): SmtpEnhancedStatusCode | undefined {
  const match = /^([245])\.((?:0|[1-9][0-9]{0,2}))\.((?:0|[1-9][0-9]{0,2})) +/
    .exec(response);
  if (match == null) return undefined;

  const statusClass = Number(match[1]) as 2 | 4 | 5;
  if (Math.trunc(replyCode / 100) !== statusClass) return undefined;

  return {
    code: `${match[1]}.${match[2]}.${match[3]}`,
    class: statusClass,
    subject: Number(match[2]),
    detail: Number(match[3]),
  };
}
