/**
 * Configuration interface for Cloudflare Email Service transport settings.
 *
 * @example
 * ```typescript
 * const config: CloudflareConfig = {
 *   accountId: "your-account-id",
 *   apiToken: "your-api-token",
 *   timeout: 30000,
 *   retries: 3,
 * };
 * ```
 * @since 0.7.0
 */
export interface CloudflareConfig {
  /**
   * Your Cloudflare account ID.
   */
  readonly accountId: string;

  /**
   * A Cloudflare API token with permission to send email.
   *
   * Create one at https://dash.cloudflare.com/profile/api-tokens.
   */
  readonly apiToken: string;

  /**
   * Base URL for the Cloudflare API.
   *
   * @default "https://api.cloudflare.com/client/v4"
   */
  readonly baseUrl?: string;

  /**
   * HTTP request timeout in milliseconds.
   *
   * @default 30000
   */
  readonly timeout?: number;

  /**
   * Number of retry attempts when Cloudflare rejects a request with
   * a retryable status (`429` or `5xx`), as Cloudflare recommends.  Network
   * failures and timeouts are never retried, because the message may already
   * have been accepted and the API offers no idempotency key.  The same risk
   * applies, to a lesser degree, to a `5xx` answer: set this to `0` if
   * a duplicate message is worse than a failed send.
   *
   * @default 3
   */
  readonly retries?: number;

  /**
   * Additional HTTP headers to include with requests.
   */
  readonly headers?: Record<string, string>;
}

/**
 * Resolved Cloudflare configuration with all optional fields filled with
 * default values.
 *
 * @since 0.7.0
 */
export type ResolvedCloudflareConfig = Required<CloudflareConfig>;

/**
 * Creates a resolved Cloudflare configuration by applying default values to
 * optional fields.
 *
 * @param config The Cloudflare configuration with optional fields.
 * @returns A resolved configuration with all defaults applied.
 * @throws {TypeError} If `accountId` or `apiToken` is empty.
 * @internal
 */
export function createCloudflareConfig(
  config: CloudflareConfig,
): ResolvedCloudflareConfig {
  if (!config.accountId) {
    throw new TypeError("The Cloudflare account ID is required.");
  }
  if (!config.apiToken) {
    throw new TypeError("The Cloudflare API token is required.");
  }
  return {
    accountId: config.accountId,
    apiToken: config.apiToken,
    baseUrl: config.baseUrl ?? "https://api.cloudflare.com/client/v4",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    headers: config.headers ?? {},
  };
}
