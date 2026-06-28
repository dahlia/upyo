import type { DkimConfig } from "./dkim/index.ts";

/**
 * Configuration interface for SMTP transport connection settings.
 *
 * This interface defines all available options for configuring an SMTP
 * connection including server details, authentication, security, and
 * connection pooling settings.
 *
 * @example
 * ```typescript
 * const config: SmtpConfig = {
 *   host: 'smtp.gmail.com',
 *   port: 465,
 *   secure: true, // Use TLS from start
 *   auth: {
 *     user: 'user@gmail.com',
 *     pass: 'app-password'
 *   },
 *   connectionTimeout: 30000,
 *   poolSize: 10
 * };
 * ```
 */
export interface SmtpConfig {
  /**
   * The SMTP server hostname or IP address.
   */
  readonly host: string;

  /**
   * The SMTP server port number.
   * @default 587
   */
  readonly port?: number;

  /**
   * Whether to use secure connection (TLS/SSL).
   * @default true
   */
  readonly secure?: boolean;

  /**
   * Authentication configuration for the SMTP server.
   */
  readonly auth?: SmtpAuth;

  /**
   * TLS configuration options.
   */
  readonly tls?: SmtpTlsOptions;

  /**
   * Connection timeout in milliseconds.
   * @default 60000
   */
  readonly connectionTimeout?: number;

  /**
   * Socket timeout in milliseconds.
   * @default 60000
   */
  readonly socketTimeout?: number;

  /**
   * The name to use for the local hostname in the HELO/EHLO command.
   */
  readonly localName?: string;

  /**
   * Pool connections to reuse them.
   * @default true
   */
  readonly pool?: boolean;

  /**
   * Maximum number of connections in the pool.
   * @default 5
   */
  readonly poolSize?: number;

  /**
   * DKIM signing configuration.
   * When provided, all outgoing emails will be signed with DKIM.
   * @since 0.4.0
   */
  readonly dkim?: DkimConfig;
}

/**
 * Authentication configuration for SMTP connections.
 *
 * This is a discriminated union of the supported authentication strategies:
 *
 *  -  {@link SmtpUserPassAuth}: traditional username/password authentication
 *     (SASL `PLAIN`, `LOGIN`, …), discriminated by the `pass` field.
 *  -  {@link SmtpOAuth2TokenAuth}: OAuth 2.0 authentication using a static or
 *     dynamically provided access token, discriminated by the `accessToken`
 *     field.
 *  -  {@link SmtpOAuth2RefreshAuth}: OAuth 2.0 authentication using the built-in
 *     `refresh_token` grant flow, discriminated by the `refreshToken` field.
 *
 * @example
 * ```typescript
 * // Username/password
 * const passwordAuth: SmtpAuth = {
 *   user: 'username@domain.com',
 *   pass: 'password',
 *   method: 'plain' // or 'login', 'cram-md5'
 * };
 *
 * // OAuth 2.0 with a (possibly refreshing) access token
 * const tokenAuth: SmtpAuth = {
 *   user: 'username@gmail.com',
 *   accessToken: 'ya29.a0Af…',
 *   method: 'xoauth2' // or 'oauthbearer'
 * };
 * ```
 */
export type SmtpAuth =
  | SmtpUserPassAuth
  | SmtpOAuth2TokenAuth
  | SmtpOAuth2RefreshAuth;

/**
 * OAuth 2.0 access token aggregate that supplies access tokens on demand.
 *
 * The transport invokes the provider each time it needs to authenticate a new
 * connection, which lets the caller plug in an external OAuth client (e.g.,
 * `google-auth-library` or `msal-node`) and refresh expired tokens
 * transparently.
 *
 * @param signal An optional {@link AbortSignal} to cancel token acquisition.
 * @returns The OAuth 2.0 access token (bearer token), or a promise of it.
 * @since 0.5.0
 */
export type OAuth2TokenProvider = (
  signal?: AbortSignal,
) => string | Promise<string>;

/**
 * Username/password authentication configuration for SMTP connections.
 *
 * Defines the credentials and SASL method to use when connecting to an SMTP
 * server that requires password-based authentication.
 *
 * @example
 * ```typescript
 * const auth: SmtpUserPassAuth = {
 *   user: 'username@domain.com',
 *   pass: 'password',
 *   method: 'plain' // or 'login', 'cram-md5'
 * };
 * ```
 */
export interface SmtpUserPassAuth {
  /**
   * Username for authentication.
   */
  readonly user: string;

  /**
   * Password for authentication.
   */
  readonly pass: string;

  /**
   * Authentication method.
   * @default "plain"
   */
  readonly method?: "plain" | "login" | "cram-md5";
}

/**
 * OAuth 2.0 authentication configuration using a directly supplied access
 * token.
 *
 * The `accessToken` may be a static string or an {@link OAuth2TokenProvider}
 * callback that returns a fresh token on demand.  Use the callback form to
 * integrate an external OAuth client (such as `google-auth-library` or
 * `msal-node`) so that expired tokens are refreshed automatically.
 *
 * @example
 * ```typescript
 * const auth: SmtpOAuth2TokenAuth = {
 *   user: 'username@gmail.com',
 *   accessToken: async () => await getFreshAccessToken(),
 *   method: 'xoauth2',
 * };
 * ```
 * @since 0.5.0
 */
export interface SmtpOAuth2TokenAuth {
  /**
   * The user (email address) to authenticate as.
   */
  readonly user: string;

  /**
   * The OAuth 2.0 access token, or a provider callback returning one.
   *
   * When a callback is given, it is invoked every time a new connection is
   * authenticated, allowing the caller to refresh expired tokens.
   */
  readonly accessToken: string | OAuth2TokenProvider;

  /**
   * The SASL mechanism to use.  When omitted, the mechanism is chosen
   * automatically based on the server's advertised capabilities, preferring
   * `xoauth2`.
   * @default "xoauth2"
   */
  readonly method?: "xoauth2" | "oauthbearer";
}

/**
 * OAuth 2.0 authentication configuration using the built-in `refresh_token`
 * grant flow.
 *
 * The transport exchanges the refresh token for an access token at the given
 * token endpoint and caches it until shortly before it expires, refreshing it
 * automatically as needed.  No external OAuth library is required.
 *
 * @example
 * ```typescript
 * const auth: SmtpOAuth2RefreshAuth = {
 *   user: 'username@gmail.com',
 *   clientId: '…apps.googleusercontent.com',
 *   clientSecret: '…',
 *   refreshToken: '1//…',
 *   tokenEndpoint: 'https://oauth2.googleapis.com/token',
 * };
 * ```
 * @since 0.5.0
 */
export interface SmtpOAuth2RefreshAuth {
  /**
   * The user (email address) to authenticate as.
   */
  readonly user: string;

  /**
   * The OAuth 2.0 client identifier.
   */
  readonly clientId: string;

  /**
   * The OAuth 2.0 client secret.  May be omitted for public clients (e.g.,
   * clients using PKCE) that have no secret.
   */
  readonly clientSecret?: string;

  /**
   * The OAuth 2.0 refresh token used to obtain access tokens.
   */
  readonly refreshToken: string;

  /**
   * The token endpoint URL where the refresh token is exchanged for an access
   * token (e.g., `https://oauth2.googleapis.com/token`).
   */
  readonly tokenEndpoint: string;

  /**
   * An optional space-delimited list of OAuth 2.0 scopes to request.
   */
  readonly scope?: string;

  /**
   * The SASL mechanism to use.  When omitted, the mechanism is chosen
   * automatically based on the server's advertised capabilities, preferring
   * `xoauth2`.
   * @default "xoauth2"
   */
  readonly method?: "xoauth2" | "oauthbearer";
}

/**
 * OAuth 2.0 authentication configuration for SMTP connections.
 *
 * A union of the OAuth 2.0 authentication strategies: a directly supplied
 * (or callback-provided) access token ({@link SmtpOAuth2TokenAuth}) or the
 * built-in `refresh_token` grant flow ({@link SmtpOAuth2RefreshAuth}).
 *
 * @since 0.5.0
 */
export type SmtpOAuth2Auth = SmtpOAuth2TokenAuth | SmtpOAuth2RefreshAuth;

/**
 * TLS/SSL configuration options for secure SMTP connections.
 *
 * These options control the behavior of TLS encryption when connecting
 * to SMTP servers, including certificate validation and client authentication.
 *
 * @example
 * ```typescript
 * const tlsOptions: SmtpTlsOptions = {
 *   rejectUnauthorized: true,
 *   minVersion: 'TLSv1.2',
 *   ca: [fs.readFileSync('ca-cert.pem', 'utf8')]
 * };
 * ```
 */
export interface SmtpTlsOptions {
  /**
   * Whether to reject unauthorized certificates.
   * @default true
   */
  readonly rejectUnauthorized?: boolean;

  /**
   * List of trusted certificates.
   */
  readonly ca?: string[];

  /**
   * Private key for client certificate authentication.
   */
  readonly key?: string;

  /**
   * Certificate for client certificate authentication.
   */
  readonly cert?: string;

  /**
   * Minimum TLS version to accept.
   * @default "TLSv1.2"
   */
  readonly minVersion?: "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";

  /**
   * Maximum TLS version to accept.
   * @default "TLSv1.3"
   */
  readonly maxVersion?: "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3";
}

/**
 * Resolved SMTP configuration with all optional fields filled with default values.
 *
 * This type represents the final configuration after applying defaults,
 * used internally by the SMTP transport implementation.
 */
export type ResolvedSmtpConfig =
  & Omit<
    Required<SmtpConfig>,
    "auth" | "tls" | "dkim"
  >
  & {
    readonly auth?: SmtpAuth;
    readonly tls?: SmtpTlsOptions;
    readonly dkim?: DkimConfig;
  };

/**
 * Creates a resolved SMTP configuration by applying default values to optional fields.
 *
 * This function takes a partial SMTP configuration and returns a complete
 * configuration with all optional fields filled with sensible defaults.
 * It is used internally by the SMTP transport.
 *
 * @param config - The SMTP configuration with optional fields
 * @returns A resolved configuration with all defaults applied
 * @internal
 */
export function createSmtpConfig(config: SmtpConfig): ResolvedSmtpConfig {
  return {
    host: config.host,
    port: config.port ?? 587,
    secure: config.secure ?? true,
    auth: config.auth,
    tls: config.tls,
    connectionTimeout: config.connectionTimeout ?? 60000,
    socketTimeout: config.socketTimeout ?? 60000,
    localName: config.localName ?? "localhost",
    pool: config.pool ?? true,
    poolSize: config.poolSize ?? 5,
    dkim: config.dkim,
  };
}
