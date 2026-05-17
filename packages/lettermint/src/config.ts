/**
 * Per-email Lettermint tracking settings.
 *
 * These settings are sent as provider-specific defaults for every message
 * delivered through a {@link LettermintTransport}.
 *
 * @since 0.5.0
 */
export interface LettermintSettings {
  /**
   * Whether Lettermint should track email opens.
   */
  readonly trackOpens?: boolean;

  /**
   * Whether Lettermint should track link clicks.
   */
  readonly trackClicks?: boolean;
}

/**
 * Configuration interface for Lettermint transport connection settings.
 *
 * @example
 * ```typescript
 * const config: LettermintConfig = {
 *   apiToken: "your-project-api-token",
 *   route: "transactional",
 *   tag: "welcome",
 *   timeout: 30000,
 *   retries: 3,
 * };
 * ```
 *
 * @since 0.5.0
 */
export interface LettermintConfig {
  /**
   * Your project-specific Lettermint sending API token.
   *
   * The token is sent as the `x-lettermint-token` HTTP header.
   */
  readonly apiToken: string;

  /**
   * Base URL for the Lettermint API.
   *
   * @default "https://api.lettermint.co"
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
   * Lettermint route to apply to sent messages.
   */
  readonly route?: string;

  /**
   * Default Lettermint tag to apply when the Upyo message has no tag.
   */
  readonly tag?: string | null;

  /**
   * Metadata to track with sent messages.  This metadata is not added as
   * email headers.
   */
  readonly metadata?: Record<string, string>;

  /**
   * Lettermint tracking settings to apply to sent messages.
   */
  readonly settings?: LettermintSettings;
}

/**
 * Resolved Lettermint configuration with defaults applied.
 *
 * @since 0.5.0
 */
export type ResolvedLettermintConfig =
  & Required<
    Omit<LettermintConfig, "route" | "tag" | "metadata" | "settings">
  >
  & {
    readonly route?: string;
    readonly tag?: string | null;
    readonly metadata?: Record<string, string>;
    readonly settings?: LettermintSettings;
  };

/**
 * Creates a resolved Lettermint configuration by applying default values.
 *
 * @param config The Lettermint configuration with optional fields.
 * @returns A resolved configuration with all defaults applied.
 * @since 0.5.0
 */
export function createLettermintConfig(
  config: LettermintConfig,
): ResolvedLettermintConfig {
  return {
    apiToken: config.apiToken,
    baseUrl: config.baseUrl ?? "https://api.lettermint.co",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
    route: config.route,
    tag: config.tag,
    metadata: config.metadata == null ? undefined : { ...config.metadata },
    settings: config.settings == null ? undefined : { ...config.settings },
  };
}
