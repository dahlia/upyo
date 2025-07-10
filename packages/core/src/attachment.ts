/**
 * Represents an attachment in an email message.
 */
export interface Attachment {
  /**
   * Whether the attachment is intended to be used for inline images.
   */
  readonly inline: boolean;

  /**
   * The filename of the attachment, which is used for display purposes
   * and may not be the actual name of the file on disk.
   */
  readonly filename: string;

  /**
   * The content of the attachment as a byte array.
   */
  readonly content: Uint8Array;

  /**
   * The media type of the attachment, which indicates the type of content
   * and how it should be handled by email clients.
   */
  readonly contentType: `${string}/${string}`;

  /**
   * The content ID of the attachment, which is used to reference
   * inline images in HTML emails.
   */
  readonly contentId: string;
}
