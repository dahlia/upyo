import type { Message } from "@upyo/core";
import type { ResolvedTransportEntry } from "../config.ts";

/**
 * Result of transport selection by a strategy.
 * @since 0.3.0
 */
export interface TransportSelection {
  /**
   * The selected transport entry.
   */
  readonly entry: ResolvedTransportEntry;

  /**
   * Index of the selected transport in the original list.
   */
  readonly index: number;
}

/**
 * Base interface for transport selection strategies.
 * @since 0.3.0
 */
export interface Strategy {
  /**
   * Selects a transport for sending a message.
   *
   * @param message The message to send.
   * @param transports Available transports.
   * @param attemptedIndices Indices of transports that have already been
   *                         attempted.
   * @returns The selected transport or `undefined` if no suitable transport is
   *          available.
   */
  select(
    message: Message,
    transports: readonly ResolvedTransportEntry[],
    attemptedIndices: Set<number>,
  ): TransportSelection | undefined;

  /**
   * Resets any internal state of the strategy.
   */
  reset(): void;
}
