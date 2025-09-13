import type { Message } from "@upyo/core";
import type { ResolvedTransportEntry } from "../config.ts";
import type { Strategy, TransportSelection } from "./strategy.ts";

/**
 * Weighted strategy that distributes traffic based on configured weights.
 *
 * This strategy uses weighted random selection to distribute messages
 * across transports proportionally to their configured weights.
 * A transport with weight 2 will receive approximately twice as many
 * messages as a transport with weight 1.
 * @since 0.3.0
 */
export class WeightedStrategy implements Strategy {
  /**
   * Selects a transport based on weighted random distribution.
   *
   * @param _message The message to send (unused in this strategy).
   * @param transports Available transports.
   * @param attemptedIndices Indices of transports that have already been
   *                         attempted.
   * @returns The selected transport or `undefined` if all transports have been
   *          attempted.
   */
  select(
    _message: Message,
    transports: readonly ResolvedTransportEntry[],
    attemptedIndices: Set<number>,
  ): TransportSelection | undefined {
    // Filter to enabled transports that haven't been attempted
    const availableTransports = transports
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry, index }) =>
          entry.enabled && entry.weight > 0 && !attemptedIndices.has(index),
      );

    if (availableTransports.length < 1) return undefined;

    // Calculate total weight of available transports
    const totalWeight = availableTransports.reduce(
      (sum, { entry }) => sum + entry.weight,
      0,
    );

    if (totalWeight <= 0) return undefined;

    // Random selection based on weights
    const random = Math.random() * totalWeight;
    let cumulativeWeight = 0;

    for (const { entry, index } of availableTransports) {
      cumulativeWeight += entry.weight;
      if (random < cumulativeWeight) {
        return { entry, index };
      }
    }

    // Fallback to last available transport (shouldn't normally reach here)
    const last = availableTransports[availableTransports.length - 1];
    return { entry: last.entry, index: last.index };
  }

  /**
   * Resets the strategy (no-op for weighted strategy as it's stateless).
   */
  reset(): void {
    // Weighted strategy is stateless, nothing to reset
  }
}
