import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { MailtrapConfig, ResolvedMailtrapConfig } from "./config.ts";
import { createMailtrapConfig } from "./config.ts";
import {
  type MailtrapBatchItemResponse,
  MailtrapHttpClient,
  type MailtrapSendResponse,
} from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";

const MAX_BATCH_SIZE = 500;

/**
 * Mailtrap transport implementation for sending emails via Mailtrap API.
 *
 * @example
 * ```typescript
 * import { createMessage } from "@upyo/core";
 * import { MailtrapTransport } from "@upyo/mailtrap";
 *
 * const transport = new MailtrapTransport({
 *   apiToken: "your-api-token",
 *   sandbox: true,
 *   inboxId: 12345,
 * });
 *
 * const receipt = await transport.send(createMessage({
 *   from: "sender@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello from Mailtrap",
 *   content: { text: "Hello!" },
 * }));
 * ```
 *
 * @since 0.5.0
 */
export class MailtrapTransport implements Transport {
  /**
   * The resolved Mailtrap configuration used by this transport.
   */
  config: ResolvedMailtrapConfig;

  private httpClient: MailtrapHttpClient;

  /**
   * Creates a new Mailtrap transport instance.
   *
   * @param config Mailtrap configuration including API token and options.
   */
  constructor(config: MailtrapConfig) {
    this.config = createMailtrapConfig(config);
    this.httpClient = new MailtrapHttpClient(this.config);
  }

  /**
   * Sends a single email message via Mailtrap API.
   *
   * @param message The email message to send.
   * @param options Optional transport options including `AbortSignal`.
   * @returns A receipt indicating success or failure.
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    try {
      options?.signal?.throwIfAborted();

      const emailData = await convertMessage(message, this.config);

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        emailData,
        options?.signal,
      );

      return responseToReceipt(response);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return {
        successful: false,
        errorMessages: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Sends multiple email messages via Mailtrap batch API.
   *
   * Messages are chunked into Mailtrap's maximum batch size of 500 messages.
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

    const batchData = [];
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

    try {
      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendBatch(
        batchData,
        options?.signal,
      );

      if (response.success === false) {
        const errorMessage = formatErrors(response.errors) ??
          "Mailtrap batch request failed.";
        for (const receipt of receipts) {
          if (receipt !== undefined) {
            yield receipt;
            continue;
          }
          yield {
            successful: false,
            errorMessages: [errorMessage],
          };
        }
        return;
      }

      const itemResponses = response.responses ?? [];
      let responseIndex = 0;

      for (const receipt of receipts) {
        if (receipt !== undefined) {
          yield receipt;
          continue;
        }

        const item = itemResponses[responseIndex++];
        yield itemResponseToReceipt(item);
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      for (const receipt of receipts) {
        if (receipt !== undefined) {
          yield receipt;
          continue;
        }
        yield {
          successful: false,
          errorMessages: [errorMessage],
        };
      }
    }
  }
}

function responseToReceipt(response: MailtrapSendResponse): Receipt {
  if (response.success === false) {
    return {
      successful: false,
      errorMessages: [
        formatErrors(response.errors) ?? "Mailtrap reported send failure.",
      ],
    };
  }

  const messageId = response.message_ids?.[0];
  if (messageId == null || messageId === "") {
    return {
      successful: false,
      errorMessages: ["Mailtrap response is missing a message ID."],
    };
  }

  return {
    successful: true,
    messageId,
  };
}

function itemResponseToReceipt(
  response: MailtrapBatchItemResponse | undefined,
): Receipt {
  if (response?.success === false) {
    return {
      successful: false,
      errorMessages: [
        formatErrors(response.errors) ?? "Mailtrap reported batch item failure.",
      ],
    };
  }

  const messageId = response?.message_ids?.[0];
  if (messageId == null || messageId === "") {
    return {
      successful: false,
      errorMessages: ["Mailtrap batch response is missing a message ID."],
    };
  }

  return {
    successful: true,
    messageId,
  };
}

function formatErrors(errors: readonly string[] | undefined): string | undefined {
  if (errors == null || errors.length === 0) return undefined;
  return errors.join("; ");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
