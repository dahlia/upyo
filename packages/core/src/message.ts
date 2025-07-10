import type { Address } from "./address.ts";
import type { Attachment } from "./attachment.ts";
import type { Priority } from "./priority.ts";

/**
 * Represents an email message with various properties such as
 * sender, recipients, subject, content, and attachments.
 */
export interface Message {
  /**
   * The email address of the sender of the message.
   */
  readonly sender: Address;

  /**
   * The email addresses of the recipient of the message.
   */
  readonly recipients: Address[];

  /**
   * The email addresses of the carbon copy (CC) recipients of the message.
   */
  readonly ccRecipients: Address[];

  /**
   * The email addresses of the blind carbon copy (BCC) recipients of the message.
   */
  readonly bccRecipients: Address[];

  /**
   * The email addresses of the reply-to recipients of the message.
   */
  readonly replyRecipients: Address[];

  /**
   * The attachments included in the email message.  These are files that
   * are sent along with the email, such as documents, images, or other
   * media files.  Each attachment is represented by an {@link Attachment}
   * object, which contains information about the attachment such as its
   * filename, content type, and content ID.
   */

  readonly attachments: Attachment[];

  /**
   * The subject of the email message.  This is typically a brief summary
   * of the content of the email, and is used to help the recipient identify
   * the purpose of the message.
   */
  readonly subject: string;

  /**
   * The content of the email message, which can be either HTML or plain text.
   * This property is represented by the {@link MessageContent} type, which
   * includes both HTML and plain text content.  The HTML content is typically
   * used for rich formatting and layout, while the plain text content is
   * used for simple text emails or for compatibility with email clients
   * that do not support HTML.
   */
  readonly content: MessageContent;

  /**
   * The priority of the email message, which indicates its importance
   * relative to other messages.  The priority can be one of three
   * levels: `"high"`, `"normal"`, or `"low"`.  This is represented by
   * the {@link Priority} type, which is a string literal type that
   * allows only these three values.
   */
  readonly priority: Priority;

  /**
   * The tags associated with the email message.
   */
  readonly tags: string[];

  /**
   * The headers of the email message.  This is represented by
   * the {@link ImmutableHeaders} type, which is a supertype of
   * the standard `Headers` class.  The `ImmutableHeaders` type
   * includes only the methods for reading the headers, such as `get`, `keys`,
   * `has`, and `entries`, but does not include methods for modifying
   * the headers, such as `append`, `delete`, or `set`.
   */
  readonly headers: ImmutableHeaders;
}

/**
 * Represents the content of an email message, which can be either HTML
 * or plain text.  The `html` property is optional, and if it is
 * provided, the `text` property may also be included for
 * compatibility with email clients that do not support HTML.
 */
export type MessageContent =
  | {
    /**
     * The HTML content of the email message.  This is typically used
     * for rich formatting and layout.
     */
    html: string;

    /**
     * The alternative plain text content of the email message.  This is
     * optional and may be included for compatibility with email
     * clients that do not support HTML.
     */
    text?: string;
  }
  | {
    /**
     * The plain text content of the email message.  This is typically
     * used for simple text emails.
     */
    text: string;
  };

/**
 * Represents the headers of an email message.  This type is a supertype of
 * the standard `Headers` class, which is used to manage HTTP headers.
 * Note that this type does not include methods for modifying the headers,
 * such as `append`, `delete`, or `set`.  It is intended to be used for
 * read-only access to the headers of an email message.
 */
export type ImmutableHeaders = Omit<Headers, "append" | "delete" | "set">;
