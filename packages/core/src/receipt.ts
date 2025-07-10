/**
 * The response from the email service after sending an email message.
 */
export interface Receipt {
  /**
   * The unique identifier for the message that was sent.
   */
  readonly messageId: string;

  /**
   * An array of error messages that occurred during the sending process,
   * if any. If the email was sent successfully, this array will be empty.
   */
  readonly errorMessages: string[];

  /**
   * Indicates whether the email was sent successfully.
   */
  readonly successful: boolean;
}
