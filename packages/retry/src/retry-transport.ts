import {
  classifyReceiptError,
  combineSignals,
  createFailedReceipt,
  createReceiptError,
  type Message,
  type Receipt,
  type ReceiptError,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import {
  createRetryConfig,
  type DelayContext,
  type ResolvedRetryConfig,
  type RetryConfig,
} from "./config.ts";

/**
 * Transport decorator that retries transient delivery failures.
 *
 * @since 0.5.0
 */
export class RetryTransport<TProviderId extends string = string>
  implements Transport<TProviderId>, AsyncDisposable {
  readonly id: TProviderId;

  /**
   * Resolved retry configuration.
   */
  readonly config: ResolvedRetryConfig<TProviderId>;

  private readonly wrappedTransport: Transport<TProviderId>;

  /**
   * Creates a retrying transport around another transport.
   *
   * @param transport The transport to wrap.
   * @param config Retry configuration.
   * @throws {RangeError} If retry configuration is invalid.
   */
  constructor(
    transport: Transport<TProviderId>,
    config: RetryConfig<TProviderId> = {},
  ) {
    this.wrappedTransport = transport;
    this.id = transport.id;
    this.config = createRetryConfig(config);
  }

  /**
   * Sends one message, retrying retryable failures.
   *
   * @param message The message to send.
   * @param options Optional transport options.
   * @returns The final delivery receipt.
   * @throws {DOMException} If the operation is aborted.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<TProviderId>> {
    options?.signal?.throwIfAborted();

    let lastThrownError: unknown;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      options?.signal?.throwIfAborted();

      try {
        const receipt = await this.wrappedTransport.send(message, options);
        if (receipt.successful) {
          return this.withSuccessMetadata(receipt, attempt);
        }

        const failedReceipt = this.withFailureMetadata(receipt, attempt);
        if (
          attempt >= this.config.maxAttempts ||
          !this.shouldRetryReceipt(failedReceipt)
        ) {
          return failedReceipt;
        }

        await this.waitBeforeRetry({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: this.config.maxAttempts,
          delayMilliseconds: this.calculateDelay(attempt, failedReceipt),
          receipt: failedReceipt,
          reason: "retry",
        }, options?.signal);
      } catch (error) {
        options?.signal?.throwIfAborted();

        lastThrownError = error;
        if (
          attempt >= this.config.maxAttempts ||
          !this.shouldRetryError(error)
        ) {
          return this.createThrownFailure(error, attempt);
        }

        await this.waitBeforeRetry({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: this.config.maxAttempts,
          delayMilliseconds: this.calculateDelay(
            attempt,
            toReceiptError<TProviderId>(error),
          ),
          error,
          reason: "retry",
        }, options?.signal);
      }
    }

    return this.createThrownFailure(lastThrownError, this.config.maxAttempts);
  }

  /**
   * Sends messages with per-message retry behavior.
   *
   * Receipts are yielded in the same order as input messages.
   *
   * @param messages Messages to send.
   * @param options Optional transport options.
   * @returns An async iterable of receipts.
   * @throws {DOMException} If the operation is aborted.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<TProviderId>> {
    const iterator = toAsyncIterator(messages);
    const inFlight = new Map<number, Promise<SendManyResult<TProviderId>>>();
    const completed = new Map<number, SendManyResult<TProviderId>>();
    let inputDone = false;
    let nextLaunchIndex = 0;
    let nextYieldIndex = 0;
    let launchPromise: Promise<void> | undefined;
    let closed = false;
    const controller = new AbortController();
    const combinedSignal = combineSignals(controller.signal, options?.signal);
    const sendOptions: TransportOptions = {
      ...options,
      signal: combinedSignal.signal,
    };

    const launchNext = async (): Promise<void> => {
      if (inputDone) return;
      combinedSignal.signal.throwIfAborted();

      const next = await iterator.next();
      if (closed) return;
      if (next.done) {
        inputDone = true;
        return;
      }

      const index = nextLaunchIndex++;
      if (index > 0) await this.waitBetweenSendMany(combinedSignal.signal);
      if (closed) return;
      const promise = this.send(next.value, sendOptions).then(
        (receipt): SendManyResult<TProviderId> => ({
          index,
          successful: true,
          receipt,
        }),
        (error): SendManyResult<TProviderId> => ({
          index,
          successful: false,
          error,
        }),
      );
      inFlight.set(index, promise);
    };

    const startLaunch = (): void => {
      if (
        launchPromise != null ||
        inputDone ||
        inFlight.size >= this.config.sendMany.maxConcurrent
      ) return;

      launchPromise = launchNext().finally(() => {
        launchPromise = undefined;
      });
    };

    try {
      startLaunch();

      while (
        inFlight.size > 0 ||
        completed.has(nextYieldIndex) ||
        launchPromise != null ||
        !inputDone
      ) {
        while (completed.has(nextYieldIndex)) {
          const result = completed.get(nextYieldIndex);
          completed.delete(nextYieldIndex);
          if (result == null) break;
          if (!result.successful) throw result.error;
          yield result.receipt;
          nextYieldIndex++;
          startLaunch();
        }

        startLaunch();
        if (inFlight.size <= 0 && launchPromise == null) break;

        const launch = launchPromise?.then((): LaunchResult => ({
          launched: true,
        }));
        const result = await Promise.race([
          ...inFlight.values(),
          ...(launch == null ? [] : [launch]),
        ]);
        if ("launched" in result) continue;
        inFlight.delete(result.index);
        completed.set(result.index, result);
        startLaunch();
      }
    } finally {
      closed = true;
      controller.abort(
        new DOMException("The operation was aborted.", "AbortError"),
      );
      launchPromise?.catch(() => {});
      try {
        if (!inputDone) await iterator.return?.();
      } finally {
        combinedSignal.cleanup();
      }
    }
  }

  /**
   * Disposes the wrapped transport when it supports disposal.
   *
   * @since 0.5.0
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const asyncDisposable = this.wrappedTransport as Partial<AsyncDisposable>;
    const asyncDispose = asyncDisposable[Symbol.asyncDispose];
    if (typeof asyncDispose === "function") {
      await asyncDispose.call(asyncDisposable);
      return;
    }

    const disposable = this.wrappedTransport as Partial<Disposable>;
    const dispose = disposable[Symbol.dispose];
    if (typeof dispose === "function") dispose.call(disposable);
  }

  private withSuccessMetadata(
    receipt: Receipt<TProviderId> & { readonly successful: true },
    attempts: number,
  ): Receipt<TProviderId> & { readonly successful: true } {
    return {
      ...receipt,
      provider: receipt.provider ?? this.id,
      attempts,
    };
  }

  private withFailureMetadata(
    receipt: Receipt<TProviderId> & { readonly successful: false },
    attempts: number,
  ): Receipt<TProviderId> & { readonly successful: false } {
    return {
      ...receipt,
      provider: receipt.provider ?? this.id,
      retryable: receipt.retryable ?? this.hasRetryableError(receipt.errors),
      attempts,
    };
  }

  private shouldRetryReceipt(
    receipt: Receipt<TProviderId> & { readonly successful: false },
  ): boolean {
    if (this.config.shouldRetry != null) {
      return this.config.shouldRetry({ kind: "receipt", receipt });
    }
    if (receipt.retryable != null) return receipt.retryable;
    return this.hasRetryableError(receipt.errors);
  }

  private shouldRetryError(error: unknown): boolean {
    const receiptError = toReceiptError<TProviderId>(error);
    if (this.config.shouldRetry != null) {
      return this.config.shouldRetry({
        kind: "error",
        error,
        receiptError,
      });
    }
    if (receiptError != null) return receiptError.retryable;
    return classifyReceiptError(error).retryable;
  }

  private hasRetryableError(
    errors: readonly ReceiptError<TProviderId>[] | undefined,
  ): boolean {
    return errors?.some((error) => error.retryable) ?? false;
  }

  private calculateDelay(
    attempt: number,
    failure?:
      | (Receipt<TProviderId> & { readonly successful: false })
      | ReceiptError<TProviderId>,
  ): number {
    const retryAfterMilliseconds = getRetryAfterMilliseconds(failure);
    const cappedRetryAfter = retryAfterMilliseconds == null
      ? undefined
      : Math.min(
        retryAfterMilliseconds,
        this.config.backoff.maxDelayMilliseconds,
      );

    if (cappedRetryAfter != null) return cappedRetryAfter;

    const computedDelay = Math.min(
      this.config.backoff.baseDelayMilliseconds *
        Math.pow(this.config.backoff.factor, attempt - 1),
      this.config.backoff.maxDelayMilliseconds,
    );

    if (this.config.jitter === false || this.config.jitter === "none") {
      return computedDelay;
    }

    return Math.floor(this.config.random() * computedDelay);
  }

  private waitBeforeRetry(
    context: DelayContext<TProviderId>,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.config.wait(context, signal);
  }

  private waitBetweenSendMany(signal?: AbortSignal): Promise<void> {
    const delayMilliseconds = this.config.sendMany.intervalMilliseconds;
    if (delayMilliseconds <= 0) return Promise.resolve();
    return this.config.wait({
      attempt: 0,
      nextAttempt: 0,
      maxAttempts: this.config.maxAttempts,
      delayMilliseconds,
      reason: "sendMany-throttle",
    }, signal);
  }

  private createThrownFailure(
    error: unknown,
    attempts: number,
  ): Receipt<TProviderId> & { readonly successful: false } {
    const receiptError = toReceiptError<TProviderId>(error);
    if (receiptError != null) {
      return createFailedReceipt(receiptError, {
        provider: receiptError.provider ?? this.id,
        attempts,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyReceiptError(error);
    return createFailedReceipt(
      createReceiptError(message, {
        provider: this.id,
        category: classification.category,
        code: classification.code,
        retryable: classification.retryable,
      }),
      {
        provider: this.id,
        attempts,
      },
    );
  }
}

type SendManyResult<TProviderId extends string> =
  | {
    readonly index: number;
    readonly successful: true;
    readonly receipt: Receipt<TProviderId>;
  }
  | {
    readonly index: number;
    readonly successful: false;
    readonly error: unknown;
  };

interface LaunchResult {
  readonly launched: true;
}

/**
 * Creates a retrying transport around another transport.
 *
 * @param baseTransport The transport to wrap.
 * @param config Retry configuration.
 * @returns A retrying transport decorator.
 * @throws {RangeError} If retry configuration is invalid.
 * @since 0.5.0
 */
export function createRetryTransport<TProviderId extends string = string>(
  baseTransport: Transport<TProviderId>,
  config: RetryConfig<TProviderId> = {},
): RetryTransport<TProviderId> {
  return new RetryTransport(baseTransport, config);
}

function getRetryAfterMilliseconds<TProviderId extends string>(
  failure:
    | (Receipt<TProviderId> & { readonly successful: false })
    | ReceiptError<TProviderId>
    | undefined,
): number | undefined {
  if (failure == null) return undefined;
  if (isReceiptError(failure)) return failure.retryAfterMilliseconds;
  return failure.errors?.find((error) => error.retryAfterMilliseconds != null)
    ?.retryAfterMilliseconds;
}

async function* toAsyncIterator<T>(
  values: Iterable<T> | AsyncIterable<T>,
): AsyncIterator<T> {
  for await (const value of values) yield value;
}

function toReceiptError<TProviderId extends string>(
  value: unknown,
): ReceiptError<TProviderId> | undefined {
  return isReceiptError<TProviderId>(value) ? value : undefined;
}

function isReceiptError<TProviderId extends string>(
  value: unknown,
): value is ReceiptError<TProviderId> {
  return typeof value === "object" && value != null &&
    typeof (value as { readonly message?: unknown }).message === "string" &&
    typeof (value as { readonly code?: unknown }).code === "string" &&
    typeof (value as { readonly category?: unknown }).category === "string" &&
    typeof (value as { readonly retryable?: unknown }).retryable ===
      "boolean";
}
