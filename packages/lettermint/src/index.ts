/**
 * @fileoverview Lettermint transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * Lettermint's HTTP API.  It supports single messages, batch sending,
 * attachments, provider-specific defaults, retry logic, and idempotency.
 *
 * @since 0.5.0
 */

export { LettermintTransport } from "./lettermint-transport.ts";
export {
  createLettermintConfig,
  type LettermintConfig,
  type LettermintSettings,
  type ResolvedLettermintConfig,
} from "./config.ts";
export { LettermintApiError, LettermintTimeoutError } from "./http-client.ts";
export type {
  LettermintBatchResponse,
  LettermintError,
  LettermintResponse,
  LettermintStatus,
} from "./http-client.ts";
