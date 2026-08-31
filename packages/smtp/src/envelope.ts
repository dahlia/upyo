import { type EmailAddress, isEmailAddress, type Message } from "@upyo/core";

/**
 * Overrides for the SMTP envelope of one message.
 *
 * Omitted fields are derived from the corresponding message fields.  A `null`
 * sender produces the null reverse-path used for delivery notifications.
 *
 * @since 0.6.0
 */
export interface SmtpEnvelopeOptions {
  /**
   * The address for `MAIL FROM`, or `null` for `MAIL FROM:<>`.
   *
   * When omitted, the message sender is used.
   */
  readonly from?: EmailAddress | null;

  /**
   * The addresses for `RCPT TO`.
   *
   * When omitted, the message's To, Cc, and Bcc addresses are used.
   */
  readonly to?: readonly EmailAddress[];
}

/**
 * Resolves an SMTP envelope override for one message in a batch.
 *
 * @param message The message whose envelope is being resolved.
 * @param index The zero-based position of the message in the send operation.
 * @returns The envelope override, or `undefined` to derive the envelope from
 * the message.
 * @since 0.6.0
 */
export type SmtpEnvelopeResolver = (
  message: Message,
  index: number,
) => SmtpEnvelopeOptions | undefined;

/**
 * Error produced when an effective SMTP envelope is invalid.
 *
 * @since 0.6.0
 */
export class SmtpEnvelopeValidationError extends TypeError {
  /**
   * Creates an SMTP envelope validation error.
   *
   * @param message A description of the invalid envelope.
   */
  constructor(message: string) {
    super(message);
    this.name = "SmtpEnvelopeValidationError";
  }
}

/** @internal */
export interface ResolvedSmtpEnvelope {
  readonly from: EmailAddress | null;
  readonly to: readonly EmailAddress[];
}

/**
 * Resolves and validates the SMTP envelope for a message.
 *
 * @param message The message that supplies fields without an override.
 * @param override Optional sender and recipient overrides.
 * @returns The validated effective SMTP envelope.
 * @throws {SmtpEnvelopeValidationError} If the override or any effective
 * address is invalid, or if the effective recipient list is empty.
 * @internal
 */
export function resolveSmtpEnvelope(
  message: Message,
  override?: SmtpEnvelopeOptions,
): ResolvedSmtpEnvelope {
  if (
    override !== undefined &&
    (override === null || typeof override !== "object" ||
      Array.isArray(override))
  ) {
    throw new SmtpEnvelopeValidationError(
      "SMTP envelope options must be an object.",
    );
  }

  const from = override?.from === undefined
    ? message.sender.address
    : override.from;
  if (from !== null && !isEmailAddress(from)) {
    throw new SmtpEnvelopeValidationError(
      "SMTP envelope sender must be a valid email address or null.",
    );
  }

  const recipients = override?.to === undefined
    ? [
      ...message.recipients.map((recipient) => recipient.address),
      ...message.ccRecipients.map((recipient) => recipient.address),
      ...message.bccRecipients.map((recipient) => recipient.address),
    ]
    : override.to;
  if (!Array.isArray(recipients)) {
    throw new SmtpEnvelopeValidationError(
      "SMTP envelope recipients must be an array.",
    );
  }
  if (recipients.length === 0) {
    throw new SmtpEnvelopeValidationError(
      "SMTP envelope must contain at least one recipient.",
    );
  }

  for (const [index, recipient] of recipients.entries()) {
    if (!isEmailAddress(recipient)) {
      throw new SmtpEnvelopeValidationError(
        `SMTP envelope recipient at index ${index} must be a valid email address.`,
      );
    }
  }

  return { from, to: [...recipients] };
}
