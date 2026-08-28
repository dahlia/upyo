import type { Receipt } from "@upyo/core";

/**
 * A machine-readable enhanced SMTP status code defined by RFC 3463.
 *
 * @since 0.6.0
 */
export interface SmtpEnhancedStatusCode {
  /** The complete enhanced status code. */
  readonly code: string;

  /** The delivery result class: success, transient failure, or permanent failure. */
  readonly class: 2 | 4 | 5;

  /** The subject identifying the probable source of the condition. */
  readonly subject: number;

  /** The detail identifying the precise condition. */
  readonly detail: number;
}

/**
 * An SMTP envelope recipient that the server rejected during an otherwise
 * successful delivery.
 *
 * @since 0.5.3
 */
export interface SmtpRejectedRecipient {
  /** The rejected recipient address. */
  readonly recipient: string;

  /** The three-digit SMTP reply code. */
  readonly code: number;

  /** The SMTP server's reply text. */
  readonly response: string;

  /** Whether retrying delivery to this recipient may succeed. */
  readonly retryable: boolean;

  /**
   * The enhanced status code returned for this recipient, when valid.
   *
   * @since 0.6.0
   */
  readonly enhancedStatusCode?: SmtpEnhancedStatusCode;
}

/**
 * Provider details for a failure returned by an SMTP server.
 *
 * @since 0.6.0
 */
export interface SmtpResponseProviderDetails {
  /** The SMTP command that failed. */
  readonly command: string;

  /** The text from the SMTP server's final reply line. */
  readonly response: string;

  /** Recipient-level failures collected for the transaction. */
  readonly rejectedRecipients?: readonly SmtpRejectedRecipient[];

  /** The enhanced status code in the server reply, when valid. */
  readonly enhancedStatusCode?: SmtpEnhancedStatusCode;
}

/**
 * Checks whether provider details came from an SMTP server response.
 *
 * @param value Provider details from an SMTP receipt error.
 * @returns Whether the value contains SMTP response details.
 * @since 0.6.0
 */
export function isSmtpResponseProviderDetails(
  value: unknown,
): value is SmtpResponseProviderDetails {
  return value != null && typeof value === "object" &&
    "command" in value && typeof value.command === "string" &&
    "response" in value && typeof value.response === "string";
}

/**
 * Provider details for a locally rejected oversized message.
 *
 * @since 0.6.0
 */
export interface SmtpMessageSizeProviderDetails {
  /** The encoded message size in octets. */
  readonly actualSize: number;

  /** The server's advertised maximum size in octets. */
  readonly maximumSize: string;
}

/**
 * Provider details for a missing internationalization capability.
 *
 * @since 0.6.0
 */
export interface SmtpUtf8ProviderDetails {
  /** The SMTP extension required by the message. */
  readonly missingCapability: "SMTPUTF8" | "8BITMIME";
}

/**
 * Provider-specific details attached to SMTP receipt errors.
 *
 * @since 0.6.0
 */
export type SmtpProviderDetails =
  | SmtpResponseProviderDetails
  | SmtpMessageSizeProviderDetails
  | SmtpUtf8ProviderDetails;

/**
 * A receipt returned by {@link SmtpTransport}.
 *
 * Successful receipts list any recipients rejected before the message was
 * delivered to the remaining accepted recipients.  Callers can retry delivery
 * to entries marked as retryable without redelivering to accepted recipients.
 *
 * @since 0.5.3
 */
export type SmtpReceipt =
  | (Extract<Receipt<"smtp">, { readonly successful: true }> & {
    /** Recipients excluded from an otherwise successful delivery. */
    readonly rejectedRecipients: readonly SmtpRejectedRecipient[];
  })
  | Extract<Receipt<"smtp">, { readonly successful: false }>;
