import {
  classifyReceiptError,
  createFailedReceipt,
  type Message,
  type Receipt,
  type ReceiptErrorClassification,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import type {
  CloudflareEmailBinding,
  CloudflareEmailSendResult,
} from "./binding.ts";
import {
  buildBindingMessage,
  convertBindingAttachments,
} from "./binding-converter.ts";
import { type PreparedMessage, prepareMessage } from "./message-preparation.ts";
import {
  type CloudflareFailure,
  createValidationFailure,
  isCallerAbort,
} from "./receipts.ts";
import { backoffMilliseconds, sleep } from "./retry.ts";

/**
 * Configuration for {@link CloudflareWorkerTransport}.
 *
 * @since 0.7.0
 */
export interface CloudflareWorkerConfig {
  /**
   * The Workers `send_email` binding to send through, such as `env.EMAIL`.
   */
  readonly binding: CloudflareEmailBinding;

  /**
   * Number of retry attempts when the binding reports a rate limit
   * (`E_RATE_LIMIT_EXCEEDED`) or a server error (`E_INTERNAL_SERVER_ERROR`).
   * The binding gives no retry delay, so the transport waits 1 second,
   * doubling after each attempt, at most 10 seconds.  Cloudflare offers no
   * idempotency key, so a server error may hide a message that was already
   * accepted: set this to `0` if a duplicate message is worse than a failed
   * send.
   *
   * @default 3
   */
  readonly retries?: number;
}

/**
 * {@link CloudflareWorkerConfig} with all optional fields filled with default
 * values.
 *
 * @since 0.7.0
 */
export type ResolvedCloudflareWorkerConfig = Required<CloudflareWorkerConfig>;

/**
 * A receipt from {@link CloudflareWorkerTransport}.
 *
 * @since 0.7.0
 */
export type CloudflareWorkerReceipt = Receipt<"cloudflare">;

/**
 * Cloudflare Email Service transport for code running on Cloudflare Workers,
 * sending through a `send_email` binding.  It needs no API token; the binding
 * carries the permission.  Outside Workers, use `CloudflareTransport`, which
 * sends through the REST API.
 *
 * It retries rate limits and server errors, as `CloudflareTransport` does;
 * see {@link CloudflareWorkerConfig.retries}.
 *
 * @example
 * ```typescript
 * import { CloudflareWorkerTransport } from "@upyo/cloudflare";
 *
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const transport = new CloudflareWorkerTransport({ binding: env.EMAIL });
 *     const receipt = await transport.send(message);
 *     return new Response(receipt.successful ? "Sent" : "Failed");
 *   },
 * };
 * ```
 * @since 0.7.0
 */
export class CloudflareWorkerTransport implements Transport<"cloudflare"> {
  readonly id = "cloudflare";

  /**
   * The resolved configuration used by this transport.
   */
  readonly config: ResolvedCloudflareWorkerConfig;

  /**
   * Creates a transport that sends through a Workers `send_email` binding.
   *
   * @param config The binding to send through, and how often to retry.
   * @throws {TypeError} If `config.binding` has no `send()` method.
   */
  constructor(config: CloudflareWorkerConfig) {
    if (typeof config?.binding?.send !== "function") {
      throw new TypeError(
        "A Cloudflare send_email binding, such as env.EMAIL, is required.",
      );
    }
    this.config = { binding: config.binding, retries: config.retries ?? 3 };
  }

  /**
   * Sends a single email message through the binding.
   *
   * Cancellation is best effort: the binding takes no signal, so aborting
   * while it is sending stops this method from waiting, but the message may
   * still go out.
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
  ): Promise<CloudflareWorkerReceipt> {
    const signal = options?.signal;
    let attempts = 0;
    try {
      signal?.throwIfAborted();

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

      const attachments = await convertBindingAttachments(
        prepared.attachments,
        signal,
      );
      signal?.throwIfAborted();

      const built = buildBindingMessage(message, prepared);
      const sendable =
        attachments.length > 0 ? { ...built, attachments } : built;
      while (true) {
        attempts++;
        try {
          const result = await raceAbort(
            this.config.binding.send(sendable),
            signal,
          );
          return resultToReceipt(result, attempts);
        } catch (error) {
          if (
            isCallerAbort(error, signal) ||
            attempts > this.config.retries ||
            !RETRIED_ERRORS.has(getErrorCode(error) ?? "")
          ) {
            throw error;
          }
        }
        await sleep(backoffMilliseconds(attempts), signal);
      }
    } catch (error) {
      if (isCallerAbort(error, signal)) throw error;
      return createBindingFailure(error, attempts);
    }
  }

  /**
   * Sends multiple email messages through the binding, one at a time, in
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
  ): AsyncIterable<CloudflareWorkerReceipt> {
    options?.signal?.throwIfAborted();
    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      yield await this.send(message, options);
    }
  }
}

/**
 * How the binding's documented error codes are classified, following
 * https://developers.cloudflare.com/email-service/api/send-emails/workers-api/.
 * Codes not listed here are classified by their message.
 */
const BINDING_ERRORS: ReadonlyMap<
  string,
  Omit<ReceiptErrorClassification, "code">
> = new Map([
  ["E_RATE_LIMIT_EXCEEDED", { category: "rate-limit", retryable: true }],
  ["E_DAILY_LIMIT_EXCEEDED", { category: "rate-limit", retryable: false }],
  ["E_INTERNAL_SERVER_ERROR", { category: "server-error", retryable: true }],
  ["E_DELIVERY_FAILED", { category: "unknown", retryable: true }],
  ["E_SENDER_NOT_VERIFIED", { category: "configuration", retryable: false }],
  [
    "E_SENDER_DOMAIN_NOT_AVAILABLE",
    { category: "configuration", retryable: false },
  ],
  ["E_RECIPIENT_NOT_ALLOWED", { category: "configuration", retryable: false }],
  ["E_RECIPIENT_SUPPRESSED", { category: "rejected", retryable: false }],
  ["E_VALIDATION_ERROR", { category: "validation", retryable: false }],
  ["E_FIELD_MISSING", { category: "validation", retryable: false }],
  ["E_TOO_MANY_RECIPIENTS", { category: "validation", retryable: false }],
  ["E_TOO_MANY_ATTACHMENTS", { category: "validation", retryable: false }],
  ["E_ACCOUNT_SUSPENDED", { category: "configuration", retryable: false }],
  ["E_CONTENT_TOO_LARGE", { category: "validation", retryable: false }],
  ["E_HEADER_NOT_ALLOWED", { category: "validation", retryable: false }],
  ["E_HEADER_USE_API_FIELD", { category: "validation", retryable: false }],
  ["E_HEADER_VALUE_INVALID", { category: "validation", retryable: false }],
  ["E_HEADER_VALUE_TOO_LONG", { category: "validation", retryable: false }],
  ["E_HEADER_NAME_INVALID", { category: "validation", retryable: false }],
  ["E_HEADERS_TOO_LARGE", { category: "validation", retryable: false }],
  ["E_HEADERS_TOO_MANY", { category: "validation", retryable: false }],
]);

/**
 * The binding errors that the transport retries on its own.
 */
const RETRIED_ERRORS: ReadonlySet<string> = new Set([
  "E_RATE_LIMIT_EXCEEDED",
  "E_INTERNAL_SERVER_ERROR",
]);

/**
 * Turns the binding's result into a receipt.  A result without a message ID
 * is a failure that is not retryable, since the message may have been sent.
 */
function resultToReceipt(
  result: CloudflareEmailSendResult | undefined,
  attempts: number,
): CloudflareWorkerReceipt {
  if (result == null || !result.messageId) {
    return createFailedReceipt<"cloudflare">(
      "Cloudflare email binding returned no message ID.",
      {
        provider: "cloudflare",
        category: "unknown",
        code: "cloudflare.missing_message_id",
        retryable: false,
        attempts,
      },
    );
  }
  return {
    successful: true,
    messageId: result.messageId,
    provider: "cloudflare",
  };
}

/**
 * Turns a thrown error into a failed receipt.  `attempts` is 0 when the
 * error came before the binding was called, such as a failed attachment read.
 */
function createBindingFailure(
  error: unknown,
  attempts: number,
): CloudflareFailure {
  const message = error instanceof Error ? error.message : String(error);
  const code = getErrorCode(error);
  const attemptsOption = attempts > 0 ? { attempts } : {};
  if (code == null) {
    return createFailedReceipt<"cloudflare">(message, {
      provider: "cloudflare",
      ...attemptsOption,
    });
  }
  const classification =
    BINDING_ERRORS.get(code) ?? classifyReceiptError(error);
  return createFailedReceipt<"cloudflare">(message, {
    provider: "cloudflare",
    code: `cloudflare.${code}`,
    category: classification.category,
    retryable: classification.retryable,
    providerDetails: { code, message },
    ...attemptsOption,
  });
}

/**
 * Reads the binding's `E_*` code from a thrown error, if it has one.
 */
function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error == null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" && error.code !== ""
    ? error.code
    : undefined;
}

/**
 * Waits for a promise unless the signal aborts first.  The binding cannot be
 * cancelled, so once the caller stops waiting, the promise's own outcome is
 * ignored rather than left to surface as an unhandled rejection.
 */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal == null) return promise;
  promise.catch(() => {});
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
