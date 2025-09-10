import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { PlunkConfig, ResolvedPlunkConfig } from "./config.ts";
import { createPlunkConfig } from "./config.ts";
import { PlunkHttpClient } from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";

/**
 * Plunk transport implementation for sending emails via Plunk API.
 *
 * This transport provides efficient email delivery using Plunk's HTTP API,
 * with support for both cloud-hosted and self-hosted instances, authentication,
 * retry logic, and batch sending capabilities.
 *
 * @example
 * ```typescript
 * import { PlunkTransport } from '@upyo/plunk';
 *
 * const transport = new PlunkTransport({
 *   apiKey: 'your-plunk-api-key',
 *   baseUrl: 'https://api.useplunk.com', // or self-hosted URL
 *   timeout: 30000,
 *   retries: 3
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
export class PlunkTransport implements Transport {
  /**
   * The resolved Plunk configuration used by this transport.
   */
  config: ResolvedPlunkConfig;

  private httpClient: PlunkHttpClient;

  /**
   * Creates a new Plunk transport instance.
   *
   * @param config Plunk configuration including API key and options.
   */
  constructor(config: PlunkConfig) {
    this.config = createPlunkConfig(config);
    this.httpClient = new PlunkHttpClient(this.config);
  }

  /**
   * Sends a single email message via Plunk API.
   *
   * This method converts the message to Plunk format, makes an HTTP request
   * to the Plunk API, and returns a receipt with the result.
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
    try {
      options?.signal?.throwIfAborted();

      const emailData = await convertMessage(message, this.config);

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        emailData as unknown as Record<string, unknown>,
        options?.signal,
      );

      // Extract message ID from response
      const messageId = this.extractMessageId(response, message);

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
   * Sends multiple email messages efficiently via Plunk API.
   *
   * This method sends each message individually but provides a streamlined
   * interface for processing multiple messages. Each message is sent as a
   * separate API request to Plunk.
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
   * Extracts or generates a message ID from the Plunk response.
   *
   * Plunk returns email details in the response, so we can use the contact ID
   * and timestamp to create a meaningful message ID.
   *
   * @param response The Plunk API response.
   * @param message The original message for fallback ID generation.
   * @returns A message ID string.
   */
  private extractMessageId(
    response: {
      emails?: readonly { contact?: { id?: string } }[];
      timestamp?: string;
    },
    message: Message,
  ): string {
    // Try to use contact ID from response if available
    if (response.emails && response.emails.length > 0) {
      const contactId = response.emails[0].contact?.id;
      const timestamp = response.timestamp;

      if (contactId && timestamp) {
        return `plunk-${contactId}-${new Date(timestamp).getTime()}`;
      }
    }

    // Fallback: generate synthetic message ID
    const timestamp = Date.now();
    const recipientHash = message.recipients[0]?.address
      .split("@")[0]
      .substring(0, 8) ?? "unknown";
    const random = Math.random().toString(36).substring(2, 8);

    return `plunk-${timestamp}-${recipientHash}-${random}`;
  }
}
