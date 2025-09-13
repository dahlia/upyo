import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
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
export class PoolTransport implements Transport, AsyncDisposable {
  /**
   * The resolved configuration used by this pool transport.
   */
  readonly config: ResolvedPoolConfig;

  private readonly strategy: Strategy;

  /**
   * Creates a new PoolTransport instance.
   *
   * @param config Configuration options for the pool transport.
   * @throws {Error} If the configuration is invalid.
   */
  constructor(config: PoolConfig) {
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
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    const attemptedIndices = new Set<number>();
    const errors: string[] = [];
    // Track errors from all attempts
    // let lastReceipt: Receipt | null = null; // Removed as it was unused

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
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

      try {
        // Apply timeout if configured
        const sendOptions = this.createSendOptions(options);

        // Send the message
        const receipt = await selection.entry.transport.send(
          message,
          sendOptions,
        );

        // Track receipt for potential error collection
        // lastReceipt = receipt; // Removed as lastReceipt was removed

        if (receipt.successful) {
          return receipt;
        }

        // Collect error messages for failed attempts
        errors.push(...receipt.errorMessages);
      } catch (error) {
        // Handle transport errors
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }

        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        errors.push(errorMessage);
      }
    }

    // All attempts failed
    return {
      successful: false,
      errorMessages: errors.length > 0
        ? errors
        : ["All transports failed to send the message"],
    };
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
  ): AsyncIterable<Receipt> {
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
  private createStrategy(strategy: PoolStrategy | Strategy): Strategy {
    // If it's already a Strategy instance, return it directly
    if (typeof strategy === "object" && strategy !== null) {
      return strategy;
    }

    // Handle built-in strategy names
    switch (strategy) {
      case "round-robin":
        return new RoundRobinStrategy();
      case "weighted":
        return new WeightedStrategy();
      case "priority":
        return new PriorityStrategy();
      case "selector-based":
        return new SelectorStrategy();
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Creates send options with timeout if configured.
   */
  private createSendOptions(
    options?: TransportOptions,
  ): TransportOptions | undefined {
    if (!this.config.timeout) {
      return options;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout,
    );

    // Combine with existing signal if present
    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }

    // Clean up timeout when done
    controller.signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
    });

    return {
      ...options,
      signal: controller.signal,
    };
  }
}
