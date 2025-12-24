/**
 * Configuration interface for JMAP transport connection settings.
 * @since 0.4.0
 */
export interface JmapConfig {
  /**
   * The JMAP session URL (e.g., `https://server/.well-known/jmap`).
   * This is used for session discovery per RFC 8620 Section 2.
   */
  readonly sessionUrl: string;

  /**
   * Bearer token for authentication.
   * Used in Authorization header as `Bearer {token}`.
   * Either `bearerToken` or `basicAuth` must be provided.
   */
  readonly bearerToken?: string;

  /**
   * Basic authentication credentials.
   * Used in Authorization header as `Basic {base64(username:password)}`.
   * Either `bearerToken` or `basicAuth` must be provided.
   * @since 0.4.0
   */
  readonly basicAuth?: {
    readonly username: string;
    readonly password: string;
  };

  /**
   * The JMAP account ID to use.
   * If not provided, will be auto-detected from the session response
   * (first account with mail capability).
   */
  readonly accountId?: string;

  /**
   * The identity ID to use for email submission.
   * If not provided, will be auto-resolved based on sender email address.
   */
  readonly identityId?: string;

  /**
   * HTTP request timeout in milliseconds.
   * @default 30000
   */
  readonly timeout?: number;

  /**
   * Number of retry attempts for failed requests.
   * @default 3
   */
  readonly retries?: number;

  /**
   * Custom HTTP headers to include with requests.
   */
  readonly headers?: Record<string, string>;

  /**
   * Session cache TTL in milliseconds.
   * Sessions are refreshed when capabilities errors occur or after this duration.
   * @default 300000 (5 minutes)
   */
  readonly sessionCacheTtl?: number;

  /**
   * Base URL to use for rewriting session URLs.
   * Some JMAP servers return internal hostnames in session responses.
   * When set, URLs from the session (apiUrl, uploadUrl, etc.) will be rewritten
   * to use this base URL instead.
   * Example: If the session returns `http://internal-host:8080/jmap/` and
   * baseUrl is `http://localhost:8080`, URLs will be rewritten to use localhost.
   * @since 0.4.0
   */
  readonly baseUrl?: string;
}

/**
 * Resolved JMAP configuration with all fields populated.
 * @since 0.4.0
 */
export type ResolvedJmapConfig = {
  readonly sessionUrl: string;
  readonly bearerToken: string | null;
  readonly basicAuth:
    | { readonly username: string; readonly password: string }
    | null;
  readonly accountId: string | null;
  readonly identityId: string | null;
  readonly timeout: number;
  readonly retries: number;
  readonly headers: Record<string, string>;
  readonly sessionCacheTtl: number;
  readonly baseUrl: string | null;
};

/**
 * Creates a resolved JMAP configuration with default values applied.
 * @param config The user-provided configuration.
 * @returns The resolved configuration with all fields populated.
 * @throws Error if neither bearerToken nor basicAuth is provided.
 * @since 0.4.0
 */
export function createJmapConfig(config: JmapConfig): ResolvedJmapConfig {
  if (!config.bearerToken && !config.basicAuth) {
    throw new Error("Either bearerToken or basicAuth must be provided");
  }
  return {
    sessionUrl: config.sessionUrl,
    bearerToken: config.bearerToken ?? null,
    basicAuth: config.basicAuth ?? null,
    accountId: config.accountId ?? null,
    identityId: config.identityId ?? null,
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    headers: config.headers ?? {},
    sessionCacheTtl: config.sessionCacheTtl ?? 300000,
    baseUrl: config.baseUrl ?? null,
  };
}
