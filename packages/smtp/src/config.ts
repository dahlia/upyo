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
 * Defines the credentials and authentication method to use when
 * connecting to an SMTP server that requires authentication.
 *
 * @example
 * ```typescript
 * const auth: SmtpAuth = {
 *   user: 'username@domain.com',
 *   pass: 'password',
 *   method: 'plain' // or 'login', 'cram-md5'
 * };
 * ```
 */
export interface SmtpAuth {
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
