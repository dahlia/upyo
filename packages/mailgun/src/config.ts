/**
 * Configuration interface for Mailgun transport connection settings.
 *
 * This interface defines all available options for configuring a Mailgun
 * API connection including authentication, server region, and HTTP options.
 *
 * @example
 * ```typescript
 * const config: MailgunConfig = {
 *   apiKey: 'your-api-key',
 *   domain: 'your-domain.com',
 *   region: 'us', // or 'eu'
 *   timeout: 30000,
 *   retries: 3
 * };
 * ```
 */
export interface MailgunConfig {
  /**
   * Your Mailgun API key.
   *
   * You can find your API key in the Mailgun Control Panel.
   * It should start with 'key-' for private API keys.
   */
  readonly apiKey: string;

  /**
   * Your Mailgun domain.
   *
   * This is the domain you verified with Mailgun to send emails from.
   */
  readonly domain: string;

  /**
   * Mailgun region where your domain is hosted.
   *
   * @default "us"
   */
  readonly region?: "us" | "eu";

  /**
   * Base URL for the Mailgun API.
   *
   * If not provided, will be automatically determined based on the region.
   * - US region: https://api.mailgun.net/v3
   * - EU region: https://api.eu.mailgun.net/v3
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
   * Whether to enable tracking for sent messages.
   *
   * @default true
   */
  readonly tracking?: boolean;

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
}

/**
 * Resolved Mailgun configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the Mailgun transport implementation.
 */
export type ResolvedMailgunConfig = Required<MailgunConfig>;

/**
 * Creates a resolved Mailgun configuration by applying default values to optional fields.
 *
 * This function takes a partial Mailgun configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 * It is used internally by the Mailgun transport.
 *
 * @param config - The Mailgun configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 * @internal
 */
export function createMailgunConfig(
  config: MailgunConfig,
): ResolvedMailgunConfig {
  const region = config.region ?? "us";
  const baseUrl = config.baseUrl ?? getDefaultBaseUrl(region);

  return {
    apiKey: config.apiKey,
    domain: config.domain,
    region,
    baseUrl,
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
    tracking: config.tracking ?? true,
    clickTracking: config.clickTracking ?? true,
    openTracking: config.openTracking ?? true,
  };
}

/**
 * Gets the default base URL for a given Mailgun region.
 *
 * @param region - The Mailgun region
 * @returns The default base URL for the region
 */
function getDefaultBaseUrl(region: "us" | "eu"): string {
  switch (region) {
    case "us":
      return "https://api.mailgun.net/v3";
    case "eu":
      return "https://api.eu.mailgun.net/v3";
    default:
      throw new Error(`Unsupported region: ${region}`);
  }
}
