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
   * The content of the attachment as a byte array.  It can be a `Promise`
   * that resolves to a `Uint8Array`, allowing for asynchronous loading
   * of the attachment content.
   */
  readonly content: Uint8Array | Promise<Uint8Array>;

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

/**
 * Checks if the provided value is an {@link Attachment} object.
 * @param attachment The value to check.
 * @return `true` if the value is an {@link Attachment}, otherwise `false`.
 */
export function isAttachment(attachment: unknown): attachment is Attachment {
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    "inline" in attachment &&
    "filename" in attachment &&
    "content" in attachment &&
    "contentType" in attachment &&
    "contentId" in attachment &&
    typeof attachment.inline === "boolean" &&
    typeof attachment.filename === "string" &&
    (attachment.content instanceof Uint8Array ||
      (attachment.content instanceof Promise &&
        typeof attachment.content.then === "function")) &&
    typeof attachment.contentType === "string" &&
    typeof attachment.contentId === "string"
  );
}
