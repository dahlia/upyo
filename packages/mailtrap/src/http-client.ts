import { combineSignals } from "@upyo/core";
import type { ResolvedMailtrapConfig } from "./config.ts";
import type { MailtrapEmail } from "./message-converter.ts";

const maxErrorMessageLength = 500;
const sandboxRateLimitWindowMilliseconds = 10_000;
const sandboxRateLimitMessage = "too many emails per second";

/**
 * Response from Mailtrap API for sending a single message.
 *
 * @since 0.6.0
 */
export interface MailtrapSendResponse {
  readonly success?: boolean;
  readonly message_ids?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Response for an individual message in a Mailtrap batch send.
 *
 * @since 0.6.0
 */
export interface MailtrapBatchItemResponse {
  readonly success?: boolean;
  readonly message_ids?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Response from Mailtrap API for sending batch messages.
 *
 * @since 0.6.0
 */
export interface MailtrapBatchResponse {
  readonly success?: boolean;
  readonly responses?: readonly MailtrapBatchItemResponse[];
  readonly errors?: readonly string[];
}

/**
 * Error response from Mailtrap API.
 *
 * @since 0.6.0
 */
export interface MailtrapError {
  readonly message?: string;
  readonly errors?: readonly string[];
}

interface MailtrapHttpResponse {
  readonly response: Response;
  readonly text: string;
}

/**
 * Mailtrap API error class for API-specific failures.
 *
 * @since 0.6.0
 */
export class MailtrapApiError extends Error {
  readonly statusCode: number;
  readonly retryAfterMilliseconds?: number;
  readonly attempts?: number;

  /**
   * Creates a Mailtrap API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code.
   * @param retryAfterMilliseconds Retry delay from the response or Mailtrap's
   * known sandbox rate-limit window.
   * @param attempts Number of attempts made before this error.
   */
  constructor(
    message: string,
    statusCode: number,
    retryAfterMilliseconds?: number,
    attempts?: number,
  ) {
    super(message);
    this.name = "MailtrapApiError";
    this.statusCode = statusCode;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
    this.attempts = attempts;
  }
}

/**
 * Mailtrap request timeout error.
 *
 * @since 0.6.0
 */
export class MailtrapTimeoutError extends Error {
  /**
   * Request timeout in milliseconds.
   *
   * @since 0.6.0
   */
  readonly timeout: number;

  /**
   * Number of attempts made before this error was produced.
   *
   * @since 0.6.0
   */
  readonly attempts?: number;

  /**
   * Creates a Mailtrap request timeout error.
   *
   * @param timeout Request timeout in milliseconds.
   * @param attempts Number of attempts made before this error.
   */
  constructor(timeout: number, attempts?: number) {
    super(`Mailtrap API request timed out after ${timeout} ms.`);
    this.name = "MailtrapTimeoutError";
    this.timeout = timeout;
    this.attempts = attempts;
  }
}

/**
 * HTTP client wrapper for Mailtrap API requests.
 *
 * @since 0.6.0
 */
export class MailtrapHttpClient {
  private config: ResolvedMailtrapConfig;

  /**
   * Creates a new Mailtrap HTTP client.
   *
   * @param config Resolved Mailtrap configuration.
   */
  constructor(config: ResolvedMailtrapConfig) {
    this.config = config;
  }

  /**
   * Sends a single message via Mailtrap API.
   *
   * @param messageData The JSON data to send to Mailtrap.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to the Mailtrap response.
   */
  sendMessage(
    messageData: MailtrapEmail,
    signal?: AbortSignal,
  ): Promise<MailtrapSendResponse> {
    const url = this.resolveUrl("send");
    return this.makeRequest(url, messageData, signal);
  }

  /**
   * Sends multiple messages via Mailtrap batch API.
   *
   * @param requests The messages to send to Mailtrap.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to the Mailtrap batch response.
   */
  sendBatch(
    requests: readonly MailtrapEmail[],
    signal?: AbortSignal,
  ): Promise<MailtrapBatchResponse> {
    const url = this.resolveUrl("batch");
    return this.makeRequest(url, { requests }, signal);
  }

  private resolveUrl(kind: "send" | "batch"): string {
    const baseUrl = this.config.sandbox
      ? this.config.sandboxBaseUrl
      : this.config.sendBaseUrl;
    const suffix = this.config.sandbox && this.config.inboxId != null
      ? `/${this.config.inboxId}`
      : "";
    return `${baseUrl}/api/${kind}${suffix}`;
  }

  private async makeRequest<
    T extends MailtrapSendResponse | MailtrapBatchResponse,
  >(
    url: string,
    body: MailtrapEmail | { readonly requests: readonly MailtrapEmail[] },
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      let responseText: string;
      try {
        const { response, text } = await this.fetchWithAuth(url, body, signal);
        responseText = text;

        if (!response.ok) {
          const message = parseErrorMessage(responseText, response.status);
          throw new MailtrapApiError(
            message,
            response.status,
            parseRetryAfter(response.headers.get("Retry-After")) ??
              inferSandboxRetryAfter(
                message,
                response.status,
                this.config.sandbox,
              ),
            attempt + 1,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof MailtrapApiError && !isRetryable(error)) {
          throw error;
        }

        if (
          error instanceof Error &&
          error.name === "AbortError" &&
          signal?.aborted
        ) {
          throw error;
        }

        if (attempt === this.config.retries) {
          throw withAttempts(lastError, attempt + 1);
        }

        await sleep(
          calculateRetryDelay(attempt, lastError),
          signal,
        );
        continue;
      }

      try {
        return JSON.parse(responseText) as T;
      } catch (error) {
        throw new SyntaxError(
          `Invalid JSON response from Mailtrap API: ${
            error instanceof Error ? error.message : String(error)
          }.`,
        );
      }
    }

    throw lastError ?? new Error("Request failed after all retry attempts.");
  }

  private async fetchWithAuth(
    url: string,
    body: MailtrapEmail | { readonly requests: readonly MailtrapEmail[] },
    signal?: AbortSignal,
  ): Promise<MailtrapHttpResponse> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Api-Token": this.config.apiToken,
      "User-Agent": this.config.userAgent,
    });

    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    const timeoutController = new AbortController();
    const timeoutId = this.config.timeout > 0
      ? setTimeout(() => timeoutController.abort(), this.config.timeout)
      : undefined;
    const requestSignal = combineSignals(timeoutController.signal, signal);

    try {
      const response = await globalThis.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: requestSignal.signal,
      });
      const text = await response.text();
      return { response, text };
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError" &&
        timeoutController.signal.aborted &&
        !signal?.aborted
      ) {
        throw new MailtrapTimeoutError(this.config.timeout);
      }
      throw error;
    } finally {
      requestSignal.cleanup();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

function isRetryable(error: MailtrapApiError): boolean {
  return error.statusCode === 408 || error.statusCode === 429 ||
    error.statusCode >= 500;
}

function calculateRetryDelay(attempt: number, error: Error): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
  const backoffDelay = Math.round(
    baseDelay / 2 + Math.random() * (baseDelay / 2),
  );
  if (error instanceof MailtrapApiError) {
    return Math.max(backoffDelay, error.retryAfterMilliseconds ?? 0);
  }
  return backoffDelay;
}

function withAttempts(error: Error, attempts: number): Error {
  if (error instanceof MailtrapTimeoutError) {
    return new MailtrapTimeoutError(error.timeout, attempts);
  }
  if (error instanceof MailtrapApiError) {
    return new MailtrapApiError(
      error.message,
      error.statusCode,
      error.retryAfterMilliseconds,
      attempts,
    );
  }
  return Object.assign(error, { attempts });
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header == null || header === "") return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) return undefined;
  return Math.max(0, asDate - Date.now());
}

function inferSandboxRetryAfter(
  message: string,
  statusCode: number,
  sandbox: boolean,
): number | undefined {
  if (
    sandbox && statusCode === 429 &&
    message.toLowerCase().includes(sandboxRateLimitMessage)
  ) {
    return sandboxRateLimitWindowMilliseconds;
  }
  return undefined;
}

function parseErrorMessage(text: string, statusCode: number): string {
  try {
    const errorBody = JSON.parse(text) as MailtrapError;
    if (typeof errorBody.message === "string" && errorBody.message !== "") {
      return truncateErrorMessage(errorBody.message);
    }
    if (Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
      return truncateErrorMessage(errorBody.errors.join("; "));
    }
  } catch {
    // Ignore if JSON parsing fails, as the body may be non-JSON.
  }

  return truncateErrorMessage(text) || `HTTP ${statusCode}`;
}

function truncateErrorMessage(message: string): string {
  return message.length > maxErrorMessageLength
    ? `${message.slice(0, maxErrorMessageLength)}...`
    : message;
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ??
    new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const timeoutState: { id?: ReturnType<typeof setTimeout> } = {};
    const onAbort = () => {
      if (timeoutState.id !== undefined) {
        clearTimeout(timeoutState.id);
      }
      signal?.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    if (signal?.aborted) {
      onAbort();
      return;
    }

    timeoutState.id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });
}
