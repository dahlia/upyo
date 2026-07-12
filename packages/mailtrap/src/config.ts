const DEFAULT_SEND_BASE_URL = "https://send.api.mailtrap.io";
const DEFAULT_SANDBOX_BASE_URL = "https://sandbox.api.mailtrap.io";
const DEFAULT_CATEGORY = "transactional";
const DEFAULT_USER_AGENT = "@upyo/mailtrap";

/**
 * Configuration interface for Mailtrap transport connection settings.
 *
 * @example
 * ```typescript
 * const config: MailtrapConfig = {
 *   apiToken: "your-api-token",
 *   sandbox: true,
 *   inboxId: 12345,
 *   timeout: 30000,
 *   retries: 3,
 * };
 * ```
 *
 * @since 0.5.0
 */
export interface MailtrapConfig {
  /**
   * Your Mailtrap API token.
   *
   * The token is sent as the `Api-Token` HTTP header.
   */
  readonly apiToken: string;

  /**
   * Whether to send through Mailtrap Email Sandbox instead of Email API.
   *
   * @default false
   */
  readonly sandbox?: boolean;

  /**
   * Sandbox inbox ID (from `mailtrap.io/sandboxes/{id}`).
   *
   * Required when `sandbox` is `true`.
   */
  readonly inboxId?: string | number;

  /**
   * Base URL for Mailtrap Email API (production sending).
   *
   * @default "https://send.api.mailtrap.io"
   */
  readonly sendBaseUrl?: string;

  /**
   * Base URL for Mailtrap Email Sandbox.
   *
   * @default "https://sandbox.api.mailtrap.io"
   */
  readonly sandboxBaseUrl?: string;

  /**
   * Default Mailtrap category when the Upyo message has no tags.
   *
   * @default "transactional"
   */
  readonly defaultCategory?: string;

  /**
   * Metadata to track with sent messages.  This metadata is not added as
   * email headers.
   */
  readonly metadata?: Record<string, string>;

  /**
   * User-Agent header sent with every request.
   *
   * Mailtrap edge protection may block requests without a User-Agent.
   *
   * @default "@upyo/mailtrap"
   */
  readonly userAgent?: string;

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
 * Resolved Mailtrap configuration with defaults applied.
 *
 * @since 0.5.0
 */
export type ResolvedMailtrapConfig =
  & Required<
    Omit<
      MailtrapConfig,
      | "inboxId"
      | "sandbox"
      | "metadata"
      | "defaultCategory"
      | "userAgent"
      | "sendBaseUrl"
      | "sandboxBaseUrl"
    >
  >
  & {
    readonly inboxId?: string | number;
    readonly sandbox: boolean;
    readonly metadata?: Record<string, string>;
    readonly defaultCategory: string;
    readonly userAgent: string;
    readonly sendBaseUrl: string;
    readonly sandboxBaseUrl: string;
  };

/**
 * Creates a resolved Mailtrap configuration by applying default values.
 *
 * @param config The Mailtrap configuration with optional fields.
 * @returns A resolved configuration with all defaults applied.
 * @throws {RangeError} If `sandbox` is `true` and `inboxId` is missing.
 * @since 0.5.0
 */
export function createMailtrapConfig(
  config: MailtrapConfig,
): ResolvedMailtrapConfig {
  const sandbox = config.sandbox ?? false;

  if (sandbox && !isValidInboxId(config.inboxId)) {
    throw new RangeError(
      "`inboxId` is required when Mailtrap sandbox mode is enabled.",
    );
  }

  return {
    apiToken: config.apiToken,
    sandbox,
    inboxId: config.inboxId,
    sendBaseUrl: normalizeBaseUrl(config.sendBaseUrl ?? DEFAULT_SEND_BASE_URL),
    sandboxBaseUrl: normalizeBaseUrl(
      config.sandboxBaseUrl ?? DEFAULT_SANDBOX_BASE_URL,
    ),
    defaultCategory: config.defaultCategory ?? DEFAULT_CATEGORY,
    metadata: config.metadata == null ? undefined : { ...config.metadata },
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    validateSsl: config.validateSsl ?? true,
    headers: config.headers ?? {},
  };
}

function isValidInboxId(inboxId: string | number | undefined): boolean {
  if (inboxId === undefined || inboxId === null) return false;
  if (typeof inboxId === "number") return true;
  return inboxId.trim().length > 0;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
