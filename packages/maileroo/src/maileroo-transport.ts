import {
  createFailedReceipt,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import type { MailerooConfig, ResolvedMailerooConfig } from "./config.ts";
import { createMailerooConfig } from "./config.ts";
import {
  MailerooApiError,
  MailerooHttpClient,
  type MailerooResponse,
  MailerooTimeoutError,
} from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";

/**
 * Maileroo transport implementation for sending emails via Maileroo API.
 *
 * @example
 * ```typescript
 * import { createMessage } from "@upyo/core";
 * import { MailerooTransport } from "@upyo/maileroo";
 *
 * const transport = new MailerooTransport({
 *   apiKey: "your-sending-key",
 * });
 *
 * const receipt = await transport.send(createMessage({
 *   from: "sender@example.com",
 *   to: "recipient@example.com",
 *   subject: "Hello from Maileroo",
 *   content: { text: "Hello!" },
 * }));
 * ```
 *
 * @since 0.6.0
 */
export class MailerooTransport implements Transport<"maileroo"> {
  readonly id = "maileroo";

  /**
   * The resolved Maileroo configuration used by this transport.
   */
  config: ResolvedMailerooConfig;

  private httpClient: MailerooHttpClient;

  /**
   * Creates a new Maileroo transport instance.
   *
   * @param config Maileroo configuration including API key and options.
   */
  constructor(config: MailerooConfig) {
    this.config = createMailerooConfig(config);
    this.httpClient = new MailerooHttpClient(this.config);
  }

  /**
   * Sends a single email message via Maileroo API.
   *
   * @param message The email message to send.
   * @param options Optional transport options including `AbortSignal`.
   * @returns A receipt indicating success or failure.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"maileroo">> {
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
      if (isCallerAbort(error, options?.signal)) throw error;
      return createMailerooFailure(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Sends multiple email messages sequentially via Maileroo API.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including `AbortSignal`.
   * @returns An async iterable of receipts, one for each message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"maileroo">> {
    options?.signal?.throwIfAborted();

    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      yield await this.send(message, options);
    }
  }
}

function responseToReceipt(response: MailerooResponse): Receipt<"maileroo"> {
  if (!response.success) {
    return createFailedReceipt(
      response.message ?? "Maileroo reported an unsuccessful response.",
      {
        provider: "maileroo",
        category: "rejected",
        code: "maileroo.unsuccessful",
        retryable: false,
        providerDetails: response,
      },
    );
  }

  const messageId = response.data?.reference_id;
  if (messageId == null || messageId === "") {
    return createFailedReceipt("Maileroo response is missing a reference ID.", {
      provider: "maileroo",
      category: "unknown",
      code: "maileroo.missing_reference_id",
      retryable: false,
      providerDetails: response,
    });
  }

  return {
    successful: true,
    messageId,
    provider: "maileroo",
  };
}

function createMailerooFailure(
  message: string,
  error: unknown,
): Receipt<"maileroo"> & { readonly successful: false } {
  if (error instanceof MailerooApiError) {
    return createFailedReceipt(message, {
      provider: "maileroo",
      statusCode: error.statusCode,
      retryAfterMilliseconds: error.retryAfterMilliseconds,
      attempts: error.attempts,
    });
  }

  if (error instanceof MailerooTimeoutError) {
    return createFailedReceipt(message, {
      provider: "maileroo",
      category: "timeout",
      code: "timeout",
      retryable: true,
      attempts: error.attempts,
    });
  }

  return createFailedReceipt(message, {
    provider: "maileroo",
    attempts: getErrorAttempts(error),
  });
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
