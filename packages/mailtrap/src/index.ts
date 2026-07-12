/**
 * @fileoverview Mailtrap transport for Upyo email library.
 *
 * This module provides a transport implementation for sending emails through
 * Mailtrap's HTTP API.  It supports Email API and Email Sandbox sending,
 * single messages, batch sending, attachments, and retry logic.
 *
 * @since 0.6.0
 */

export { MailtrapTransport } from "./mailtrap-transport.ts";
export {
  createMailtrapConfig,
  type MailtrapConfig,
  type ResolvedMailtrapConfig,
} from "./config.ts";
export {
  MailtrapApiError,
  MailtrapTimeoutError,
} from "./http-client.ts";
export type {
  MailtrapBatchItemResponse,
  MailtrapBatchResponse,
  MailtrapError,
  MailtrapSendResponse,
} from "./http-client.ts";
export type {
  MailtrapAddress,
  MailtrapAttachment,
  MailtrapEmail,
} from "./message-converter.ts";
