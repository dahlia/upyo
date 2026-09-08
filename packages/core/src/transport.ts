import type { RawMessage } from "./raw-message.ts";
import type { Message } from "./message.ts";
import type { Receipt } from "./receipt.ts";

/**
 * A common interface for email sending services.
 */
export interface Transport<TProviderId extends string = string> {
  /**
   * Stable provider identifier for receipts produced by this transport.
   *
   * @since 0.5.0
   */
  readonly id: TProviderId;

  /**
   * Sends a single message using the email service.
   * @param message The message to send.
   * @param options Optional parameters for sending the message.
   * @returns A promise that resolves to a receipt containing the result of
   *          the send operation.
   */
  send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<TProviderId>>;

  /**
   * Sends multiple messages using the email service.
   * @param messages An iterable of messages to send.
   * @param options Optional parameters for sending the messages.
   * @return An async iterable that yields receipts for each sent message.
   */
  sendMany(
    messages: Iterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<TProviderId>>;

  /**
   * Sends multiple messages using the email service.
   * @param messages An async iterable of messages to send.
   * @param options Optional parameters for sending the messages.
   * @return An async iterable that yields receipts for each sent message.
   */
  sendMany(
    messages: AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<TProviderId>>;
}

/**
 * Options for sending messages with the email service.
 */
export interface TransportOptions {
  /**
   * The abort signal to cancel the send operation if needed.
   */
  readonly signal?: AbortSignal;
}

/**
 * Optional capability for delivering already serialized MIME messages.
 * Wrappers must explicitly preserve this capability to expose it themselves.
 * @since 0.6.0
 */
export interface RawTransport<TProviderId extends string = string>
  extends Transport<TProviderId> {
  /**
   * Delivers original MIME bytes using an explicit envelope.
   * @param message The serialized message and its delivery envelope.
   * @param options Optional cancellation signal.
   * @returns A delivery receipt; server-side processing may modify the message.
   * @throws {Error} If cancellation is requested.
   */
  sendRaw(
    message: RawMessage,
    options?: TransportOptions,
  ): Promise<Receipt<TProviderId>>;
}

/**
 * Checks whether a transport exposes raw MIME delivery.
 * @param transport The transport to inspect.
 * @returns Whether the transport implements the optional raw capability.
 * @since 0.6.0
 */
export function isRawTransport<TProviderId extends string>(
  transport: Transport<TProviderId>,
): transport is RawTransport<TProviderId> {
  return "sendRaw" in transport && typeof transport.sendRaw === "function";
}
