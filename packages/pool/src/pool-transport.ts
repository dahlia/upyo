import {
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
  createPoolConfig,
  type PoolConfig,
  type PoolStrategy,
  type ResolvedPoolConfig,
} from "./config.ts";
import type { Strategy } from "./strategies/strategy.ts";
import { RoundRobinStrategy } from "./strategies/round-robin-strategy.ts";
import { WeightedStrategy } from "./strategies/weighted-strategy.ts";
import { PriorityStrategy } from "./strategies/priority-strategy.ts";
import { SelectorStrategy } from "./strategies/selector-strategy.ts";

/**
 * Pool transport that combines multiple transports with various load balancing
 * and failover strategies.
 *
 * This transport implements the same `Transport` interface, making it a drop-in
 * replacement for any single transport. It distributes messages across multiple
 * underlying transports based on the configured strategy.
 *
 * @example Round-robin load balancing
 * ```typescript
 * import { PoolTransport } from "@upyo/pool";
 *
 * const transport = new PoolTransport({
 *   strategy: "round-robin",
 *   transports: [
 *     { transport: mailgunTransport },
 *     { transport: sendgridTransport },
 *     { transport: sesTransport },
 *   ],
 * });
 * ```
 *
 * @example Priority-based failover
 * ```typescript
 * const transport = new PoolTransport({
 *   strategy: "priority",
 *   transports: [
 *     { transport: primaryTransport, priority: 100 },
 *     { transport: backupTransport, priority: 50 },
 *     { transport: lastResortTransport, priority: 10 },
 *   ],
 * });
 * ```
 *
 * @example Custom routing with selectors
 * ```typescript
 * const transport = new PoolTransport({
 *   strategy: "selector-based",
 *   transports: [
 *     {
 *       transport: bulkEmailTransport,
 *       selector: (msg) => msg.tags?.includes("newsletter"),
 *     },
 *     {
 *       transport: transactionalTransport,
 *       selector: (msg) => msg.priority === "high",
 *     },
 *     { transport: defaultTransport }, // Catches everything else
 *   ],
 * });
 * ```
 *
 * @since 0.3.0
 */
export class PoolTransport<TProviderId extends string = string>
  implements Transport<TProviderId | "pool">, AsyncDisposable {
  readonly id = "pool";

  /**
   * The resolved configuration used by this pool transport.
   */
  readonly config: ResolvedPoolConfig<TProviderId>;

  private readonly strategy: Strategy<TProviderId>;

  /**
   * Creates a new PoolTransport instance.
   *
   * @param config Configuration options for the pool transport.
   * @throws {Error} If the configuration is invalid.
   */
  constructor(config: PoolConfig<TProviderId>) {
    this.config = createPoolConfig(config);
    this.strategy = this.createStrategy(this.config.strategy);
  }

  /**
   * Sends a single email message using the pool strategy.
   *
   * The transport is selected based on the configured strategy. If the
   * selected transport fails, the pool will retry with other transports
   * up to the configured retry limit.
   *
   * @param message The email message to send.
   * @param options Optional transport options including abort signal.
   * @returns A promise that resolves to a receipt indicating success or failure.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<TProviderId | "pool">> {
    const attemptedIndices = new Set<number>();
    const errorMessages: string[] = [];
    const errors: ReceiptError<TProviderId | "pool">[] = [];
    let checkCallerAbortBeforeFailure = false;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Check for cancellation
      if (options?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      // Select a transport
      const selection = this.strategy.select(
        message,
        this.config.transports,
        attemptedIndices,
      );

      if (!selection) {
        // No more transports available
        break;
      }

      attemptedIndices.add(selection.index);

      let abortedByCaller = false;
      try {
        // Apply timeout if configured
        const sendOptions = this.createSendOptions(options);

        let receipt: Receipt<TProviderId>;
        try {
          receipt = await selection.entry.transport.send(
            message,
            sendOptions.options,
          );
        } catch (error) {
          if (
            sendOptions.abortedByCaller() &&
            isCallerAbort(error, options?.signal)
          ) {
            abortedByCaller = true;
            throw error;
          }
          throw error;
        } finally {
          sendOptions.cleanup();
        }

        if (receipt.successful) {
          return receipt;
        }

        // Collect error messages for failed attempts
        errorMessages.push(...receipt.errorMessages);
        errors.push(...getReceiptErrors(receipt, selection.entry.transport.id));
        checkCallerAbortBeforeFailure = true;
      } catch (error) {
        // Handle transport errors
        if (abortedByCaller && isCallerAbort(error, options?.signal)) {
          throw error;
        }

        const thrownErrors = getThrownReceiptErrors(
          error,
          selection.entry.transport.id,
        );
        if (thrownErrors.length > 0) {
          errorMessages.push(...thrownErrors.map((item) => item.message));
          errors.push(...thrownErrors);
          checkCallerAbortBeforeFailure = true;
          continue;
        }

        const timeoutMessage = "Transport send timed out.";
        const abortError = isAbortError(error);
        const errorMessage = abortError
          ? timeoutMessage
          : error instanceof Error
          ? error.message
          : String(error);
        errorMessages.push(errorMessage);
        errors.push(createReceiptError(errorMessage, {
          provider: selection.entry.transport.id,
          category: abortError ? "timeout" : undefined,
          retryable: abortError ? true : undefined,
        }));
        checkCallerAbortBeforeFailure ||= !abortError;
      }
    }

    // All attempts failed
    if (checkCallerAbortBeforeFailure) {
      options?.signal?.throwIfAborted();
    }

    return createFailedReceipt<TProviderId | "pool">(
      errorMessages.length > 0
        ? errorMessages
        : ["All transports failed to send the message."],
      {
        provider: "pool",
        errors: errors.length > 0 ? errors : undefined,
        attempts: attemptedIndices.size,
      },
    );
  }

  /**
   * Sends multiple email messages using the pool strategy.
   *
   * Each message is sent individually using the `send` method, respecting
   * the configured strategy and retry logic.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including abort signal.
   * @returns An async iterable of receipts, one for each message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<TProviderId | "pool">> {
    // Reset strategy state for batch operations
    this.strategy.reset();

    for await (const message of messages) {
      if (options?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      yield await this.send(message, options);
    }
  }

  /**
   * Disposes of all underlying transports that support disposal.
   *
   * This method is called automatically when using the `await using` syntax.
   * It ensures proper cleanup of resources held by the underlying transports.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const disposalPromises: Promise<void>[] = [];

    for (const entry of this.config.transports) {
      const transport = entry.transport;

      // Check for AsyncDisposable
      if (
        typeof (transport as unknown as AsyncDisposable)[
          Symbol.asyncDispose
        ] ===
          "function"
      ) {
        const asyncDispose = (transport as unknown as AsyncDisposable)
          [Symbol.asyncDispose]();
        disposalPromises.push(Promise.resolve(asyncDispose));
      } // Check for Disposable
      else if (
        typeof (transport as unknown as Disposable)[Symbol.dispose] ===
          "function"
      ) {
        try {
          (transport as unknown as Disposable)[Symbol.dispose]();
        } catch {
          // Ignore disposal errors
        }
      }
    }

    // Wait for all async disposals to complete
    await Promise.allSettled(disposalPromises);
  }

  /**
   * Creates a strategy instance based on the strategy type or returns the provided strategy.
   */
  private createStrategy(
    strategy: PoolStrategy | Strategy<TProviderId>,
  ): Strategy<TProviderId> {
    // If it's already a Strategy instance, return it directly
    if (typeof strategy === "object" && strategy !== null) {
      return strategy;
    }

    // Handle built-in strategy names
    switch (strategy) {
      case "round-robin":
        return new RoundRobinStrategy<TProviderId>();
      case "weighted":
        return new WeightedStrategy<TProviderId>();
      case "priority":
        return new PriorityStrategy<TProviderId>();
      case "selector-based":
        return new SelectorStrategy<TProviderId>();
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Creates send options with timeout if configured.
   */
  private createSendOptions(
    options?: TransportOptions,
  ): {
    readonly options?: TransportOptions;
    abortedByCaller(): boolean;
    cleanup(): void;
  } {
    if (!this.config.timeout) {
      return {
        options,
        abortedByCaller: () => options?.signal?.aborted ?? false,
        cleanup: () => {},
      };
    }

    // Create AbortController for timeout
    const timeoutController = new AbortController();
    let abortSource: "caller" | "timeout" | undefined;
    const timeoutId = setTimeout(() => {
      abortSource ??= "timeout";
      timeoutController.abort(createAbortError());
    }, this.config.timeout);
    let cleanupAbortSource = () => {};
    let signal = timeoutController.signal;
    let cleanupCombinedSignal = () => {};

    // Combine with existing signal if present
    if (options?.signal) {
      const markCallerAbort = () => {
        abortSource ??= "caller";
        clearTimeout(timeoutId);
      };
      if (options.signal.aborted) {
        markCallerAbort();
      } else {
        options.signal.addEventListener("abort", markCallerAbort, {
          once: true,
        });
      }
      cleanupAbortSource = () =>
        options.signal?.removeEventListener("abort", markCallerAbort);

      const combinedSignal = combineSignals(
        timeoutController.signal,
        options.signal,
      );
      signal = combinedSignal.signal;
      cleanupCombinedSignal = combinedSignal.cleanup;
    }

    // Clean up timeout when done
    timeoutController.signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
    });

    return {
      options: {
        ...options,
        signal,
      },
      abortedByCaller: () => abortSource === "caller",
      cleanup: () => {
        clearTimeout(timeoutId);
        cleanupAbortSource();
        cleanupCombinedSignal();
      },
    };
  }
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isCallerAbort(error: unknown, signal?: AbortSignal): boolean {
  return isAbortError(error) || error === signal?.reason;
}

function getReceiptErrors<TProviderId extends string>(
  receipt: Receipt<TProviderId> & { readonly successful: false },
  provider: TProviderId,
): readonly ReceiptError<TProviderId>[] {
  if (receipt.errors != null && receipt.errors.length > 0) {
    return receipt.errors.map((error) =>
      error.provider == null ? { ...error, provider } : error
    );
  }

  return receipt.errorMessages.map((message) =>
    createReceiptError(message, { provider: receipt.provider ?? provider })
  );
}

function getThrownReceiptErrors<TProviderId extends string>(
  error: unknown,
  provider: TProviderId,
): readonly ReceiptError<TProviderId>[] {
  if (isReceiptError<TProviderId>(error)) {
    return [error.provider == null ? { ...error, provider } : error];
  }

  if (isFailedReceipt<TProviderId>(error)) {
    return getReceiptErrors(error, provider);
  }

  return [];
}

function isReceiptError<TProviderId extends string>(
  value: unknown,
): value is ReceiptError<TProviderId> {
  return typeof value === "object" && value != null &&
    typeof (value as { readonly message?: unknown }).message === "string" &&
    typeof (value as { readonly code?: unknown }).code === "string" &&
    typeof (value as { readonly retryable?: unknown }).retryable ===
      "boolean" &&
    typeof (value as { readonly category?: unknown }).category === "string";
}

function isFailedReceipt<TProviderId extends string>(
  value: unknown,
): value is Receipt<TProviderId> & { readonly successful: false } {
  return typeof value === "object" && value != null &&
    (value as { readonly successful?: unknown }).successful === false &&
    Array.isArray(
      (value as { readonly errorMessages?: unknown })
        .errorMessages,
    );
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
