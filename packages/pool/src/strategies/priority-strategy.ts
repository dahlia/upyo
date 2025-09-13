import type { Message } from "@upyo/core";
import type { ResolvedTransportEntry } from "../config.ts";
import type { Strategy, TransportSelection } from "./strategy.ts";

/**
 * Priority strategy that selects transports based on priority values.
 *
 * This strategy always attempts to use the highest priority transport
 * first, falling back to lower priority transports only when higher
 * priority ones fail. Transports with the same priority are considered
 * equivalent and one is selected randomly.
 * @since 0.3.0
 */
export class PriorityStrategy implements Strategy {
  /**
   * Selects the highest priority transport that hasn't been attempted.
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
        ({ entry, index }) => entry.enabled && !attemptedIndices.has(index),
      );

    if (availableTransports.length < 1) return undefined;

    // Sort by priority (highest first)
    availableTransports.sort((a, b) => b.entry.priority - a.entry.priority);

    // Get the highest priority value
    const highestPriority = availableTransports[0].entry.priority;

    // Filter to only transports with the highest priority
    const topPriorityTransports = availableTransports.filter(
      ({ entry }) => entry.priority === highestPriority,
    );

    // If multiple transports have the same priority, select randomly
    if (topPriorityTransports.length > 1) {
      const randomIndex = Math.floor(
        Math.random() * topPriorityTransports.length,
      );
      return topPriorityTransports[randomIndex];
    }

    // Return the single highest priority transport
    return topPriorityTransports[0];
  }

  /**
   * Resets the strategy (no-op for priority strategy as it's stateless).
   */
  reset(): void {
    // Priority strategy is stateless, nothing to reset
  }
}
