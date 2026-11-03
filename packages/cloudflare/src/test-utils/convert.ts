import type { Message } from "@upyo/core";
import type { CloudflareBindingMessage } from "../binding.ts";
import {
  buildBindingMessage,
  convertBindingAttachments,
} from "../binding-converter.ts";
import { prepareMessage } from "../message-preparation.ts";
import {
  buildEmail,
  type CloudflareEmail,
  convertAttachments,
} from "../message-converter.ts";

/**
 * Converts a message to the REST API request body the way
 * `CloudflareTransport` does, for tests of the conversion as a whole.
 *
 * @param message The Upyo message to convert.
 * @param options Optional conversion options.
 * @returns The request body.
 * @throws {TypeError} If the message carries an invalid message identifier or
 *         calendar.
 * @throws {CloudflareValidationError} If the message fails a check before
 *         sending.
 */
export async function convertMessage(
  message: Message,
  options: { readonly signal?: AbortSignal } = {},
): Promise<CloudflareEmail> {
  const prepared = prepareMessage(message);
  const email = buildEmail(message, prepared);
  const attachments = await convertAttachments(
    prepared.attachments,
    options.signal,
  );
  return attachments.length > 0 ? { ...email, attachments } : email;
}

/**
 * Converts a message to the Workers binding format the way
 * `CloudflareWorkerTransport` does, for tests of the conversion as a whole.
 *
 * @param message The Upyo message to convert.
 * @param options Optional conversion options.
 * @returns The message to pass to the binding's `send()`.
 * @throws {TypeError} If the message carries an invalid message identifier or
 *         calendar.
 * @throws {CloudflareValidationError} If the message fails a check before
 *         sending.
 */
export async function convertBindingMessage(
  message: Message,
  options: { readonly signal?: AbortSignal } = {},
): Promise<CloudflareBindingMessage> {
  const prepared = prepareMessage(message);
  const built = buildBindingMessage(message, prepared);
  const attachments = await convertBindingAttachments(
    prepared.attachments,
    options.signal,
  );
  return attachments.length > 0 ? { ...built, attachments } : built;
}
