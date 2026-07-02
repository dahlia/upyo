/**
 * @fileoverview Maileroo transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * Maileroo's HTTP API.  It supports single messages, sequential `sendMany()`,
 * attachments, custom headers, tags, tracking settings, retry logic, and
 * cancellation.
 *
 * @since 0.6.0
 */

export { MailerooTransport } from "./maileroo-transport.ts";
export {
  createMailerooConfig,
  type MailerooConfig,
  type ResolvedMailerooConfig,
} from "./config.ts";
export { MailerooApiError, MailerooTimeoutError } from "./http-client.ts";
export type { MailerooError, MailerooResponse } from "./http-client.ts";
export type {
  MailerooAttachment,
  MailerooEmail,
  MailerooEmailAddress,
} from "./message-converter.ts";
