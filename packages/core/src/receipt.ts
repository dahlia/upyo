/**
 * The response from the email service after sending an email message.
 *
 * This type uses a discriminated union to ensure type safety:
 *
 * - Successful sends have a `messageId` but no `errorMessages`
 * - Failed sends have `errorMessages` but no `messageId`
 */
export type Receipt =
  | {
    /**
     * Indicates that the email was sent successfully.
     */
    readonly successful: true;
    /**
     * The unique identifier for the message that was sent.
     */
    readonly messageId: string;
  }
  | {
    /**
     * Indicates that the email failed to send.
     */
    readonly successful: false;
    /**
     * An array of error messages that occurred during the sending process.
     */
    readonly errorMessages: readonly string[];
  };
