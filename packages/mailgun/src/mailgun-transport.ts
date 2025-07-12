import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { MailgunConfig, ResolvedMailgunConfig } from "./config.ts";
import { createMailgunConfig } from "./config.ts";
import { MailgunHttpClient } from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";

/**
 * Mailgun transport implementation for sending emails via Mailgun API.
 *
 * This transport provides efficient email delivery using Mailgun's HTTP API,
 * with support for authentication, retry logic, and batch sending capabilities.
 *
 * @example
 * ```typescript
 * import { MailgunTransport } from '@upyo/mailgun';
 *
 * const transport = new MailgunTransport({
 *   apiKey: 'your-api-key',
 *   domain: 'your-domain.com',
 *   region: 'us' // or 'eu'
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
export class MailgunTransport implements Transport {
  config: ResolvedMailgunConfig;
  httpClient: MailgunHttpClient;

  /**
   * Creates a new Mailgun transport instance.
   *
   * @param config Mailgun configuration including API key, domain, and options.
   */
  constructor(config: MailgunConfig) {
    this.config = createMailgunConfig(config);
    this.httpClient = new MailgunHttpClient(this.config);
  }

  /**
   * Sends a single email message via Mailgun API.
   *
   * This method converts the message to Mailgun format, makes an HTTP request
   * to the Mailgun API, and returns a receipt with the result.
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
   *   console.log('Message sent with ID:', receipt.messageId);
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
      const formData = await convertMessage(message, this.config);

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        formData,
        options?.signal,
      );

      return {
        successful: true,
        messageId: response.id,
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
   * Sends multiple email messages efficiently via Mailgun API.
   *
   * This method sends each message individually but provides a streamlined
   * interface for processing multiple messages. Each message is sent as a
   * separate API request to Mailgun.
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
}
