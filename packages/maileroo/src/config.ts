/**
 * Configuration interface for Maileroo transport connection settings.
 *
 * @example
 * ```typescript
 * const config: MailerooConfig = {
 *   apiKey: "your-sending-key",
 *   timeout: 30000,
 *   retries: 3,
 * };
 * ```
 *
 * @since 0.6.0
 */
export interface MailerooConfig {
  /**
   * Your Maileroo sending key.
   *
   * The key is sent as an `X-API-Key` HTTP header.
   */
  readonly apiKey: string;

  /**
   * Base URL for the Maileroo Email API.
   *
   * @default "https://smtp.maileroo.com/api/v2"
   */
  readonly baseUrl?: string;

  /**
   * HTTP request timeout in milliseconds.
   *
   * Set to `0` to disable request timeouts.
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
   * Additional HTTP headers to include with requests.
   */
  readonly headers?: Record<string, string>;

  /**
   * Whether Maileroo should track opens and clicks for sent messages.
   *
   * When omitted, Maileroo applies the account default.
   */
  readonly tracking?: boolean;

  /**
   * Default Maileroo tags to apply to sent messages.
   */
  readonly tags?: Record<string, string>;
}

/**
 * Resolved Maileroo configuration with defaults applied.
 *
 * @since 0.6.0
 */
export type ResolvedMailerooConfig =
  & Required<Omit<MailerooConfig, "tracking" | "tags">>
  & {
    readonly tracking?: boolean;
    readonly tags?: Record<string, string>;
  };

/**
 * Creates a resolved Maileroo configuration by applying default values.
 *
 * @param config The Maileroo configuration with optional fields.
 * @returns A resolved configuration with all defaults applied.
 * @since 0.6.0
 */
export function createMailerooConfig(
  config: MailerooConfig,
): ResolvedMailerooConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: normalizeBaseUrl(
      config.baseUrl ?? "https://smtp.maileroo.com/api/v2",
    ),
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    headers: config.headers == null ? {} : { ...config.headers },
    tracking: config.tracking,
    tags: config.tags == null ? undefined : { ...config.tags },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
