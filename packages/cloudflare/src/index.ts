/**
 * @fileoverview Cloudflare Email Service transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * the Cloudflare Email Sending REST API.  It supports attachments, inline
 * images, custom headers, and automatic retry of rate-limited requests.
 *
 * @example
 * ```typescript
 * import { CloudflareTransport } from "@upyo/cloudflare";
 *
 * const transport = new CloudflareTransport({
 *   accountId: "your-account-id",
 *   apiToken: "your-api-token",
 * });
 *
 * const receipt = await transport.send({
 *   sender: { address: "hello@example.com" },
 *   recipients: [{ address: "user@example.com" }],
 *   ccRecipients: [],
 *   bccRecipients: [],
 *   replyRecipients: [],
 *   subject: "Welcome!",
 *   content: { html: "<h1>Hello!</h1>" },
 *   attachments: [],
 *   priority: "normal",
 *   tags: [],
 *   headers: new Headers(),
 * });
 *
 * if (receipt.successful) {
 *   console.log("Message sent:", receipt.messageId);
 * }
 * ```
 */

export {
  type CloudflareReceipt,
  CloudflareTransport,
} from "./cloudflare-transport.ts";
export type { CloudflareConfig, ResolvedCloudflareConfig } from "./config.ts";
export { CloudflareValidationError } from "./errors.ts";
export type { CloudflareValidationErrorCode } from "./errors.ts";
export { CloudflareApiError } from "./http-client.ts";
export type {
  CloudflareApiErrorOptions,
  CloudflareError,
  CloudflareResponse,
} from "./http-client.ts";
