/**
 * Configuration interface for Resend transport connection settings.
 *
 * This interface defines all available options for configuring a Resend
 * API connection including authentication and HTTP options.
 *
 * @example
 * ```typescript
 * const config: ResendConfig = {
 *   apiKey: 'your-api-key',
 *   timeout: 30000,
 *   retries: 3
 * };
 * ```
 */
export interface ResendConfig {
  /**
   * Your Resend API key.
   *
   * You can find your API key in the Resend dashboard at https://resend.com/api-keys.
   * It should start with 're_' for API keys.
   */
  readonly apiKey: string;

  /**
   * Base URL for the Resend API.
   *
   * @default "https://api.resend.com"
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
}

/**
 * Resolved Resend configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the Resend transport implementation.
 */
export type ResolvedResendConfig = Required<ResendConfig>;

/**
 * Creates a resolved Resend configuration by applying default values to optional fields.
 *
 * This function takes a partial Resend configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 * It is used internally by the Resend transport.
 *
 * @param config - The Resend configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 * @internal
 */
export function createResendConfig(
  config: ResendConfig,
): ResolvedResendConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? "https://api.resend.com",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
  };
}
