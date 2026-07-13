import type { LogLevel } from "@logtape/logtape";
import type { Transport } from "@upyo/core";

/**
 * Log levels used for email delivery lifecycle events.
 *
 * @since 0.6.0
 */
export interface LogTapeTransportLevels {
  /**
   * Level used before an email is handed to the transport.
   *
   * @default "debug"
   */
  readonly sending?: LogLevel;

  /**
   * Level used after an email is sent successfully.
   *
   * @default "info"
   */
  readonly sent?: LogLevel;

  /**
   * Level used when a transport returns a failed receipt or throws.
   *
   * @default "error"
   */
  readonly failed?: LogLevel;
}

/**
 * Options for {@link LogTapeTransport}.
 *
 * @typeParam TProviderId The provider id of the wrapped transport.
 * @since 0.6.0
 */
export interface LogTapeTransportOptions<
  TProviderId extends string = "logtape",
> {
  /**
   * Transport that performs the actual delivery.
   *
   * When omitted, the LogTape transport only logs the delivery and returns a
   * synthetic successful receipt.
   */
  readonly transport?: Transport<TProviderId>;

  /**
   * LogTape category used for delivery logs.
   *
   * @default ["upyo"]
   */
  readonly category?: string | readonly string[];

  /**
   * Whether to include the complete email message in structured log
   * properties.
   *
   * Messages may contain sensitive or large values, including email bodies,
   * headers, and attachment data.
   *
   * @default false
   */
  readonly recordMessage?: boolean;

  /**
   * Levels used for delivery lifecycle events.
   */
  readonly levels?: LogTapeTransportLevels;
}

/**
 * Fully resolved options used by {@link LogTapeTransport}.
 *
 * @typeParam TProviderId The provider id of the wrapped transport.
 * @since 0.6.0
 */
export interface ResolvedLogTapeTransportOptions<
  TProviderId extends string = "logtape",
> {
  /** Transport that performs the actual delivery, if configured. */
  readonly transport?: Transport<TProviderId>;

  /** Resolved LogTape category. */
  readonly category: readonly string[];

  /** Whether complete messages are included in structured logs. */
  readonly recordMessage: boolean;

  /** Resolved delivery lifecycle log levels. */
  readonly levels: Required<LogTapeTransportLevels>;
}

/**
 * Resolves LogTape transport options with their defaults.
 *
 * @param options User-provided transport options.
 * @returns Fully resolved transport options.
 * @since 0.6.0
 */
export function resolveLogTapeTransportOptions<
  TProviderId extends string,
>(
  options: LogTapeTransportOptions<TProviderId>,
): ResolvedLogTapeTransportOptions<TProviderId> {
  const category = options.category ?? ["upyo"];
  return {
    transport: options.transport,
    category: typeof category === "string" ? [category] : [...category],
    recordMessage: options.recordMessage ?? false,
    levels: {
      sending: options.levels?.sending ?? "debug",
      sent: options.levels?.sent ?? "info",
      failed: options.levels?.failed ?? "error",
    },
  };
}
