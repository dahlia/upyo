import { parseRetryAfter } from "@upyo/core";
import type { ResolvedMailgunConfig } from "./config.ts";

/**
 * Response from Mailgun API for sending messages.
 */
export interface MailgunResponse {
  /**
   * The message ID returned by Mailgun.
   */
  id: string;

  /**
   * Success message from Mailgun.
   */
  message: string;
}

/**
 * Error response from Mailgun API.
 */
export interface MailgunError {
  /**
   * Error message from Mailgun.
   */
  message: string;

  /**
   * HTTP status code.
   */
  statusCode?: number;
}

/**
 * HTTP client wrapper for Mailgun API requests.
 *
 * This class handles authentication, request formatting, error handling,
 * and retry logic for Mailgun API calls.
 */
export class MailgunHttpClient {
  private config: ResolvedMailgunConfig;

  constructor(config: ResolvedMailgunConfig) {
    this.config = config;
  }

  /**
   * Sends a message via Mailgun API.
   *
   * @param formData The form data to send to Mailgun.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to the Mailgun response.
   */
  sendMessage(
    formData: FormData,
    signal?: AbortSignal,
  ): Promise<MailgunResponse> {
    const url = `${this.config.baseUrl}/${this.config.domain}/messages`;

    return this.makeRequest(url, {
      method: "POST",
      body: formData,
      signal,
    });
  }

  /**
   * Makes an HTTP request to Mailgun API with retry logic.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the parsed response.
   * @throws {MailgunApiError} If Mailgun returns an error response or all
   *                           retry attempts are exhausted.
   */
  private async makeRequest(
    url: string,
    options: RequestInit,
  ): Promise<MailgunResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.fetchWithAuth(url, options);
        const text = await response.text();

        if (!response.ok) {
          let errorMessage: string | undefined;
          try {
            // Try to parse the error message from the JSON body
            errorMessage = JSON.parse(text)?.message;
          } catch {
            // Ignore if JSON parsing fails, as the body may be non-JSON
          }

          // Fallback logic for creating a meaningful error message.
          // 1. Use the parsed `errorMessage` if available.
          // 2. Otherwise, use the raw `text` response.
          // 3. If the raw `text` is also empty, fall back to the HTTP status.
          // Using `||` is intentional here to treat empty strings as falsy
          // and ensure a non-empty error message for the tests.
          throw new MailgunApiError(
            errorMessage || truncateErrorBody(text) ||
              `HTTP ${response.status}`,
            response.status,
            parseRetryAfter(response.headers.get("Retry-After")),
            attempt + 1,
          );
        }

        try {
          return JSON.parse(text) as MailgunResponse;
        } catch (jsonError) {
          // This handles cases where the request was successful (e.g., 2xx status)
          // but the response body is not valid JSON.
          throw new Error(
            `Successfully received response but failed to parse JSON: ${
              (jsonError as Error).message
            }`,
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry caller cancellation.
        if (isAbortError(error)) {
          throw error;
        }

        // Don't retry on client errors (4xx) or if it's the last attempt
        if (
          error instanceof MailgunApiError &&
          error.statusCode &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        if (attempt === this.config.retries) {
          if (lastError instanceof MailgunApiError) {
            throw lastError;
          }
          throw new MailgunApiError(
            lastError.message,
            undefined,
            undefined,
            attempt + 1,
          );
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay, options.signal);
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  /**
   * Makes a fetch request with Mailgun authentication.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the fetch response.
   * @throws {Error} If the configured request timeout is reached.
   * @throws {DOMException} If the caller aborts the request.
   */
  private async fetchWithAuth(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(options.headers);

    // Add authentication header
    const auth = btoa(`api:${this.config.apiKey}`);
    headers.set("Authorization", `Basic ${auth}`);

    // Add custom headers from config
    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const combinedSignal = combineSignals(controller.signal, options.signal);

    try {
      return await globalThis.fetch(url, {
        ...options,
        headers,
        signal: combinedSignal.signal,
      });
    } catch (error) {
      if (
        isAbortError(error) &&
        controller.signal.aborted &&
        !options.signal?.aborted
      ) {
        throw new Error(
          `Mailgun API request timed out after ${this.config.timeout} ms.`,
        );
      }
      throw error;
    } finally {
      combinedSignal.cleanup();
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Error thrown when a Mailgun API request fails.
 *
 * @since 0.5.0
 */
export class MailgunApiError extends Error {
  /**
   * HTTP status code returned by Mailgun, if the request reached the API.
   */
  public statusCode?: number;

  /**
   * Retry delay from Mailgun's `Retry-After` response header.
   */
  public retryAfterMilliseconds?: number;

  /**
   * Number of attempts made before this error was produced.
   */
  public attempts?: number;

  /**
   * Creates a Mailgun API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code returned by Mailgun.
   * @param retryAfterMilliseconds Retry delay from the response.
   * @param attempts Number of attempts made before this error.
   */
  constructor(
    message: string,
    statusCode?: number,
    retryAfterMilliseconds?: number,
    attempts?: number,
  ) {
    super(message);
    this.name = "MailgunApiError";
    this.statusCode = statusCode;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
    this.attempts = attempts;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(
  milliseconds: number,
  signal?: AbortSignal | null,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal));
  }

  return new Promise((resolve, reject) => {
    function abort() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      reject(createAbortError(signal));
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function createAbortError(signal?: AbortSignal | null): unknown {
  return signal?.reason ??
    new DOMException("The operation was aborted.", "AbortError");
}

function combineSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal | null,
): { readonly signal: AbortSignal; cleanup(): void } {
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
  const cleanup = () => {
    timeoutSignal.removeEventListener("abort", abortFromTimeout);
    externalSignal.removeEventListener("abort", abortFromExternal);
  };
  const abortFromTimeout = () => {
    cleanup();
    controller.abort(timeoutSignal.reason);
  };
  const abortFromExternal = () => {
    cleanup();
    controller.abort(externalSignal.reason);
  };

  if (timeoutSignal.aborted) {
    controller.abort(timeoutSignal.reason);
  } else if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
  } else {
    timeoutSignal.addEventListener("abort", abortFromTimeout, { once: true });
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  return { signal: controller.signal, cleanup };
}

function truncateErrorBody(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
