import type { ResolvedMailtrapConfig } from "./config.ts";
import type { MailtrapEmail } from "./message-converter.ts";

/**
 * Response from Mailtrap API for sending a single message.
 *
 * @since 0.5.0
 */
export interface MailtrapSendResponse {
  readonly success?: boolean;
  readonly message_ids?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Response for an individual message in a Mailtrap batch send.
 *
 * @since 0.5.0
 */
export interface MailtrapBatchItemResponse {
  readonly success?: boolean;
  readonly message_ids?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * Response from Mailtrap API for sending batch messages.
 *
 * @since 0.5.0
 */
export interface MailtrapBatchResponse {
  readonly success?: boolean;
  readonly responses?: readonly MailtrapBatchItemResponse[];
  readonly errors?: readonly string[];
}

/**
 * Error response from Mailtrap API.
 *
 * @since 0.5.0
 */
export interface MailtrapError {
  readonly message?: string;
  readonly errors?: readonly string[];
}

/**
 * Mailtrap API error class for API-specific failures.
 *
 * @since 0.5.0
 */
export class MailtrapApiError extends Error {
  readonly statusCode: number;

  /**
   * Creates a Mailtrap API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code.
   */
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "MailtrapApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Mailtrap request timeout error.
 *
 * @since 0.5.0
 */
export class MailtrapTimeoutError extends Error {
  readonly timeout: number;

  /**
   * Creates a Mailtrap request timeout error.
   *
   * @param timeout Request timeout in milliseconds.
   */
  constructor(timeout: number) {
    super(`Mailtrap API request timed out after ${timeout} ms.`);
    this.name = "MailtrapTimeoutError";
    this.timeout = timeout;
  }
}

/**
 * HTTP client wrapper for Mailtrap API requests.
 *
 * @since 0.5.0
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

  private async makeRequest<T extends MailtrapSendResponse | MailtrapBatchResponse>(
    url: string,
    body: MailtrapEmail | { readonly requests: readonly MailtrapEmail[] },
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      try {
        const response = await this.fetchWithAuth(url, body, signal);
        const text = await response.text();

        if (!response.ok) {
          throw new MailtrapApiError(
            parseErrorMessage(text, response.status),
            response.status,
          );
        }

        try {
          return JSON.parse(text) as T;
        } catch (error) {
          throw new SyntaxError(
            `Invalid JSON response from Mailtrap API: ${
              error instanceof Error ? error.message : String(error)
            }.`,
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
          throw lastError;
        }

        await sleep(calculateRetryDelay(attempt), signal);
      }
    }

    throw lastError ?? new Error("Request failed after all retry attempts.");
  }

  private async fetchWithAuth(
    url: string,
    body: MailtrapEmail | { readonly requests: readonly MailtrapEmail[] },
    signal?: AbortSignal,
  ): Promise<Response> {
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
      return await globalThis.fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: requestSignal.signal,
      });
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

function calculateRetryDelay(attempt: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
  return Math.round(baseDelay / 2 + Math.random() * (baseDelay / 2));
}

function parseErrorMessage(text: string, statusCode: number): string {
  try {
    const errorBody = JSON.parse(text) as MailtrapError;
    if (typeof errorBody.message === "string" && errorBody.message !== "") {
      return errorBody.message;
    }
    if (Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
      return errorBody.errors.join("; ");
    }
  } catch {
    // Ignore if JSON parsing fails, as the body may be non-JSON.
  }

  return text || `HTTP ${statusCode}`;
}

interface CombinedSignal {
  readonly signal: AbortSignal;
  cleanup(): void;
}

function combineSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal,
): CombinedSignal {
  if (externalSignal == null) {
    return { signal: timeoutSignal, cleanup: () => {} };
  }

  if (typeof AbortSignal.any === "function") {
    return {
      signal: AbortSignal.any([timeoutSignal, externalSignal]),
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  timeoutSignal.addEventListener("abort", abort, { once: true });
  externalSignal.addEventListener("abort", abort, { once: true });

  if (timeoutSignal.aborted || externalSignal.aborted) {
    controller.abort();
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      timeoutSignal.removeEventListener("abort", abort);
      externalSignal.removeEventListener("abort", abort);
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
