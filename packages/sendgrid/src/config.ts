/**
 * Configuration interface for SendGrid transport connection settings.
 *
 * This interface defines all available options for configuring a SendGrid
 * API connection including authentication, HTTP options, and tracking settings.
 *
 * @example
 * ```typescript
 * const config: SendGridConfig = {
 *   apiKey: 'your-api-key',
 *   timeout: 30000,
 *   retries: 3,
 *   tracking: true
 * };
 * ```
 */
export interface SendGridConfig {
  /**
   * Your SendGrid API key.
   *
   * You can find your API key in the SendGrid Control Panel under Settings > API Keys.
   * It should start with 'SG.' for v3 API keys.
   */
  readonly apiKey: string;

  /**
   * Base URL for the SendGrid API.
   *
   * @default "https://api.sendgrid.com/v3"
   */
  readonly baseUrl?: string;

  /**
   * HTTP request timeout in milliseconds.
   *
   * @default 30000
   */
  readonly timeout?: number;

  /**
   * Number of retry attempts for failed requests.
   *
   * @default 3
   */
  readonly retries?: number;

  /**
   * Whether to validate SSL certificates.
   *
   * @default true
   */
  readonly validateSsl?: boolean;

  /**
   * Additional HTTP headers to include with requests.
   */
  readonly headers?: Record<string, string>;

  /**
   * Whether to enable click tracking for sent messages.
   *
   * @default true
   */
  readonly clickTracking?: boolean;

  /**
   * Whether to enable open tracking for sent messages.
   *
   * @default true
   */
  readonly openTracking?: boolean;

  /**
   * Whether to enable subscription tracking for sent messages.
   *
   * @default false
   */
  readonly subscriptionTracking?: boolean;

  /**
   * Whether to enable Google Analytics tracking for sent messages.
   *
   * @default false
   */
  readonly googleAnalytics?: boolean;
}

/**
 * Resolved SendGrid configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the SendGrid transport implementation.
 */
export type ResolvedSendGridConfig = Required<SendGridConfig>;

/**
 * Creates a resolved SendGrid configuration by applying default values to optional fields.
 *
 * This function takes a partial SendGrid configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 *
 * @param config - The SendGrid configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 *
 * @example
 * ```typescript
 * const resolved = createSendGridConfig({
 *   apiKey: 'your-api-key'
 * });
 *
 * // resolved.baseUrl will be 'https://api.sendgrid.com/v3' (default)
 * // resolved.timeout will be 30000 (default)
 * // resolved.retries will be 3 (default)
 * ```
 */
export function createSendGridConfig(
  config: SendGridConfig,
): ResolvedSendGridConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? "https://api.sendgrid.com/v3",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
    clickTracking: config.clickTracking ?? true,
    openTracking: config.openTracking ?? true,
    subscriptionTracking: config.subscriptionTracking ?? false,
    googleAnalytics: config.googleAnalytics ?? false,
  };
}
