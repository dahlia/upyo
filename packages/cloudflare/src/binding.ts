// These types describe the part of the Workers `send_email` binding that the
// transport uses, so that the package needs neither @cloudflare/workers-types
// nor the `cloudflare:email` module.  They mirror the binding's own types in
// @cloudflare/workers-types; arrays are not `readonly` because the binding's
// types declare mutable arrays, which a readonly array cannot be passed to.

/**
 * A named address, as the Workers binding takes it.
 *
 * @since 0.7.0
 */
export interface CloudflareBindingAddress {
  /**
   * The display name.
   */
  readonly name: string;

  /**
   * The email address.
   */
  readonly email: string;
}

/**
 * An attachment, as the Workers binding takes it.  The content is raw bytes,
 * not base64.  An inline part needs a content ID.
 *
 * @since 0.7.0
 */
export type CloudflareBindingAttachment =
  | {
      readonly disposition: "inline";
      readonly contentId: string;
      readonly filename: string;
      readonly type: string;
      readonly content: Uint8Array;
    }
  | {
      readonly disposition: "attachment";
      readonly filename: string;
      readonly type: string;
      readonly content: Uint8Array;
    };

/**
 * The message the transport passes to the Workers binding's `send()`.
 *
 * @since 0.7.0
 */
export interface CloudflareBindingMessage {
  /**
   * The sender.
   */
  readonly from: string | CloudflareBindingAddress;

  /**
   * The recipients.
   */
  readonly to: (string | CloudflareBindingAddress)[];

  /**
   * The carbon copy recipients.
   */
  readonly cc?: (string | CloudflareBindingAddress)[];

  /**
   * The blind carbon copy recipients.
   */
  readonly bcc?: (string | CloudflareBindingAddress)[];

  /**
   * The reply-to address.  The binding takes only one.
   */
  readonly replyTo?: string | CloudflareBindingAddress;

  /**
   * The subject.
   */
  readonly subject: string;

  /**
   * The plain text body.
   */
  readonly text?: string;

  /**
   * The HTML body.
   */
  readonly html?: string;

  /**
   * Custom headers.
   */
  readonly headers?: Record<string, string>;

  /**
   * Attachments and inline parts.
   */
  readonly attachments?: CloudflareBindingAttachment[];
}

/**
 * What the Workers binding's `send()` resolves to.
 *
 * @since 0.7.0
 */
export interface CloudflareEmailSendResult {
  /**
   * The identifier of the sent message.
   */
  readonly messageId: string;
}

/**
 * A Workers `send_email` binding, such as `env.EMAIL` with this in
 * *wrangler.jsonc*:
 *
 * ```jsonc
 * { "send_email": [{ "name": "EMAIL" }] }
 * ```
 *
 * The binding's own type from @cloudflare/workers-types (`SendEmail`) fits
 * this interface.
 *
 * @since 0.7.0
 */
export interface CloudflareEmailBinding {
  /**
   * Sends a message.
   *
   * @param message The message to send.
   * @returns The identifier of the sent message.
   * @throws {Error} With a `code` such as `E_RATE_LIMIT_EXCEEDED` if Cloudflare
   *         does not accept the message.
   */
  send(message: CloudflareBindingMessage): Promise<CloudflareEmailSendResult>;
}
