/**
 * @upyo/pool - Pool transport for Upyo email library
 *
 * Provides load balancing and failover capabilities for combining
 * multiple email transports with various strategies.
 *
 * @packageDocumentation
 * @since 0.3.0
 */

export { PoolTransport } from "./pool-transport.ts";
export {
  type PoolConfig,
  type PoolStrategy,
  type ResolvedPoolConfig,
  type ResolvedTransportEntry,
  type TransportEntry,
  type TransportSelector,
} from "./config.ts";

// Export strategies for advanced usage
export type { Strategy, TransportSelection } from "./strategies/strategy.ts";
export { RoundRobinStrategy } from "./strategies/round-robin-strategy.ts";
export { WeightedStrategy } from "./strategies/weighted-strategy.ts";
export { PriorityStrategy } from "./strategies/priority-strategy.ts";
export { SelectorStrategy } from "./strategies/selector-strategy.ts";
