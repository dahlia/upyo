/**
 * Configuration interface for Plunk transport connection settings.
 *
 * This interface defines all available options for configuring a Plunk
 * API connection including authentication, HTTP options, and base URL for
 * self-hosted instances.
 *
 * @example
 * ```typescript
 * const config: PlunkConfig = {
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.useplunk.com', // or self-hosted URL
 *   timeout: 30000,
 *   retries: 3
 * };
 * ```
 */
export interface PlunkConfig {
  /**
   * Your Plunk API key.
   *
   * You can find your API key in your Plunk dashboard under Settings > API Keys.
   * The key will be used as a Bearer token for authentication.
   */
  readonly apiKey: string;

  /**
   * Base URL for the Plunk API.
   *
   * For Plunk's hosted service, use "https://api.useplunk.com" (default).
   * For self-hosted instances, use your domain with "/api" path
   * (e.g., "https://plunk.example.com/api").
   *
   * @default "https://api.useplunk.com"
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
 * Resolved Plunk configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the Plunk transport implementation.
 */
export type ResolvedPlunkConfig = Required<PlunkConfig>;

/**
 * Creates a resolved Plunk configuration by applying default values to optional fields.
 *
 * This function takes a partial Plunk configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 * It is used internally by the Plunk transport.
 *
 * @param config - The Plunk configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 * @internal
 */
export function createPlunkConfig(
  config: PlunkConfig,
): ResolvedPlunkConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? "https://api.useplunk.com",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
  };
}
