import { type Address, parseAddress } from "./address.ts";
import { type Attachment, isAttachment } from "./attachment.ts";
import type { Priority } from "./priority.ts";

/**
 * Represents an email message with various properties such as
 * sender, recipients, subject, content, and attachments.
 *
 * You wouldn't typically create this type directly.  Instead, you probably
 * want to use the {@link createMessage} function, which provides a more
 * convenient API for creating messages.
 */
export interface Message {
  /**
   * The email address of the sender of the message.
   */
  readonly sender: Address;

  /**
   * The email addresses of the recipient of the message.
   */
  readonly recipients: readonly Address[];

  /**
   * The email addresses of the carbon copy (CC) recipients of the message.
   */
  readonly ccRecipients: readonly Address[];

  /**
   * The email addresses of the blind carbon copy (BCC) recipients of the message.
   */
  readonly bccRecipients: readonly Address[];

  /**
   * The email addresses of the reply-to recipients of the message.
   */
  readonly replyRecipients: readonly Address[];

  /**
   * The attachments included in the email message.  These are files that
   * are sent along with the email, such as documents, images, or other
   * media files.  Each attachment is represented by an {@link Attachment}
   * object, which contains information about the attachment such as its
   * filename, content type, and content ID.
   */

  readonly attachments: readonly Attachment[];

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
  readonly tags: readonly string[];

  /**
   * The headers of the email message.  This is represented by
   * the {@link ImmutableHeaders} type, which is a supertype of
   * the standard `Headers` class.  The `ImmutableHeaders` type
   * includes only the methods for reading the headers, such as `get`, `keys`,
   * `has`, and `entries`, but does not include methods for modifying
   * the headers, such as `append`, `delete`, or `set`.
   */
  readonly headers: ImmutableHeaders;

  /**
   * An idempotency key to ensure that the same message is not sent multiple
   * times.  This is useful for retrying failed send operations without
   * risking duplicate delivery.
   *
   * If provided, the transport will use this key to deduplicate requests.
   * If not provided, the transport may generate its own key internally
   * (behavior varies by transport implementation).
   *
   * The key should be unique for each distinct message you want to send.
   * When retrying the same message, use the same idempotency key.
   *
   * Note: Not all transports support idempotency keys.  Check the specific
   * transport documentation for details.
   *
   * @since 0.4.0
   */
  readonly idempotencyKey?: string;
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

/**
 * A constructor interface for creating a new email message using
 * the {@link createMessage} function.
 */
export interface MessageConstructor {
  /**
   * The email address of the sender of the message.
   */
  readonly from: Address | string;

  /**
   * The email addresses of the recipient of the message.
   */
  readonly to: Address | string | (Address | string)[];

  /**
   * The email addresses of the carbon copy (CC) recipients of the message.
   * @default `[]`
   */
  readonly cc?: Address | string | (Address | string)[];

  /**
   * The email addresses of the blind carbon copy (BCC) recipients of the message.
   * @default `[]`
   */
  readonly bcc?: Address | string | (Address | string)[];

  /**
   * The email addresses of the reply-to recipients of the message.
   * @default `[]`
   */
  readonly replyTo?: Address | string | (Address | string)[];

  /**
   * The attachments included in the email message.  These are files that
   * are sent along with the email, such as documents, images, or other
   * media files.  Each attachment can be represented by an {@link Attachment}
   * or a `File` object, which contains information about the attachment such as
   * its filename and content type.
   * @default `[]`
   */
  readonly attachments?: Attachment | File | (Attachment | File)[];

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
   * @default `"normal"`
   */
  readonly priority?: Priority;

  /**
   * The tags associated with the email message.
   * @default `[]`
   */
  readonly tags?: string[];

  /**
   * The headers of the email message.
   * @default `{}`
   */
  readonly headers?: ImmutableHeaders | Record<string, string>;

  /**
   * An idempotency key to ensure that the same message is not sent multiple
   * times.  This is useful for retrying failed send operations without
   * risking duplicate delivery.
   *
   * If provided, the transport will use this key to deduplicate requests.
   * If not provided, the transport may generate its own key internally
   * (behavior varies by transport implementation).
   *
   * The key should be unique for each distinct message you want to send.
   * When retrying the same message, use the same idempotency key.
   *
   * Note: Not all transports support idempotency keys.  Check the specific
   * transport documentation for details.
   *
   * @since 0.4.0
   */
  readonly idempotencyKey?: string;
}

/**
 * Creates a new email {@link Message} based on the provided constructor
 * parameters.  This function provides a more convenient API for creating
 * messages compared to constructing a {@link Message} object directly.
 *
 * @example
 * ```typescript
 * const message = createMessage({
 *   from: "sender@example.com",
 *   to: "recipient1@example.com",
 *   subject: "Hello World",
 *   content: { text: "This is a test message" }
 * });
 * ```
 *
 * @param constructor The constructor parameters for the message. Uses more
 *                    user-friendly types like accepting strings for email
 *                    addresses and `File` objects for attachments.
 * @returns A new {@link Message} object with all properties normalized and
 *          validated.
 * @throws {TypeError} When any email address string cannot be parsed or when
 *                     an attachment object is invalid.
 */
export function createMessage(constructor: MessageConstructor): Message {
  const sender = typeof constructor.from === "string"
    ? parseAddress(constructor.from) ??
      throwTypeError(
        `Invalid sender address: ${JSON.stringify(constructor.from)}`,
      )
    : constructor.from;
  return {
    sender,
    recipients: ensureArray(constructor.to).map((to) =>
      typeof to === "string"
        ? parseAddress(to) ??
          throwTypeError(`Invalid recipient address: ${JSON.stringify(to)}`)
        : to
    ),
    ccRecipients: ensureArray(constructor.cc).map((cc) =>
      typeof cc === "string"
        ? parseAddress(cc) ??
          throwTypeError(`Invalid CC address: ${JSON.stringify(cc)}`)
        : cc
    ),
    bccRecipients: ensureArray(constructor.bcc).map((bcc) =>
      typeof bcc === "string"
        ? parseAddress(bcc) ??
          throwTypeError(`Invalid BCC address: ${JSON.stringify(bcc)}`)
        : bcc
    ),
    replyRecipients: ensureArray(constructor.replyTo).map((replyTo) =>
      typeof replyTo === "string"
        ? parseAddress(replyTo) ??
          throwTypeError(`Invalid reply-to address: ${JSON.stringify(replyTo)}`)
        : replyTo
    ),
    attachments: ensureArray(constructor.attachments).map((attachment) => {
      if (attachment instanceof File) {
        return {
          inline: false,
          filename: attachment.name,
          content: attachment.arrayBuffer().then((b) => new Uint8Array(b)),
          contentType: attachment.type == null || attachment.type === ""
            ? "application/octet-stream"
            : attachment.type as `${string}/${string}`,
          contentId: `${crypto.randomUUID()}@${
            sender.address.replace(/^[^@]*@/, "")
          }`,
        };
      } else if (isAttachment(attachment)) {
        return attachment;
      } else {
        throwTypeError(`Invalid attachment: ${JSON.stringify(attachment)}`);
      }
    }),
    subject: constructor.subject,
    content: constructor.content,
    priority: constructor.priority ?? "normal",
    tags: ensureArray(constructor.tags),
    headers: new Headers(constructor.headers ?? {}),
    idempotencyKey: constructor.idempotencyKey,
  };
}

function throwTypeError(message: string): never {
  throw new TypeError(message);
}

function ensureArray<T>(
  value: T | T[] | null | undefined,
): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
