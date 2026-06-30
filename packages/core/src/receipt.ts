/**
 * A machine-readable category for an email delivery failure.
 *
 * @since 0.5.0
 */
export type ReceiptErrorCategory =
  | "auth"
  | "rate-limit"
  | "network"
  | "timeout"
  | "validation"
  | "rejected"
  | "server-error"
  | "service-unavailable"
  | "configuration"
  | "unknown";

/**
 * Structured information about an email delivery failure.
 *
 * @since 0.5.0
 */
export interface ReceiptError<TProviderId extends string = string> {
  /**
   * Human-readable error message.
   */
  readonly message: string;

  /**
   * Machine-readable provider or protocol error code.
   */
  readonly code: string;

  /**
   * Coarse error category for programmatic handling.
   */
  readonly category: ReceiptErrorCategory;

  /**
   * Whether retrying the same message may succeed.
   */
  readonly retryable: boolean;

  /**
   * Provider or transport that produced this error.
   */
  readonly provider?: TProviderId;

  /**
   * HTTP status code, when the failure came from an HTTP API.
   */
  readonly statusCode?: number;

  /**
   * Provider-supplied retry delay in milliseconds, when available.
   */
  readonly retryAfterMilliseconds?: number;

  /**
   * Provider-specific error details, when available.
   */
  readonly providerDetails?: unknown;
}

/**
 * The response from the email service after sending an email message.
 *
 * This type uses a discriminated union to ensure type safety:
 *
 * - Successful sends have a `messageId` but no `errorMessages`
 * - Failed sends have `errorMessages` but no `messageId`
 *
 * Failed receipts may also include structured `errors` and summary metadata
 * for programmatic error handling.
 */
export type Receipt<TProviderId extends string = string> =
  | {
    /**
     * Indicates that the email was sent successfully.
     */
    readonly successful: true;
    /**
     * The unique identifier for the message that was sent.
     */
    readonly messageId: string;
    /**
     * Provider or transport that produced this receipt.
     */
    readonly provider?: TProviderId;
    /**
     * Number of attempts made before this receipt was produced.
     */
    readonly attempts?: number;
    /**
     * ISO 8601 timestamp for when this receipt was produced.
     */
    readonly timestamp?: string;
  }
  | {
    /**
     * Indicates that the email failed to send.
     */
    readonly successful: false;
    /**
     * An array of error messages that occurred during the sending process.
     */
    readonly errorMessages: readonly string[];
    /**
     * Structured errors for programmatic handling.
     */
    readonly errors?: readonly ReceiptError<TProviderId>[];
    /**
     * Whether retrying the same message may succeed.
     */
    readonly retryable?: boolean;
    /**
     * Provider or transport that produced this receipt.
     */
    readonly provider?: TProviderId;
    /**
     * Number of attempts made before this receipt was produced.
     */
    readonly attempts?: number;
    /**
     * ISO 8601 timestamp for when this receipt was produced.
     */
    readonly timestamp?: string;
  };

/**
 * Result of classifying a delivery failure.
 *
 * @since 0.5.0
 */
export interface ReceiptErrorClassification {
  readonly category: ReceiptErrorCategory;
  readonly retryable: boolean;
  readonly code?: string;
}

/**
 * Options for creating a structured receipt error.
 *
 * @since 0.5.0
 */
export interface CreateReceiptErrorOptions<
  TProviderId extends string = string,
> {
  readonly code?: string;
  readonly category?: ReceiptErrorCategory;
  readonly retryable?: boolean;
  readonly provider?: TProviderId;
  readonly statusCode?: number;
  readonly retryAfterMilliseconds?: number;
  readonly providerDetails?: unknown;
}

/**
 * Options for creating a failed receipt.
 *
 * @since 0.5.0
 */
export interface CreateFailedReceiptOptions<
  TProviderId extends string = string,
> extends CreateReceiptErrorOptions<TProviderId> {
  readonly errors?: readonly ReceiptError<TProviderId>[];
  readonly attempts?: number;
  readonly timestamp?: string;
}

/**
 * Classifies an HTTP status code for delivery error handling.
 *
 * @param statusCode The HTTP status code to classify.
 * @returns The receipt error category and retryability.
 * @since 0.5.0
 */
export function classifyHttpStatus(
  statusCode: number,
): ReceiptErrorClassification {
  if (statusCode === 401 || statusCode === 403) {
    return { category: "auth", retryable: false };
  }
  if (statusCode === 408 || statusCode === 504) {
    return { category: "timeout", retryable: true };
  }
  if (statusCode === 409 || statusCode === 429) {
    return { category: "rate-limit", retryable: true };
  }
  if (statusCode === 503) {
    return { category: "service-unavailable", retryable: true };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return { category: "validation", retryable: false };
  }
  if (statusCode >= 500 && statusCode < 600) {
    return { category: "server-error", retryable: true };
  }
  return { category: "unknown", retryable: false };
}

/**
 * Classifies an arbitrary delivery failure.
 *
 * @param error The error to classify.
 * @returns The receipt error category, retryability, and default code.
 * @since 0.5.0
 */
export function classifyReceiptError(
  error: unknown,
): Required<ReceiptErrorClassification> {
  const message = getStringProperty(error, "message") ?? String(error);
  const name = getStringProperty(error, "name") ?? "";
  const text = `${name} ${message}`.toLowerCase();

  if (text.includes("timeout") || text.includes("timed out")) {
    return { category: "timeout", retryable: true, code: "timeout" };
  }
  if (
    text.includes("network") || text.includes("connect") ||
    text.includes("fetch failed") ||
    text.includes("dns") || text.includes("econnreset") ||
    text.includes("econnrefused") || text.includes("enotfound") ||
    name === "NetworkError"
  ) {
    return { category: "network", retryable: true, code: "network" };
  }
  if (
    text.includes("authentication") || text.includes("authenticate") ||
    /\bauth\b/.test(text) || text.includes("unauthorized") ||
    text.includes("forbidden") || text.includes("invalid api key") ||
    text.includes("invalid token") || text.includes("401") ||
    text.includes("403")
  ) {
    return { category: "auth", retryable: false, code: "auth" };
  }
  if (
    text.includes("rate limit") || text.includes("too many requests") ||
    text.includes("quota") || text.includes("throttle") ||
    text.includes("429")
  ) {
    return {
      category: "rate-limit",
      retryable: true,
      code: "rate-limit",
    };
  }
  if (
    text.includes("invalid") || text.includes("malformed") ||
    text.includes("validation") || text.includes("bad request") ||
    text.includes("400") || text.includes("422")
  ) {
    return { category: "validation", retryable: false, code: "validation" };
  }
  if (
    text.includes("rejected") || text.includes("bounce") ||
    text.includes("complaint") || text.includes("suppressed") ||
    text.includes("unsubscribed")
  ) {
    return { category: "rejected", retryable: false, code: "rejected" };
  }
  if (
    text.includes("service unavailable") ||
    text.includes("temporarily unavailable") || text.includes("503")
  ) {
    return {
      category: "service-unavailable",
      retryable: true,
      code: "service-unavailable",
    };
  }
  if (
    text.includes("internal server error") ||
    text.includes("bad gateway") || text.includes("500") ||
    text.includes("502")
  ) {
    return {
      category: "server-error",
      retryable: true,
      code: "server-error",
    };
  }
  if (text.includes("config") || text.includes("unsupported")) {
    return {
      category: "configuration",
      retryable: false,
      code: "configuration",
    };
  }
  return { category: "unknown", retryable: false, code: "unknown" };
}

/**
 * Creates structured information about a delivery failure.
 *
 * @param message Human-readable error message.
 * @param options Optional structured error metadata.
 * @returns A structured receipt error.
 * @since 0.5.0
 */
export function createReceiptError<TProviderId extends string = string>(
  message: string,
  options: CreateReceiptErrorOptions<TProviderId> = {},
): ReceiptError<TProviderId> {
  const classification = options.statusCode == null
    ? classifyReceiptError(message)
    : classifyHttpStatus(options.statusCode);
  const category = options.category ?? classification.category;
  const retryable = options.retryable ?? classification.retryable;
  const code = options.code ?? (
    options.category != null
      ? category
      : options.statusCode == null
      ? classification.code ?? category
      : `http.${options.statusCode}`
  );

  return omitUndefined({
    message,
    category,
    code,
    retryable,
    provider: options.provider,
    statusCode: options.statusCode,
    retryAfterMilliseconds: options.retryAfterMilliseconds,
    providerDetails: options.providerDetails,
  });
}

/**
 * Creates a failed receipt with human-readable and structured errors.
 *
 * @param error Error message, structured error, or list of structured errors.
 * @param options Optional receipt and error metadata.
 * @returns A failed receipt.
 * @since 0.5.0
 */
export function createFailedReceipt<TProviderId extends string = string>(
  error:
    | string
    | readonly string[]
    | ReceiptError<TProviderId>
    | readonly ReceiptError<TProviderId>[],
  options: CreateFailedReceiptOptions<TProviderId> = {},
): Receipt<TProviderId> & { readonly successful: false } {
  const errors = options.errors ?? (
    typeof error === "string"
      ? [createReceiptError(error, options)]
      : Array.isArray(error)
      ? error.every((item) => typeof item === "string")
        ? error.map((message) => createReceiptError(message, options))
        : error
      : [error]
  );
  const errorMessages = typeof error === "string"
    ? [error]
    : Array.isArray(error) && error.every((item) => typeof item === "string")
    ? error
    : errors.map((receiptError) => receiptError.message);
  const retryable = options.retryable ??
    errors.some((receiptError) => receiptError.retryable);
  const provider = options.provider ?? errors[0]?.provider;

  return omitUndefined({
    successful: false as const,
    errorMessages,
    errors,
    retryable,
    provider,
    attempts: options.attempts,
    timestamp: options.timestamp ?? new Date().toISOString(),
  });
}

/**
 * Parses an HTTP `Retry-After` header value into milliseconds.
 *
 * @param value Header value to parse.
 * @param now Current time used when parsing HTTP dates.
 * @returns Retry delay in milliseconds, or `undefined` if invalid.
 * @since 0.5.0
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: Date = new Date(),
): number | undefined {
  if (value == null || value.trim() === "") return undefined;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const delay = Number(trimmed) * 1000;
    return delay > 0 ? delay : undefined;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return undefined;

  const delay = timestamp - now.getTime();
  return delay > 0 ? delay : undefined;
}

function getStringProperty(
  value: unknown,
  property: "message" | "name",
): string | undefined {
  if (value instanceof Error) {
    return value[property];
  }
  if (typeof value !== "object" || value == null || !(property in value)) {
    return undefined;
  }
  const propertyValue = (value as { readonly [key: string]: unknown })[
    property
  ];
  return propertyValue == null ? undefined : String(propertyValue);
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
