import type { ResolvedLettermintConfig } from "./config.ts";
import type { LettermintEmail } from "./message-converter.ts";

/**
 * Lettermint message status values.
 *
 * @since 0.5.0
 */
export type LettermintStatus =
  | "pending"
  | "queued"
  | "suppressed"
  | "processed"
  | "delivered"
  | "opened"
  | "clicked"
  | "soft_bounced"
  | "hard_bounced"
  | "spam_complaint"
  | "failed"
  | "blocked"
  | "policy_rejected"
  | "unsubscribed";

/**
 * Response from Lettermint API for sending a single message.
 *
 * @since 0.5.0
 */
export interface LettermintResponse {
  /** The message ID returned by Lettermint. */
  readonly message_id: string;
  /** Current message status. */
  readonly status: LettermintStatus;
}

/**
 * Response from Lettermint API for sending batch messages.
 *
 * @since 0.5.0
 */
export type LettermintBatchResponse = readonly LettermintResponse[];

/**
 * Error response from Lettermint API.
 *
 * @since 0.5.0
 */
export interface LettermintError {
  /** Error message from Lettermint. */
  readonly message?: string;
  /** Error detail from Lettermint. */
  readonly error?: string;
  /** Validation errors from Lettermint. */
  readonly errors?: readonly unknown[];
}

/**
 * Lettermint API error class for API-specific failures.
 *
 * @since 0.5.0
 */
export class LettermintApiError extends Error {
  readonly statusCode: number;

  /**
   * Creates a Lettermint API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code.
   */
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LettermintApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Lettermint request timeout error.
 *
 * @since 0.5.0
 */
export class LettermintTimeoutError extends Error {
  readonly timeout: number;

  /**
   * Creates a Lettermint request timeout error.
   *
   * @param timeout Request timeout in milliseconds.
   */
  constructor(timeout: number) {
    super(`Lettermint API request timed out after ${timeout} ms.`);
    this.name = "LettermintTimeoutError";
    this.timeout = timeout;
  }
}

/**
 * HTTP client wrapper for Lettermint API requests.
 *
 * @since 0.5.0
 */
export class LettermintHttpClient {
  private config: ResolvedLettermintConfig;

  /**
   * Creates a new Lettermint HTTP client.
   *
   * @param config Resolved Lettermint configuration.
   */
  constructor(config: ResolvedLettermintConfig) {
    this.config = config;
  }

  /**
   * Sends a single message via Lettermint API.
   *
   * @param messageData The JSON data to send to Lettermint.
   * @param signal Optional AbortSignal for cancellation.
   * @param idempotencyKey Optional idempotency key for request deduplication.
   * @returns Promise that resolves to the Lettermint response.
   */
  sendMessage(
    messageData: LettermintEmail,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<LettermintResponse> {
    const url = `${this.config.baseUrl}/v1/send`;
    return this.makeRequest(url, messageData, signal, idempotencyKey);
  }

  /**
   * Sends multiple messages via Lettermint batch API.
   *
   * @param messagesData The messages to send to Lettermint.
   * @param signal Optional AbortSignal for cancellation.
   * @param idempotencyKey Optional idempotency key for request deduplication.
   * @returns Promise that resolves to the Lettermint batch response.
   */
  sendBatch(
    messagesData: readonly LettermintEmail[],
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<LettermintBatchResponse> {
    const url = `${this.config.baseUrl}/v1/send/batch`;
    return this.makeRequest(url, messagesData, signal, idempotencyKey);
  }

  private async makeRequest<
    T extends LettermintResponse | LettermintBatchResponse,
  >(
    url: string,
    body: LettermintEmail | readonly LettermintEmail[],
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      try {
        const response = await this.fetchWithAuth(
          url,
          body,
          signal,
          idempotencyKey,
        );
        const text = await response.text();

        if (!response.ok) {
          throw new LettermintApiError(
            parseErrorMessage(text, response.status),
            response.status,
          );
        }

        try {
          return JSON.parse(text) as T;
        } catch (error) {
          throw new SyntaxError(
            `Invalid JSON response from Lettermint API: ${
              error instanceof Error ? error.message : String(error)
            }.`,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          error instanceof LettermintApiError &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
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
          throw lastError;
        }

        await sleep(Math.min(1000 * Math.pow(2, attempt), 10000), signal);
      }
    }

    throw lastError ?? new Error("Request failed after all retry attempts.");
  }

  private async fetchWithAuth(
    url: string,
    body: LettermintEmail | readonly LettermintEmail[],
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "x-lettermint-token": this.config.apiToken,
    });

    if (idempotencyKey) {
      headers.set("Idempotency-Key", idempotencyKey);
    }

    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    const timeoutController = new AbortController();
    const timeoutId = this.config.timeout > 0
      ? setTimeout(() => timeoutController.abort(), this.config.timeout)
      : undefined;
    const requestSignal = combineSignals(timeoutController.signal, signal);

    try {
      return await globalThis.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError" &&
        timeoutController.signal.aborted &&
        !signal?.aborted
      ) {
        throw new LettermintTimeoutError(this.config.timeout);
      }
      throw error;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}

function parseErrorMessage(text: string, statusCode: number): string {
  try {
    const errorBody = JSON.parse(text) as LettermintError;
    if (typeof errorBody.message === "string" && errorBody.message !== "") {
      return errorBody.message;
    }
    if (typeof errorBody.error === "string" && errorBody.error !== "") {
      return errorBody.error;
    }
    if (Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
      return JSON.stringify(errorBody.errors);
    }
  } catch {
    // Ignore if JSON parsing fails, as the body may be non-JSON.
  }

  return text || `HTTP ${statusCode}`;
}

function combineSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal,
): AbortSignal {
  if (externalSignal == null) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  timeoutSignal.addEventListener("abort", abort, { once: true });
  externalSignal.addEventListener("abort", abort, { once: true });

  if (timeoutSignal.aborted || externalSignal.aborted) {
    controller.abort();
  }

  return controller.signal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
