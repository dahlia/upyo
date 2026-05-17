import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { LettermintConfig, ResolvedLettermintConfig } from "./config.ts";
import { createLettermintConfig } from "./config.ts";
import {
  LettermintHttpClient,
  type LettermintResponse,
  type LettermintStatus,
} from "./http-client.ts";
import {
  convertMessage,
  generateIdempotencyKey,
  type LettermintEmail,
} from "./message-converter.ts";

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
      const idempotencyKey = normalizeIdempotencyKey(message.idempotencyKey);

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        emailData,
        options?.signal,
        idempotencyKey,
      );

      return responseToReceipt(response);
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
      const idempotencyKey = normalizeIdempotencyKey(
        messages[0]?.idempotencyKey,
      );
      const batchData: LettermintEmail[] = [];
      const receipts: (Receipt | undefined)[] = [];

      for (const message of messages) {
        try {
          batchData.push(await convertMessage(message, this.config));
          receipts.push(undefined);
        } catch (error) {
          receipts.push({
            successful: false,
            errorMessages: [
              error instanceof Error ? error.message : String(error),
            ],
          });
        }
      }

      if (batchData.length === 0) {
        for (const receipt of receipts) {
          if (receipt !== undefined) yield receipt;
        }
        return;
      }

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendBatch(
        batchData,
        options?.signal,
        idempotencyKey,
      );

      let responseIndex = 0;
      for (let index = 0; index < receipts.length; index++) {
        const receipt = receipts[index];
        if (receipt !== undefined) {
          yield receipt;
          continue;
        }

        const result = response[responseIndex++];
        yield responseToReceipt(result);
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

function normalizeIdempotencyKey(idempotencyKey: string | undefined): string {
  return idempotencyKey != null && idempotencyKey !== ""
    ? idempotencyKey
    : generateIdempotencyKey();
}

function responseToReceipt(response: LettermintResponse | undefined): Receipt {
  if (response?.message_id == null || response.message_id === "") {
    return {
      successful: false,
      errorMessages: ["Lettermint response is missing a message ID."],
    };
  }

  if (isSuccessfulStatus(response.status)) {
    return {
      successful: true,
      messageId: response.message_id,
    };
  }

  return {
    successful: false,
    errorMessages: [
      `Lettermint reported message status "${response.status}".`,
    ],
  };
}

function isSuccessfulStatus(status: LettermintStatus): boolean {
  switch (status) {
    case "pending":
    case "queued":
    case "processed":
    case "delivered":
    case "opened":
    case "clicked":
      return true;
    case "suppressed":
    case "soft_bounced":
    case "hard_bounced":
    case "spam_complaint":
    case "failed":
    case "blocked":
    case "policy_rejected":
    case "unsubscribed":
      return false;
  }
}
