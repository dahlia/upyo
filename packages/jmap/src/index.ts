/**
 * @upyo/jmap - JMAP transport for Upyo email library
 * RFC 8620 (core) and RFC 8621 (mail) compliant
 * @module
 * @since 0.4.0
 */

export { JmapTransport } from "./jmap-transport.ts";
export { type JmapConfig, type ResolvedJmapConfig, createJmapConfig } from "./config.ts";
export { JmapApiError, isCapabilityError, JMAP_ERROR_TYPES } from "./errors.ts";
export type { JmapSession, JmapAccount, JmapIdentity } from "./session.ts";
