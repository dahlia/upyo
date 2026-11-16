/**
 * @fileoverview Cloudflare Email Service transport for Upyo email library.
 *
 * This module provides two transports for Cloudflare Email Service:
 * `CloudflareTransport` sends through the REST API from any runtime, and
 * `CloudflareWorkerTransport` sends through a `send_email` binding on
 * Cloudflare Workers.  Both support attachments, inline images, and custom
 * headers.
 *
 * @example
 * ```typescript
 * import { createMessage } from "@upyo/core";
 * import { CloudflareTransport } from "@upyo/cloudflare";
 *
 * const transport = new CloudflareTransport({
 *   accountId: "your-account-id",
 *   apiToken: "your-api-token",
 * });
 *
 * const receipt = await transport.send(
 *   createMessage({
 *     from: "hello@example.com",
 *     to: "user@example.com",
 *     subject: "Welcome!",
 *     content: { html: "<h1>Hello!</h1>" },
 *   }),
 * );
 *
 * if (receipt.successful) {
 *   console.log("Message sent:", receipt.messageId);
 * }
 * ```
 *
 * @since 0.7.0
 */

export {
  type CloudflareReceipt,
  CloudflareTransport,
} from "./cloudflare-transport.ts";
export type { CloudflareConfig, ResolvedCloudflareConfig } from "./config.ts";
export {
  type CloudflareWorkerConfig,
  type CloudflareWorkerReceipt,
  CloudflareWorkerTransport,
  type ResolvedCloudflareWorkerConfig,
} from "./worker-transport.ts";
export type {
  CloudflareBindingAddress,
  CloudflareBindingAttachment,
  CloudflareBindingMessage,
  CloudflareEmailBinding,
  CloudflareEmailSendResult,
} from "./binding.ts";
export { CloudflareValidationError } from "./errors.ts";
export type { CloudflareValidationErrorCode } from "./errors.ts";
export { CloudflareApiError } from "./http-client.ts";
export type {
  CloudflareApiErrorOptions,
  CloudflareError,
  CloudflareResponse,
} from "./http-client.ts";
