import {
  createFailedReceipt,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import type { MailtrapConfig, ResolvedMailtrapConfig } from "./config.ts";
import { createMailtrapConfig } from "./config.ts";
import {
  MailtrapApiError,
  type MailtrapBatchItemResponse,
  MailtrapHttpClient,
  type MailtrapSendResponse,
  MailtrapTimeoutError,
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
 * @since 0.6.0
 */
export class MailtrapTransport implements Transport<"mailtrap"> {
  readonly id = "mailtrap";

  /**
   * The resolved Mailtrap configuration used by this transport.
   */
  readonly config: ResolvedMailtrapConfig;

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
   * @throws {Error} If the caller aborts the operation.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"mailtrap">> {
    try {
      options?.signal?.throwIfAborted();

      const emailData = await convertMessage(
        message,
        this.config,
        options?.signal,
      );

      options?.signal?.throwIfAborted();

      const response = await this.httpClient.sendMessage(
        emailData,
        options?.signal,
      );

      return responseToReceipt(response);
    } catch (error) {
      if (isCallerAbort(error, options?.signal)) throw error;
      return createMailtrapFailure(
        error instanceof Error ? error.message : String(error),
        error,
      );
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
  ): AsyncIterable<Receipt<"mailtrap">> {
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
  ): AsyncIterable<Receipt<"mailtrap">> {
    if (messages.length === 0) return;

    const batchData = [];
    const receipts: (Receipt<"mailtrap"> | undefined)[] = [];

    for (const message of messages) {
      try {
        batchData.push(
          await convertMessage(
            message,
            this.config,
            options?.signal,
          ),
        );
        receipts.push(undefined);
      } catch (error) {
        if (isCallerAbort(error, options?.signal)) throw error;
        receipts.push(createMailtrapFailure(
          error instanceof Error ? error.message : String(error),
          error,
        ));
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
          yield createFailedReceipt(errorMessage, {
            provider: "mailtrap",
            category: "rejected",
            code: "mailtrap.batch_failed",
            retryable: false,
            providerDetails: response,
          });
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
      if (isCallerAbort(error, options?.signal)) throw error;
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      for (const receipt of receipts) {
        if (receipt !== undefined) {
          yield receipt;
          continue;
        }
        yield createMailtrapFailure(errorMessage, error);
      }
    }
  }
}

function responseToReceipt(
  response: MailtrapSendResponse,
): Receipt<"mailtrap"> {
  return toReceipt(response, {
    unsuccessfulMessage: "Mailtrap reported send failure.",
    unsuccessfulCode: "mailtrap.unsuccessful",
    missingMessageIdMessage: "Mailtrap response is missing a message ID.",
  });
}

function itemResponseToReceipt(
  response: MailtrapBatchItemResponse | undefined,
): Receipt<"mailtrap"> {
  return toReceipt(response, {
    unsuccessfulMessage: "Mailtrap reported batch item failure.",
    unsuccessfulCode: "mailtrap.batch_item_failed",
    missingMessageIdMessage: "Mailtrap batch response is missing a message ID.",
  });
}

function toReceipt(
  response: MailtrapSendResponse | MailtrapBatchItemResponse | undefined,
  options: {
    readonly unsuccessfulMessage: string;
    readonly unsuccessfulCode: string;
    readonly missingMessageIdMessage: string;
  },
): Receipt<"mailtrap"> {
  if (response?.success === false) {
    return createFailedReceipt(
      formatErrors(response.errors) ?? options.unsuccessfulMessage,
      {
        provider: "mailtrap",
        category: "rejected",
        code: options.unsuccessfulCode,
        retryable: false,
        providerDetails: response,
      },
    );
  }

  const messageId = response?.message_ids?.[0];
  if (messageId == null || messageId === "") {
    return createFailedReceipt(options.missingMessageIdMessage, {
      provider: "mailtrap",
      category: "unknown",
      code: "mailtrap.missing_message_id",
      retryable: false,
      providerDetails: response,
    });
  }

  return {
    successful: true,
    messageId,
    provider: "mailtrap",
  };
}

function createMailtrapFailure(
  message: string,
  error: unknown,
): Receipt<"mailtrap"> & { readonly successful: false } {
  if (error instanceof MailtrapApiError) {
    return createFailedReceipt(message, {
      provider: "mailtrap",
      statusCode: error.statusCode,
      retryAfterMilliseconds: error.retryAfterMilliseconds,
      attempts: error.attempts,
    });
  }

  if (error instanceof MailtrapTimeoutError) {
    return createFailedReceipt(message, {
      provider: "mailtrap",
      category: "timeout",
      code: "timeout",
      retryable: true,
      attempts: error.attempts,
    });
  }

  return createFailedReceipt(message, {
    provider: "mailtrap",
    attempts: getErrorAttempts(error),
  });
}

function formatErrors(
  errors: readonly string[] | undefined,
): string | undefined {
  if (errors == null || errors.length === 0) return undefined;
  return errors.join("; ");
}

function getErrorAttempts(error: unknown): number | undefined {
  if (typeof error !== "object" || error == null || !("attempts" in error)) {
    return undefined;
  }
  const attempts = (error as { readonly attempts?: unknown }).attempts;
  return typeof attempts === "number" ? attempts : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isCallerAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true &&
    (isAbortError(error) || error === signal.reason);
}
