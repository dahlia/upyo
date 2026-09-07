import { type Address, parseAddress } from "./address.ts";
import { type Attachment, isAttachment } from "./attachment.ts";
import { parseMessageId } from "./message-id.ts";
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

  /**
   * The RFC 5322 message identifier of the message, without the enclosing
   * angle brackets.
   *
   * Set this when the identity of the message matters to the application, so
   * that it can be stored and a reply arriving with a matching `In-Reply-To`
   * correlated back to the conversation.  The value stays the same across
   * delivery retries.  When it is left unset, a transport that composes the
   * message itself generates one.
   *
   * Not every transport carries this.  A provider that composes the message on
   * its own side may assign or rewrite the identifier regardless of what is
   * given here; see the transport's documentation.  This is also unrelated to
   * {@link Receipt.messageId}, which is the delivery handle the transport or
   * the provider reports back.
   *
   * @since 0.6.0
   */
  readonly messageId?: string;

  /**
   * The origination date of the message: when its author considers it to have
   * been sent, which is not necessarily when a transport delivers it.
   *
   * When it is left unset, a transport that composes the message itself uses
   * the time of conversion, so a retry carries a later date than the first
   * attempt.  Set it to keep the date stable.
   *
   * @since 0.6.0
   */
  readonly date?: Date;

  /**
   * The identifiers of the messages this one directly replies to, without the
   * enclosing angle brackets.
   *
   * An empty array means the message deliberately replies to nothing, which
   * suppresses an `In-Reply-To` header supplied through {@link headers};
   * leaving the field unset lets that header through.
   *
   * @since 0.6.0
   */
  readonly inReplyTo?: readonly string[];

  /**
   * The identifiers of the conversation this message belongs to, oldest first
   * and without the enclosing angle brackets.
   *
   * A reply usually carries the parent's references followed by the parent's
   * own identifier, which is how a mail client reconstructs a thread.
   *
   * An empty array means the message deliberately belongs to no conversation,
   * which suppresses a `References` header supplied through {@link headers};
   * leaving the field unset lets that header through.
   *
   * @since 0.6.0
   */
  readonly references?: readonly string[];
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

  /**
   * The RFC 5322 message identifier of the message.  The enclosing angle
   * brackets are optional and stripped, so both `abc@example.com` and
   * `<abc@example.com>` are accepted.
   *
   * Use {@link generateMessageId} to mint one before sending, so that it can
   * be stored alongside whatever the message is about.
   *
   * @since 0.6.0
   */
  readonly messageId?: string;

  /**
   * The origination date of the message.
   * @since 0.6.0
   */
  readonly date?: Date;

  /**
   * The identifier, or identifiers, of the messages this one directly replies
   * to.  A single string is one identifier, never a list.  An empty array
   * suppresses an `In-Reply-To` header supplied through {@link headers}.
   * @since 0.6.0
   */
  readonly inReplyTo?: string | readonly string[];

  /**
   * The identifiers of the conversation this message belongs to, oldest first.
   * A single string is one identifier, never a list.  An empty array
   * suppresses a `References` header supplied through {@link headers}.
   * @since 0.6.0
   */
  readonly references?: string | readonly string[];
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
 * @throws {TypeError} When any email address string cannot be parsed, when an
 *                     address or attachment carries a carriage return or line
 *                     feed that could forge header fields, when an attachment
 *                     object is invalid, when a message identifier is not
 *                     valid, or when the date is not one RFC 5322 can express.
 */
export function createMessage(constructor: MessageConstructor): Message {
  const sender = checkAddress("sender", constructor.from);
  return {
    sender,
    recipients: ensureArray(constructor.to).map((to) =>
      checkAddress("recipient", to)
    ),
    ccRecipients: ensureArray(constructor.cc).map((cc) =>
      checkAddress("CC", cc)
    ),
    bccRecipients: ensureArray(constructor.bcc).map((bcc) =>
      checkAddress("BCC", bcc)
    ),
    replyRecipients: ensureArray(constructor.replyTo).map((replyTo) =>
      checkAddress("reply-to", replyTo)
    ),
    attachments: ensureArray(constructor.attachments).map((attachment) => {
      if (attachment instanceof File) {
        return checkAttachment({
          inline: false,
          filename: attachment.name,
          content: attachment,
          contentType: attachment.type == null || attachment.type === ""
            ? "application/octet-stream"
            : attachment.type as `${string}/${string}`,
          contentId: `${crypto.randomUUID()}@${
            sender.address.replace(/^[^@]*@/, "")
          }`,
        });
      } else if (isAttachment(attachment)) {
        return checkAttachment(attachment);
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
    messageId: constructor.messageId == null
      ? undefined
      : checkMessageId("", constructor.messageId),
    date: checkDate(constructor.date),
    inReplyTo: checkMessageIds("in-reply-to ", constructor.inReplyTo),
    references: checkMessageIds("references ", constructor.references),
  };
}

function throwTypeError(message: string): never {
  throw new TypeError(message);
}

/**
 * Normalizes an address and rejects one that could forge header fields.
 *
 * A transport that composes a message itself writes the address into a header
 * field as given, so a carriage return or line feed in it would end that field
 * and let the rest of the value appear as further fields.  The string form has
 * always been rejected by {@link parseAddress}; the object form used to pass
 * through unchecked.
 *
 * @param label How the address is described in the error message.
 * @param address The address, either an object or a string to parse.
 * @returns The normalized address.
 * @throws {TypeError} If the string cannot be parsed, or if the resulting
 * address contains a carriage return or line feed.
 */
function checkAddress(label: string, address: Address | string): Address {
  const parsed = typeof address === "string"
    ? parseAddress(address) ??
      throwTypeError(`Invalid ${label} address: ${JSON.stringify(address)}`)
    : address;
  if (/[\r\n]/.test(parsed.address)) {
    throwTypeError(
      `Invalid ${label} address: ${JSON.stringify(parsed.address)}`,
    );
  }
  return parsed;
}

/**
 * Rejects an attachment whose content type or content ID could forge header
 * fields.
 *
 * A transport that composes MIME itself writes both into the part headers as
 * given, so a carriage return or line feed in either would end that field and
 * let the rest of the value appear as further fields.  An uploaded file's
 * declared content type is routinely chosen by whoever uploaded it.
 *
 * @param attachment The attachment to check.
 * @returns The attachment, unchanged.
 * @throws {TypeError} If the content type or content ID contains a carriage
 * return or line feed.
 */
function checkAttachment(attachment: Attachment): Attachment {
  if (/[\r\n]/.test(attachment.contentType)) {
    throwTypeError(
      `Invalid attachment content type: ${
        JSON.stringify(attachment.contentType)
      }`,
    );
  }
  if (/[\r\n]/.test(attachment.contentId)) {
    throwTypeError(
      `Invalid attachment content ID: ${JSON.stringify(attachment.contentId)}`,
    );
  }
  return attachment;
}

/**
 * Normalizes a message identifier, rejecting one that is not valid.
 *
 * A transport writes the identifier into a structured header field as given,
 * without the RFC 2047 encoding that neutralizes a carriage return or line feed
 * in a free-form value, so an invalid one has to be refused rather than
 * repaired.
 *
 * @param label How the identifier is described in the error message.
 * @param id The identifier, with or without the enclosing angle brackets.
 * @returns The identifier in its bare form.
 * @throws {TypeError} If the value is not a valid message identifier.
 */
function checkMessageId(label: string, id: string): string {
  return parseMessageId(id) ??
    throwTypeError(`Invalid ${label}message ID: ${JSON.stringify(id)}`);
}

/**
 * Normalizes a list of message identifiers, preserving the difference between
 * an absent list and an empty one: the first defers to a header supplied
 * through {@link MessageConstructor.headers}, while the second suppresses it.
 *
 * @param label How the identifiers are described in the error message.
 * @param ids One identifier, several, or none.
 * @returns The identifiers in their bare form, or `undefined` if none were
 *          given.
 * @throws {TypeError} If any value is not a valid message identifier.
 */
function checkMessageIds(
  label: string,
  ids: string | readonly string[] | undefined,
): readonly string[] | undefined {
  if (ids == null) return undefined;
  return (typeof ids === "string" ? [ids] : ids)
    .map((id) => checkMessageId(label, id));
}

/**
 * Checks an origination date and copies it, so that a later mutation of the
 * caller's `Date` cannot change what a retry sends.
 *
 * @param date The date to check, if any.
 * @returns A copy of the date, or `undefined` if none was given.
 * @throws {TypeError} If the date is invalid, or earlier than RFC 5322 §3.3
 * can express.
 */
function checkDate(date: Date | undefined): Date | undefined {
  if (date == null) return undefined;
  const time = date instanceof Date ? date.getTime() : Number.NaN;
  if (Number.isNaN(time) || date.getUTCFullYear() < 1900) {
    throwTypeError(`Invalid date: ${JSON.stringify(date)}`);
  }
  return new Date(time);
}

function ensureArray<T>(
  value: T | T[] | null | undefined,
): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
