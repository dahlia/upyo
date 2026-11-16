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
   * a retryable status (`429` or `5xx`).  Network failures and timeouts are
   * not retried, because the message may already have been accepted and the
   * API offers no idempotency key.  Their receipts are still marked retryable,
   * as with other transports, since another attempt may succeed, so
   * a `RetryTransport` around this transport retries them unless its
   * `shouldRetry` excludes them.  The same risk applies, to a lesser degree,
   * to a `5xx` answer: set this to `0` if a duplicate message is worse than
   * a failed send.
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
 * @throws {RangeError} If `retries` is not a non-negative integer, or
 *         `timeout` is not a number of milliseconds a timer can wait.
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
    timeout: checkTimeout(config.timeout ?? 30000),
    retries: checkRetries(config.retries ?? 3),
    headers: config.headers ?? {},
  };
}

/**
 * Checks a `retries` option, which must be a non-negative integer; anything
 * else, such as `NaN`, would never end a retry loop.
 *
 * @param retries The option to check.
 * @returns The option, unchanged.
 * @throws {RangeError} If the option is not a non-negative integer.
 * @internal
 */
export function checkRetries(retries: number): number {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(
      "The retries option must be an integer greater than or equal to 0.",
    );
  }
  return retries;
}

/**
 * Checks a `timeout` option.  Timers treat a delay above 2,147,483,647 ms, or
 * one that is not finite, as 1 ms, so those are rejected along with values
 * below 1 ms.
 *
 * @throws {RangeError} If the option is outside that range.
 */
function checkTimeout(timeout: number): number {
  if (!(timeout >= 1 && timeout <= 2147483647)) {
    throw new RangeError(
      "The timeout option must be between 1 and 2147483647 milliseconds.",
    );
  }
  return timeout;
}
