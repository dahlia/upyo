import type { Message } from "./message.ts";
import type { Receipt } from "./receipt.ts";

/**
 * A common interface for email sending services.
 */
export interface Transport {
  /**
   * Sends a single message using the email service.
   * @param message The message to send.
   * @param options Optional parameters for sending the message.
   * @returns A promise that resolves to a receipt containing the result of
   *          the send operation.
   */
  send(message: Message, options?: TransportOptions): Promise<Receipt>;

  /**
   * Sends multiple messages using the email service.
   * @param messages An iterable of messages to send.
   * @param options Optional parameters for sending the messages.
   * @return An async iterable that yields receipts for each sent message.
   */
  sendMany(
    messages: Iterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt>;

  /**
   * Sends multiple messages using the email service.
   * @param messages An async iterable of messages to send.
   * @param options Optional parameters for sending the messages.
   * @return An async iterable that yields receipts for each sent message.
   */
  sendMany(
    messages: AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt>;
}

/**
 * Options for sending messages with the email service.
 */
export interface TransportOptions {
  /**
   * The abort signal to cancel the send operation if needed.
   */
  signal?: AbortSignal;
}
