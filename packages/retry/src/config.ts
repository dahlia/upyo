import type { Receipt } from "@upyo/core";

/**
 * Jitter mode for computed retry delays.
 *
 * @since 0.5.0
 */
export type JitterConfig = false | "none" | "full";

/**
 * Exponential backoff settings for retry delays.
 *
 * @since 0.5.0
 */
export interface BackoffConfig {
  /**
   * Delay before the first retry, in milliseconds.
   *
   * @default 1000
   */
  readonly baseDelayMilliseconds?: number;

  /**
   * Maximum computed delay, in milliseconds.
   *
   * @default 30000
   */
  readonly maxDelayMilliseconds?: number;

  /**
   * Multiplier applied after each failed attempt.
   *
   * @default 2
   */
  readonly factor?: number;
}

/**
 * Context passed to custom retry wait functions.
 *
 * @since 0.5.0
 */
export interface DelayContext<TProviderId extends string = string> {
  /**
   * Attempt that just failed.
   */
  readonly attempt: number;

  /**
   * Attempt that will run after this delay.
   */
  readonly nextAttempt: number;

  /**
   * Maximum configured attempts.
   */
  readonly maxAttempts: number;

  /**
   * Delay to wait before retrying, in milliseconds.
   */
  readonly delayMilliseconds: number;

  /**
   * Failed receipt that caused the retry, when the transport returned one.
   */
  readonly receipt?: Receipt<TProviderId> & { readonly successful: false };

  /**
   * Thrown error that caused the retry, when the transport rejected.
   */
  readonly error?: unknown;

  /**
   * Why the delay is being applied.
   */
  readonly reason: "retry" | "sendMany-throttle";
}

/**
 * Function used to wait between attempts or throttled sends.
 *
 * @param context Information about the delay being applied.
 * @param signal Abort signal that should cancel the wait.
 * @returns A promise that resolves when the delay is complete.
 * @throws {DOMException} If the wait is aborted.
 * @since 0.5.0
 */
export type WaitFunction<TProviderId extends string = string> = (
  context: DelayContext<TProviderId>,
  signal?: AbortSignal,
) => Promise<void>;

/**
 * Function that decides whether a failure should be retried.
 *
 * @param failure Failed receipt or thrown error.
 * @returns Whether another attempt should be made.
 * @since 0.5.0
 */
export type RetryClassifier<TProviderId extends string = string> = (
  failure:
    | (Receipt<TProviderId> & { readonly successful: false })
    | unknown,
) => boolean;

/**
 * Retry behavior for `sendMany()`.
 *
 * @since 0.5.0
 */
export interface SendManyRetryConfig {
  /**
   * Maximum number of messages to send at the same time.
   *
   * @default 1
   */
  readonly maxConcurrent?: number;

  /**
   * Minimum delay between launching message sends, in milliseconds.
   *
   * @default 0
   */
  readonly intervalMilliseconds?: number;
}

/**
 * Configuration for the retry transport decorator.
 *
 * @since 0.5.0
 */
export interface RetryConfig<TProviderId extends string = string> {
  /**
   * Total number of send attempts, including the first one.
   *
   * @default 3
   */
  readonly maxAttempts?: number;

  /**
   * Exponential backoff settings.
   */
  readonly backoff?: BackoffConfig;

  /**
   * Jitter mode applied to computed backoff delays.
   *
   * `Retry-After` delays are not jittered.
   *
   * @default "full"
   */
  readonly jitter?: JitterConfig;

  /**
   * Random number source for jitter.
   *
   * @default Math.random
   */
  readonly random?: () => number;

  /**
   * Custom retry classifier.
   */
  readonly shouldRetry?: RetryClassifier<TProviderId>;

  /**
   * Custom wait function for tests or host-controlled scheduling.
   */
  readonly wait?: WaitFunction<TProviderId>;

  /**
   * Retry and throttling behavior for `sendMany()`.
   */
  readonly sendMany?: SendManyRetryConfig;
}

/**
 * Resolved retry configuration with defaults applied.
 *
 * @since 0.5.0
 */
export interface ResolvedRetryConfig<TProviderId extends string = string> {
  readonly maxAttempts: number;
  readonly backoff: Required<BackoffConfig>;
  readonly jitter: JitterConfig;
  readonly random: () => number;
  readonly shouldRetry?: RetryClassifier<TProviderId>;
  readonly wait: WaitFunction<TProviderId>;
  readonly sendMany: Required<SendManyRetryConfig>;
}

/**
 * Creates a resolved retry configuration.
 *
 * @param config Retry configuration.
 * @returns The resolved configuration.
 * @throws {RangeError} If a numeric option is out of range.
 * @since 0.5.0
 */
export function createRetryConfig<TProviderId extends string = string>(
  config: RetryConfig<TProviderId> = {},
): ResolvedRetryConfig<TProviderId> {
  const maxAttempts = config.maxAttempts ?? 3;
  const baseDelayMilliseconds = config.backoff?.baseDelayMilliseconds ?? 1000;
  const maxDelayMilliseconds = config.backoff?.maxDelayMilliseconds ?? 30000;
  const factor = config.backoff?.factor ?? 2;
  const maxConcurrent = config.sendMany?.maxConcurrent ?? 1;
  const intervalMilliseconds = config.sendMany?.intervalMilliseconds ?? 0;

  assertIntegerAtLeast(maxAttempts, 1, "maxAttempts");
  assertFiniteAtLeast(
    baseDelayMilliseconds,
    0,
    "backoff.baseDelayMilliseconds",
  );
  assertFiniteAtLeast(
    maxDelayMilliseconds,
    0,
    "backoff.maxDelayMilliseconds",
  );
  assertFiniteAtLeast(factor, 1, "backoff.factor");
  assertIntegerAtLeast(maxConcurrent, 1, "sendMany.maxConcurrent");
  assertFiniteAtLeast(
    intervalMilliseconds,
    0,
    "sendMany.intervalMilliseconds",
  );

  return {
    maxAttempts,
    backoff: {
      baseDelayMilliseconds,
      maxDelayMilliseconds,
      factor,
    },
    jitter: config.jitter ?? "full",
    random: config.random ?? Math.random,
    shouldRetry: config.shouldRetry,
    wait: config.wait ?? defaultWait,
    sendMany: {
      maxConcurrent,
      intervalMilliseconds,
    },
  };
}

async function defaultWait(
  context: DelayContext,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  if (context.delayMilliseconds <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, context.delayMilliseconds);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(createAbortError());
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function assertIntegerAtLeast(
  value: number,
  minimum: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(
      `${name} must be an integer greater than or equal to ${minimum}.`,
    );
  }
}

function assertFiniteAtLeast(
  value: number,
  minimum: number,
  name: string,
): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(
      `${name} must be greater than or equal to ${minimum}.`,
    );
  }
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}
