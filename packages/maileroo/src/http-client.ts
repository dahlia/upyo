import { combineSignals, parseRetryAfter } from "@upyo/core";
import type { ResolvedMailerooConfig } from "./config.ts";
import type { MailerooEmail } from "./message-converter.ts";

const maxErrorMessageLength = 500;

/**
 * Response from Maileroo API for sending a single message.
 *
 * @since 0.6.0
 */
export interface MailerooResponse {
  /** Whether Maileroo accepted the request. */
  readonly success: boolean;
  /** Human-readable response message. */
  readonly message?: string;
  /** Response payload from Maileroo. */
  readonly data?: {
    /** Maileroo reference ID for tracking the message. */
    readonly reference_id?: string;
  };
}

/**
 * Error response from Maileroo API.
 *
 * @since 0.6.0
 */
export interface MailerooError {
  /** Error message from Maileroo. */
  readonly message?: string;
  /** Error detail from Maileroo. */
  readonly error?: string;
  /** Validation errors from Maileroo. */
  readonly errors?: readonly unknown[];
}

interface MailerooHttpResult {
  readonly response: Response;
  readonly text: string;
}

/**
 * Maileroo API error class for API-specific failures.
 *
 * @since 0.6.0
 */
export class MailerooApiError extends Error {
  readonly statusCode: number;
  readonly retryAfterMilliseconds?: number;
  readonly attempts?: number;

  /**
   * Creates a Maileroo API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code.
   * @param retryAfterMilliseconds Retry delay from the response.
   * @param attempts Number of attempts made before this error.
   */
  constructor(
    message: string,
    statusCode: number,
    retryAfterMilliseconds?: number,
    attempts?: number,
  ) {
    super(message);
    this.name = "MailerooApiError";
    this.statusCode = statusCode;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
    this.attempts = attempts;
  }
}

/**
 * Maileroo request timeout error.
 *
 * @since 0.6.0
 */
export class MailerooTimeoutError extends Error {
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
   * Creates a Maileroo request timeout error.
   *
   * @param timeout Request timeout in milliseconds.
   * @param attempts Number of attempts made before this error.
   */
  constructor(timeout: number, attempts?: number) {
    super(`Maileroo API request timed out after ${timeout} ms.`);
    this.name = "MailerooTimeoutError";
    this.timeout = timeout;
    this.attempts = attempts;
  }
}

/**
 * HTTP client wrapper for Maileroo API requests.
 *
 * @since 0.6.0
 */
export class MailerooHttpClient {
  private config: ResolvedMailerooConfig;

  /**
   * Creates a new Maileroo HTTP client.
   *
   * @param config Resolved Maileroo configuration.
   */
  constructor(config: ResolvedMailerooConfig) {
    this.config = config;
  }

  /**
   * Sends a single message via Maileroo API.
   *
   * @param messageData The JSON data to send to Maileroo.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to the Maileroo response.
   * @throws {MailerooApiError} If Maileroo returns an API error.
   * @throws {MailerooTimeoutError} If the request timeout elapses.
   */
  sendMessage(
    messageData: MailerooEmail,
    signal?: AbortSignal,
  ): Promise<MailerooResponse> {
    const url = `${this.config.baseUrl}/emails`;
    return this.makeRequest(url, messageData, signal);
  }

  private async makeRequest(
    url: string,
    body: MailerooEmail,
    signal?: AbortSignal,
  ): Promise<MailerooResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      try {
        const { response, text } = await this.fetchWithAuth(url, body, signal);

        if (!response.ok) {
          throw new MailerooApiError(
            parseErrorMessage(text, response.status),
            response.status,
            parseRetryAfter(response.headers.get("Retry-After")),
            attempt + 1,
          );
        }

        try {
          return JSON.parse(text) as MailerooResponse;
        } catch (error) {
          throw new SyntaxError(
            `Invalid JSON response from Maileroo API: ${
              error instanceof Error ? error.message : String(error)
            }.`,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (signal?.aborted) {
          throw error;
        }

        if (error instanceof MailerooApiError && !isRetryable(error)) {
          throw error;
        }

        if (attempt === this.config.retries) {
          throw withAttempts(lastError, attempt + 1);
        }

        await sleep(calculateRetryDelay(attempt, lastError), signal);
      }
    }

    throw lastError ?? new Error("Request failed after all retry attempts.");
  }

  private async fetchWithAuth(
    url: string,
    body: MailerooEmail,
    signal?: AbortSignal,
  ): Promise<MailerooHttpResult> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
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
        throw new MailerooTimeoutError(this.config.timeout);
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

function withAttempts(error: Error, attempts: number): Error {
  if (error instanceof MailerooTimeoutError) {
    return new MailerooTimeoutError(error.timeout, attempts);
  }
  if (error instanceof MailerooApiError) {
    return error;
  }
  return Object.assign(error, { attempts });
}

function isRetryable(error: MailerooApiError): boolean {
  return error.statusCode === 408 || error.statusCode === 429 ||
    error.statusCode >= 500;
}

function calculateRetryDelay(attempt: number, error?: Error): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt), 10000);
  const backoffDelay = Math.round(
    baseDelay / 2 + Math.random() * (baseDelay / 2),
  );
  if (error instanceof MailerooApiError) {
    return Math.max(backoffDelay, error.retryAfterMilliseconds ?? 0);
  }
  return backoffDelay;
}

function parseErrorMessage(text: string, statusCode: number): string {
  try {
    const errorBody = JSON.parse(text) as MailerooError;
    if (typeof errorBody.message === "string" && errorBody.message !== "") {
      return truncateErrorMessage(errorBody.message);
    }
    if (typeof errorBody.error === "string" && errorBody.error !== "") {
      return truncateErrorMessage(errorBody.error);
    }
    if (Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
      return truncateErrorMessage(JSON.stringify(errorBody.errors));
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
