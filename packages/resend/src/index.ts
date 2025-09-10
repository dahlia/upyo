/**
 * @fileoverview Resend transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * Resend's HTTP API. It supports single messages, batch sending, attachments,
 * and all standard email features with automatic retry logic and idempotency.
 *
 * @example
 * ```typescript
 * import { ResendTransport } from '@upyo/resend';
 *
 * const transport = new ResendTransport({
 *   apiKey: 'your-resend-api-key'
 * });
 *
 * // Send a single message
 * const receipt = await transport.send({
 *   sender: { address: 'hello@example.com' },
 *   recipients: [{ address: 'user@example.com' }],
 *   subject: 'Welcome!',
 *   content: { html: '<h1>Hello!</h1>' }
 * });
 *
 * if (receipt.successful) {
 *   console.log('Message sent:', receipt.messageId);
 * }
 * ```
 */

export { ResendTransport } from "./resend-transport.ts";
export type { ResendConfig, ResolvedResendConfig } from "./config.ts";
export type {
  ResendApiError,
  ResendBatchResponse,
  ResendError,
  ResendResponse,
} from "./http-client.ts";
