import type { Message, Transport } from "@upyo/core";
import type { Strategy } from "./strategies/strategy.ts";

/**
 * Strategy for selecting transports in a pool.
 * @since 0.3.0
 */
export type PoolStrategy =
  | "round-robin"
  | "weighted"
  | "priority"
  | "selector-based";

/**
 * Function that determines if a transport should handle a specific message.
 * @since 0.3.0
 */
export type TransportSelector = (message: Message) => boolean;

/**
 * Configuration for a transport entry in the pool.
 * @since 0.3.0
 */
export interface TransportEntry {
  /**
   * The transport instance to use.
   */
  readonly transport: Transport;

  /**
   * Weight for weighted distribution strategy.
   * Higher values mean more traffic. Defaults to 1.
   */
  readonly weight?: number;

  /**
   * Priority for priority-based failover strategy.
   * Higher values are tried first. Defaults to 0.
   */
  readonly priority?: number;

  /**
   * Selector function for selector-based routing.
   * If provided, this transport will only be used for messages
   * where the selector returns true.
   */
  readonly selector?: TransportSelector;

  /**
   * Whether this transport is enabled.
   * Disabled transports are skipped. Defaults to true.
   */
  readonly enabled?: boolean;
}

/**
 * Configuration options for the pool transport.
 * @since 0.3.0
 */
export interface PoolConfig {
  /**
   * The strategy to use for selecting transports.
   * Can be a built-in strategy name or a custom Strategy instance.
   */
  readonly strategy: PoolStrategy | Strategy;

  /**
   * The transports in the pool.
   */
  readonly transports: readonly TransportEntry[];

  /**
   * Maximum number of retry attempts when a transport fails.
   * Set to 0 to disable retries. Defaults to the number of transports.
   */
  readonly maxRetries?: number;

  /**
   * Timeout in milliseconds for each send attempt.
   * If not specified, no timeout is applied.
   */
  readonly timeout?: number;

  /**
   * Whether to continue trying other transports after a successful send
   * when using selector-based strategy. Defaults to false.
   */
  readonly continueOnSuccess?: boolean;
}

/**
 * Resolved pool configuration with defaults applied.
 * @since 0.3.0
 */
export interface ResolvedPoolConfig {
  readonly strategy: PoolStrategy | Strategy;
  readonly transports: readonly ResolvedTransportEntry[];
  readonly maxRetries: number;
  readonly timeout?: number;
  readonly continueOnSuccess: boolean;
}

/**
 * Resolved transport entry with defaults applied.
 * @since 0.3.0
 */
export interface ResolvedTransportEntry {
  readonly transport: Transport;
  readonly weight: number;
  readonly priority: number;
  readonly selector?: TransportSelector;
  readonly enabled: boolean;
}

/**
 * Creates a resolved pool configuration with defaults applied.
 *
 * @param config The pool configuration.
 * @returns The resolved configuration with defaults.
 * @throws {Error} If the configuration is invalid.
 * @since 0.3.0
 */
export function createPoolConfig(config: PoolConfig): ResolvedPoolConfig {
  if (!config.transports || config.transports.length === 0) {
    throw new Error("Pool must have at least one transport");
  }

  const enabledTransports = config.transports.filter(
    (entry) => entry.enabled !== false,
  );

  if (enabledTransports.length === 0) {
    throw new Error("Pool must have at least one enabled transport");
  }

  const resolvedTransports: ResolvedTransportEntry[] = config.transports.map(
    (entry) => ({
      transport: entry.transport,
      weight: entry.weight ?? 1,
      priority: entry.priority ?? 0,
      selector: entry.selector,
      enabled: entry.enabled ?? true,
    }),
  );

  // Validate weights for weighted strategy
  if (config.strategy === "weighted") {
    const hasValidWeights = resolvedTransports.some(
      (entry) => entry.enabled && entry.weight > 0,
    );
    if (!hasValidWeights) {
      throw new Error(
        "Weighted strategy requires at least one enabled transport with positive weight",
      );
    }
  }

  return {
    strategy: config.strategy,
    transports: resolvedTransports,
    maxRetries: config.maxRetries ?? enabledTransports.length,
    timeout: config.timeout,
    continueOnSuccess: config.continueOnSuccess ?? false,
  };
}
