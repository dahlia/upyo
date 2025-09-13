import type { Message } from "@upyo/core";
import type { ResolvedTransportEntry } from "../config.ts";
import type { Strategy, TransportSelection } from "./strategy.ts";

/**
 * Round-robin strategy that cycles through transports in order.
 *
 * This strategy maintains an internal counter and selects transports
 * in a circular fashion, ensuring even distribution of messages across
 * all enabled transports.
 * @since 0.3.0
 */
export class RoundRobinStrategy implements Strategy {
  private currentIndex: number = 0;

  /**
   * Selects the next transport in round-robin order.
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
    const enabledCount = transports.filter((t) => t.enabled).length;
    if (enabledCount < 1) return undefined;

    // Try up to the number of enabled transports
    for (let attempts = 0; attempts < enabledCount; attempts++) {
      // Find the next enabled transport
      while (!transports[this.currentIndex].enabled) {
        this.currentIndex = (this.currentIndex + 1) % transports.length;
      }

      const index = this.currentIndex;
      const entry = transports[index];

      // Move to next for the next call
      this.currentIndex = (this.currentIndex + 1) % transports.length;

      // Skip if already attempted
      if (attemptedIndices.has(index)) continue;

      return { entry, index };
    }

    return undefined;
  }

  /**
   * Resets the round-robin counter to start from the beginning.
   */
  reset(): void {
    this.currentIndex = 0;
  }
}
