/**
 * Authentication configuration for AWS SES.
 *
 * This is a discriminated union type that supports two authentication methods:
 *
 * - `credentials`: Basic access key and secret key authentication
 * - `session`: Temporary credentials with session token
 *
 * **Note**: IAM role assumption (`assumeRole`) is not currently supported.
 * If you need to use IAM roles, perform the AssumeRole operation externally
 * (e.g., using AWS CLI or SDK) and use the resulting temporary credentials
 * with the `session` authentication type.
 *
 * @example
 * ```typescript
 * // Basic credentials
 * const auth: SesAuthentication = {
 *   type: "credentials",
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 * };
 *
 * // Session credentials (from external AssumeRole)
 * const sessionAuth: SesAuthentication = {
 *   type: "session",
 *   accessKeyId: "ASIAXYZ...",
 *   secretAccessKey: "abc123...",
 *   sessionToken: "FwoGZXIvYXdzE...",
 * };
 * ```
 *
 * @since 0.2.0
 */
export type SesAuthentication =
  | {
    /** Authentication type identifier. */
    readonly type: "credentials";
    /** AWS access key ID. */
    readonly accessKeyId: string;
    /** AWS secret access key. */
    readonly secretAccessKey: string;
  }
  | {
    /** Authentication type identifier. */
    readonly type: "session";
    /** AWS access key ID for temporary credentials. */
    readonly accessKeyId: string;
    /** AWS secret access key for temporary credentials. */
    readonly secretAccessKey: string;
    /** AWS session token for temporary credentials. */
    readonly sessionToken: string;
  };

/**
 * Configuration options for the Amazon SES transport.
 *
 * @example
 * ```typescript
 * const config: SesConfig = {
 *   authentication: {
 *     type: "credentials",
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   },
 *   region: "us-east-1",
 *   timeout: 30000,
 *   retries: 3,
 *   batchSize: 25,
 *   defaultTags: {
 *     environment: "production",
 *     service: "notifications",
 *   },
 * };
 * ```
 *
 * @since 0.2.0
 */
export interface SesConfig {
  /** AWS authentication configuration. */
  readonly authentication: SesAuthentication;

  /**
   * AWS region.
   * @default "us-east-1"
   */
  readonly region?: string;

  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  readonly timeout?: number;

  /**
   * Number of retry attempts on failure.
   * @default 3
   */
  readonly retries?: number;

  /**
   * Whether to validate SSL certificates.
   * @default true
   */
  readonly validateSsl?: boolean;

  /** Additional HTTP headers to include in requests. */
  readonly headers?: Record<string, string>;

  /** SES configuration set name for tracking and reputation management. */
  readonly configurationSetName?: string;

  /** Default tags to apply to all sent emails. */
  readonly defaultTags?: Record<string, string>;

  /**
   *  Maximum number of messages to send concurrently in sendMany().
   * @default 50
   */
  readonly batchSize?: number;
}

/**
 * Resolved SES configuration with all optional fields filled with default values.
 *
 * This type is returned by `createSesConfig()` and used internally by `SesTransport`.
 * It ensures all required fields have values, making the transport implementation simpler.
 */
export type ResolvedSesConfig =
  & Required<
    Omit<SesConfig, "configurationSetName" | "defaultTags" | "batchSize">
  >
  & {
    /** SES configuration set name (optional) */
    readonly configurationSetName?: string;
    /** Default tags to apply to all emails (always defined, may be empty) */
    readonly defaultTags: Record<string, string>;
    /** Maximum concurrent messages in batch operations */
    readonly batchSize: number;
  };

/**
 * Creates a resolved SES configuration with default values applied.
 *
 * This function takes a partial SES configuration and fills in default values
 * for all optional fields, ensuring the transport has all necessary configuration.
 *
 * @example
 * ```typescript
 * const config = createSesConfig({
 *   authentication: {
 *     type: "credentials",
 *     accessKeyId: "AKIA...",
 *     secretAccessKey: "wJal..",
 *   },
 *   region: "eu-west-1",
 * });
 *
 * // config.timeout is now 30000 (default)
 * // config.retries is now 3 (default)
 * // config.batchSize is now 50 (default)
 * ```
 *
 * @param config The SES configuration object.
 * @returns A resolved configuration with all defaults applied.
 */
export function createSesConfig(config: SesConfig): ResolvedSesConfig {
  return {
    authentication: config.authentication,
    region: config.region ?? "us-east-1",
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
    configurationSetName: config.configurationSetName,
    defaultTags: config.defaultTags ?? {},
    batchSize: config.batchSize ?? 50,
  };
}
