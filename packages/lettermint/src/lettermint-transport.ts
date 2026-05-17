import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { LettermintConfig, ResolvedLettermintConfig } from "./config.ts";
import { createLettermintConfig } from "./config.ts";
import { LettermintHttpClient } from "./http-client.ts";
import { convertMessage, generateIdempotencyKey } from "./message-converter.ts";

const MAX_BATCH_SIZE = 500;

/**
 * Lettermint transport implementation for sending emails via Lettermint API.
 *
 * @example
 * ```typescript
 * import { createMessage } from "@upyo/core";
 * import { LettermintTransport } from "@upyo/lettermint";
 *
 * const transport = new LettermintTransport({
 *   apiToken: "your-project-api-token",
 * });
 *
 * const receipt = await transport.send(createMessage({
 *   from: "sender@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello from Lettermint",
 *   content: { text: "Hello!" },
 * }));
 * ```
 *
 * @since 0.5.0
 */
export class LettermintTransport implements Transport {
  /**
   * The resolved Lettermint configuration used by this transport.
   */
  config: ResolvedLettermintConfig;

  private httpClient: LettermintHttpClient;

  /**
   * Creates a new Lettermint transport instance.
   *
   * @param config Lettermint configuration including API token and options.
   */
  constructor(config: LettermintConfig) {
    this.config = createLettermintConfig(config);
    this.httpClient = new LettermintHttpClient(this.config);
  }

  /**
   * Sends a single email message via Lettermint API.
   *
   * @param message The email message to send.
   * @param options Optional transport options including `AbortSignal`.
   * @returns A receipt indicating success or failure.
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    try {
      options?.signal?.throwIfAborted();

      const emailData = await convertMessage(message, this.config);
      const idempotencyKey = message.idempotencyKey ?? generateIdempotencyKey();

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        emailData,
        options?.signal,
        idempotencyKey,
      );

      return {
        successful: true,
        messageId: response.message_id,
      };
    } catch (error) {
      return {
        successful: false,
        errorMessages: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Sends multiple email messages via Lettermint batch API.
   *
   * Messages are chunked into Lettermint's maximum batch size of 500 messages.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including `AbortSignal`.
   * @returns An async iterable of receipts, one for each message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    options?.signal?.throwIfAborted();

    let chunk: Message[] = [];
    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      chunk.push(message);
      if (chunk.length === MAX_BATCH_SIZE) {
        yield* this.sendBatch(chunk, options);
        chunk = [];
      }
    }
    yield* this.sendBatch(chunk, options);
  }

  private async *sendBatch(
    messages: readonly Message[],
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    if (messages.length === 0) return;

    try {
      const idempotencyKey = messages[0]?.idempotencyKey ??
        generateIdempotencyKey();
      const batchData = await Promise.all(
        messages.map((message) => convertMessage(message, this.config)),
      );

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendBatch(
        batchData,
        options?.signal,
        idempotencyKey,
      );

      for (let index = 0; index < messages.length; index++) {
        const result = response[index];
        if (result?.message_id) {
          yield {
            successful: true,
            messageId: result.message_id,
          };
        } else {
          yield {
            successful: false,
            errorMessages: [
              "Lettermint batch response is missing a message ID.",
            ],
          };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      for (let i = 0; i < messages.length; i++) {
        yield {
          successful: false,
          errorMessages: [errorMessage],
        };
      }
    }
  }
}
