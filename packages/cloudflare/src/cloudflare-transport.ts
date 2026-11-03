import {
  createFailedReceipt,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import type { CloudflareConfig, ResolvedCloudflareConfig } from "./config.ts";
import { createCloudflareConfig } from "./config.ts";
import {
  CloudflareApiError,
  CloudflareHttpClient,
  type CloudflareResponse,
} from "./http-client.ts";
import { buildEmail, convertAttachments } from "./message-converter.ts";
import { type PreparedMessage, prepareMessage } from "./message-preparation.ts";
import {
  type CloudflareFailure,
  createValidationFailure,
  isCallerAbort,
} from "./receipts.ts";

/**
 * A receipt from {@link CloudflareTransport}.
 *
 * @since 0.7.0
 */
export type CloudflareReceipt = Receipt<"cloudflare">;

/**
 * Cloudflare Email Service transport implementation for sending emails via
 * the Cloudflare Email Sending REST API.
 *
 * The sender's domain must be onboarded to Cloudflare Email Sending before
 * messages can be delivered.
 *
 * @example
 * ```typescript
 * import { CloudflareTransport } from "@upyo/cloudflare";
 *
 * const transport = new CloudflareTransport({
 *   accountId: "your-account-id",
 *   apiToken: "your-api-token",
 * });
 *
 * const receipt = await transport.send(message);
 * if (receipt.successful) {
 *   console.log("Message sent with ID:", receipt.messageId);
 * } else {
 *   console.error("Send failed:", receipt.errorMessages.join(", "));
 * }
 * ```
 * @since 0.7.0
 */
export class CloudflareTransport implements Transport<"cloudflare"> {
  readonly id = "cloudflare";

  /**
   * The resolved Cloudflare configuration used by this transport.
   */
  readonly config: ResolvedCloudflareConfig;

  private httpClient: CloudflareHttpClient;

  /**
   * Creates a new Cloudflare transport instance.
   *
   * @param config Cloudflare configuration including account ID and API token.
   * @throws {TypeError} If the account ID or the API token is empty.
   */
  constructor(config: CloudflareConfig) {
    this.config = createCloudflareConfig(config);
    this.httpClient = new CloudflareHttpClient(this.config);
  }

  /**
   * Sends a single email message via the Cloudflare Email Sending API.
   *
   * @param message The email message to send.
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns A promise that resolves to a receipt indicating success or
   *          failure.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<CloudflareReceipt> {
    try {
      options?.signal?.throwIfAborted();

      // Checking the message reads no attachment content, so whatever it
      // throws is about the message itself, and sending it again cannot help.
      let prepared: PreparedMessage;
      try {
        prepared = prepareMessage(message);
      } catch (error) {
        const failure = createValidationFailure(error);
        if (failure != null) return failure;
        throw error;
      }

      // Reading attachments can fail for transient reasons, such as a lazy
      // attachment whose fetch fails; those go through the generic path below.
      const attachments = await convertAttachments(
        prepared.attachments,
        options?.signal,
      );

      options?.signal?.throwIfAborted();

      const email = buildEmail(message, prepared);
      const response = await this.httpClient.sendMessage(
        attachments.length > 0 ? { ...email, attachments } : email,
        options?.signal,
      );
      return responseToReceipt(response);
    } catch (error) {
      if (isCallerAbort(error, options?.signal)) throw error;

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createCloudflareFailure(errorMessage, error);
    }
  }

  /**
   * Sends multiple email messages via the Cloudflare Email Sending API.
   *
   * The API has no batch endpoint, so messages are sent one at a time, in
   * order.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns An async iterable of receipts, one for each message.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<CloudflareReceipt> {
    options?.signal?.throwIfAborted();
    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      yield await this.send(message, options);
    }
  }
}

/**
 * Turns Cloudflare's reply into a receipt.  A reply that reached no recipient,
 * or that lacks a message ID, is a failure even though the request succeeded.
 */
function responseToReceipt(response: CloudflareResponse): CloudflareReceipt {
  const result = response.result;
  const accepted =
    (result?.delivered?.length ?? 0) + (result?.queued?.length ?? 0);
  const bounced = result?.permanent_bounces ?? [];
  const suppressed = result?.suppressed_recipients ?? [];
  if (accepted === 0 && bounced.length + suppressed.length > 0) {
    const reasons = [
      ...(bounced.length > 0
        ? [`permanently bounced: ${bounced.join(", ")}`]
        : []),
      ...(suppressed.length > 0
        ? [`suppressed: ${suppressed.join(", ")}`]
        : []),
    ];
    return createFailedReceipt<"cloudflare">(
      `No recipient accepted the message; ${reasons.join("; ")}`,
      {
        provider: "cloudflare",
        category: "rejected",
        code: "cloudflare.recipients_rejected",
        retryable: false,
      },
    );
  }

  const messageId = result?.message_id;
  if (messageId == null || messageId === "") {
    return createFailedReceipt<"cloudflare">(
      "Cloudflare API response is missing a message ID.",
      {
        provider: "cloudflare",
        category: "unknown",
        code: "cloudflare.missing_message_id",
        retryable: false,
      },
    );
  }

  return { successful: true, messageId, provider: "cloudflare" };
}

/**
 * Turns an error from sending into a failed receipt, carrying Cloudflare's
 * error code and details when Cloudflare answered.
 */
function createCloudflareFailure(
  message: string,
  error: unknown,
): CloudflareFailure {
  if (error instanceof CloudflareApiError) {
    const apiCode = error.errors?.find((e) => e.code != null)?.code;
    return createFailedReceipt<"cloudflare">(message, {
      provider: "cloudflare",
      ...(apiCode != null
        ? { code: `cloudflare.${apiCode}` }
        : error.statusCode != null
          ? { code: `cloudflare.${error.statusCode}` }
          : {}),
      ...(error.errors != null && { providerDetails: error.errors }),
      statusCode: error.statusCode,
      retryAfterMilliseconds: error.retryAfterMilliseconds,
      attempts: error.attempts,
    });
  }
  return createFailedReceipt<"cloudflare">(message, {
    provider: "cloudflare",
  });
}
