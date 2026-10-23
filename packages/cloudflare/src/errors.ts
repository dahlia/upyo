/**
 * Error code of a {@link CloudflareValidationError}.
 *
 * @since 0.7.0
 */
export type CloudflareValidationErrorCode =
  | "cloudflare.header_not_allowed"
  | "cloudflare.header_use_api_field"
  | "cloudflare.too_many_recipients";

/**
 * Error thrown when a message cannot be sent through Cloudflare Email
 * Service because Cloudflare would reject it.  It is raised before any request
 * is made, and {@link CloudflareTransport.send} reports it as a failed receipt
 * with the same `code`.
 *
 * @since 0.7.0
 */
export class CloudflareValidationError extends Error {
  /**
   * Machine-readable code identifying the violated rule.
   */
  readonly code: CloudflareValidationErrorCode;

  /**
   * Creates a validation error.
   *
   * @param message Human-readable error message.
   * @param code Machine-readable code identifying the violated rule.
   */
  constructor(message: string, code: CloudflareValidationErrorCode) {
    super(message);
    this.name = "CloudflareValidationError";
    this.code = code;
  }
}
