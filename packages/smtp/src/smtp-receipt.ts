import type { Receipt } from "@upyo/core";

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
}

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
