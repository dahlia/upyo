import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { ResolvedSendGridConfig, SendGridConfig } from "./config.ts";
import { createSendGridConfig } from "./config.ts";
import { SendGridHttpClient } from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";

/**
 * SendGrid transport implementation for sending emails via SendGrid API.
 *
 * This transport provides efficient email delivery using SendGrid's v3 HTTP API,
 * with support for authentication, retry logic, and batch sending capabilities.
 *
 * @example
 * ```typescript
 * import { SendGridTransport } from '@upyo/sendgrid';
 *
 * const transport = new SendGridTransport({
 *   apiKey: 'your-sendgrid-api-key',
 *   clickTracking: true,
 *   openTracking: true
 * });
 *
 * const receipt = await transport.send(message);
 * if (receipt.successful) {
 *   console.log('Message sent with ID:', receipt.messageId);
 * } else {
 *   console.error('Send failed:', receipt.errorMessages.join(', '));
 * }
 * ```
 */
export class SendGridTransport implements Transport {
  /**
   * The resolved SendGrid configuration used by this transport.
   */
  config: ResolvedSendGridConfig;

  private httpClient: SendGridHttpClient;

  /**
   * Creates a new SendGrid transport instance.
   *
   * @param config SendGrid configuration including API key and options.
   */
  constructor(config: SendGridConfig) {
    this.config = createSendGridConfig(config);
    this.httpClient = new SendGridHttpClient(this.config);
  }

  /**
   * Sends a single email message via SendGrid API.
   *
   * This method converts the message to SendGrid format, makes an HTTP request
   * to the SendGrid API, and returns a receipt with the result.
   *
   * @example
   * ```typescript
   * const receipt = await transport.send({
   *   sender: { address: 'from@example.com' },
   *   recipients: [{ address: 'to@example.com' }],
   *   ccRecipients: [],
   *   bccRecipients: [],
   *   replyRecipients: [],
   *   subject: 'Hello',
   *   content: { text: 'Hello World!' },
   *   attachments: [],
   *   priority: 'normal',
   *   tags: [],
   *   headers: new Headers()
   * });
   *
   * if (receipt.successful) {
   *   console.log('Message sent successfully');
   * }
   * ```
   *
   * @param message The email message to send.
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns A promise that resolves to a receipt indicating success or
   *          failure.
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    options?.signal?.throwIfAborted();

    try {
      const mailData = await convertMessage(message, this.config);

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        mailData as unknown as Record<string, unknown>,
        options?.signal,
      );

      // SendGrid returns 202 for successful sends, but doesn't provide a message ID
      // in the response body. We'll generate a synthetic ID based on the response.
      const messageId = this.extractMessageId(response);

      return {
        successful: true,
        messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      return {
        successful: false,
        errorMessages: [errorMessage],
      };
    }
  }

  /**
   * Sends multiple email messages efficiently via SendGrid API.
   *
   * This method sends each message individually but provides a streamlined
   * interface for processing multiple messages. Each message is sent as a
   * separate API request to SendGrid.
   *
   * @example
   * ```typescript
   * const messages = [
   *   {
   *     sender: { address: 'from@example.com' },
   *     recipients: [{ address: 'user1@example.com' }],
   *     ccRecipients: [],
   *     bccRecipients: [],
   *     replyRecipients: [],
   *     subject: 'Message 1',
   *     content: { text: 'Hello User 1!' },
   *     attachments: [],
   *     priority: 'normal',
   *     tags: [],
   *     headers: new Headers()
   *   },
   *   {
   *     sender: { address: 'from@example.com' },
   *     recipients: [{ address: 'user2@example.com' }],
   *     ccRecipients: [],
   *     bccRecipients: [],
   *     replyRecipients: [],
   *     subject: 'Message 2',
   *     content: { text: 'Hello User 2!' },
   *     attachments: [],
   *     priority: 'normal',
   *     tags: [],
   *     headers: new Headers()
   *   }
   * ];
   *
   * for await (const receipt of transport.sendMany(messages)) {
   *   if (receipt.successful) {
   *     console.log('Sent:', receipt.messageId);
   *   } else {
   *     console.error('Failed:', receipt.errorMessages);
   *   }
   * }
   * ```
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns An async iterable of receipts, one for each message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    options?.signal?.throwIfAborted();

    const isAsyncIterable = Symbol.asyncIterator in messages;

    if (isAsyncIterable) {
      for await (const message of messages as AsyncIterable<Message>) {
        options?.signal?.throwIfAborted();
        yield await this.send(message, options);
      }
    } else {
      for (const message of messages as Iterable<Message>) {
        options?.signal?.throwIfAborted();
        yield await this.send(message, options);
      }
    }
  }

  /**
   * Extracts or generates a message ID from the SendGrid response.
   *
   * SendGrid doesn't return a message ID in the response body for successful sends,
   * so we generate a synthetic ID based on timestamp and some response data.
   *
   * @param response The SendGrid API response.
   * @returns A message ID string.
   */
  private extractMessageId(
    response: { statusCode?: number; headers?: Record<string, string> },
  ): string {
    // Check if there's an X-Message-Id header (SendGrid sometimes provides this)
    const messageIdHeader = response.headers?.["x-message-id"] ||
      response.headers?.["X-Message-Id"];

    if (messageIdHeader) {
      return messageIdHeader;
    }

    // Generate a synthetic message ID based on timestamp
    // This follows a similar pattern to what SendGrid might use
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    return `sendgrid-${timestamp}-${random}`;
  }
}
