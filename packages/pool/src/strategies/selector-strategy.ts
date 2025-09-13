import type { Message } from "@upyo/core";
import type { ResolvedTransportEntry } from "../config.ts";
import type { Strategy, TransportSelection } from "./strategy.ts";

/**
 * Selector strategy that routes messages based on custom selector functions.
 *
 * This strategy evaluates each transport's selector function (if provided)
 * to determine if it should handle a specific message. Transports without
 * selectors are considered as catch-all fallbacks. Among matching transports,
 * one is selected randomly.
 * @since 0.3.0
 */
export class SelectorStrategy implements Strategy {
  /**
   * Selects a transport based on selector function matching.
   *
   * @param message The message to send.
   * @param transports Available transports.
   * @param attemptedIndices Indices of transports that have already been
   *                         attempted.
   * @returns The selected transport or `undefined` if no transport matches.
   */
  select(
    message: Message,
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

    // Separate transports with selectors from those without
    const withSelectors: typeof availableTransports = [];
    const withoutSelectors: typeof availableTransports = [];

    for (const transport of availableTransports) {
      if (transport.entry.selector) {
        // Evaluate selector function
        try {
          if (transport.entry.selector(message)) {
            withSelectors.push(transport);
          }
        } catch {
          // If selector throws, skip this transport
        }
      } else {
        // No selector means it accepts all messages
        withoutSelectors.push(transport);
      }
    }

    // Prefer transports with matching selectors
    const candidates = withSelectors.length > 0
      ? withSelectors
      : withoutSelectors;

    if (candidates.length < 1) return undefined;

    // Select randomly from candidates
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  /**
   * Resets the strategy (no-op for selector strategy as it's stateless).
   */
  reset(): void {
    // Selector strategy is stateless, nothing to reset
  }
}
