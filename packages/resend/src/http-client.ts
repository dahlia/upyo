import { combineSignals, parseRetryAfter } from "@upyo/core";
import type { ResolvedResendConfig } from "./config.ts";

/**
 * Response from Resend API for sending a single message.
 */
export interface ResendResponse {
  /**
   * The message ID returned by Resend.
   */
  id: string;
}

/**
 * Response from Resend API for sending batch messages.
 */
export interface ResendBatchResponse {
  /**
   * Array of message objects with IDs.
   */
  data: Array<{ id: string }>;
}

/**
 * Error response from Resend API.
 */
export interface ResendError {
  /**
   * Error message from Resend.
   */
  message: string;

  /**
   * Error name/type.
   */
  name?: string;
}

/**
 * Error thrown when a Resend API request fails.
 *
 * @since 0.5.0
 */
export class ResendApiError extends Error {
  /**
   * HTTP status code returned by Resend, if the request reached the API.
   */
  readonly statusCode?: number;

  /**
   * Retry delay from Resend's `Retry-After` response header.
   */
  readonly retryAfterMilliseconds?: number;

  /**
   * Number of attempts made before this error was produced.
   */
  readonly attempts?: number;

  /**
   * Creates a Resend API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code returned by Resend.
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
    this.name = "ResendApiError";
    this.statusCode = statusCode;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
    this.attempts = attempts;
  }
}

/**
 * HTTP client wrapper for Resend API requests.
 *
 * This class handles authentication, request formatting, error handling,
 * and retry logic for Resend API calls.
 */
export class ResendHttpClient {
  private config: ResolvedResendConfig;

  constructor(config: ResolvedResendConfig) {
    this.config = config;
  }

  /**
   * Sends a single message via Resend API.
   *
   * @param messageData The JSON data to send to Resend.
   * @param signal Optional AbortSignal for cancellation.
   * @param idempotencyKey Optional idempotency key for request deduplication.
   * @returns Promise that resolves to the Resend response.
   */
  sendMessage(
    messageData: Record<string, unknown>,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<ResendResponse> {
    const url = `${this.config.baseUrl}/emails`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return this.makeRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(messageData),
      signal,
    });
  }

  /**
   * Sends multiple messages via Resend batch API.
   *
   * @param messagesData Array of message data objects to send.
   * @param signal Optional AbortSignal for cancellation.
   * @param idempotencyKey Optional idempotency key for request deduplication.
   * @returns Promise that resolves to the Resend batch response.
   */
  sendBatch(
    messagesData: Array<Record<string, unknown>>,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ): Promise<ResendBatchResponse> {
    const url = `${this.config.baseUrl}/emails/batch`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return this.makeRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(messagesData),
      signal,
    });
  }

  /**
   * Makes an HTTP request to Resend API with retry logic.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the parsed response.
   */
  private async makeRequest<T = ResendResponse | ResendBatchResponse>(
    url: string,
    options: RequestInit,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.fetchWithAuth(url, options);
        const text = await response.text();

        if (!response.ok) {
          let errorMessage: string | undefined;
          try {
            const errorBody = JSON.parse(text) as ResendError;
            errorMessage = errorBody.message;
          } catch {
            // Ignore if JSON parsing fails, as the body may be non-JSON
          }

          const parsedErrorMessage = errorMessage === ""
            ? undefined
            : errorMessage;
          const responseMessage = truncateErrorBody(text);
          const fallbackMessage = responseMessage === ""
            ? undefined
            : responseMessage;

          throw new ResendApiError(
            parsedErrorMessage ?? fallbackMessage ??
              `HTTP ${response.status}`,
            response.status,
            parseRetryAfter(response.headers.get("Retry-After")),
            attempt + 1,
          );
        }

        try {
          return JSON.parse(text) as T;
        } catch (parseError) {
          throw new Error(
            `Invalid JSON response from Resend API: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          );
        }
      } catch (error) {
        if (isCallerAbort(error, options.signal)) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or AbortError
        if (
          error instanceof ResendApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === this.config.retries) {
          if (lastError instanceof ResendApiError) {
            throw lastError;
          }
          throw new ResendApiError(
            lastError.message,
            undefined,
            undefined,
            attempt + 1,
          );
        }

        // Wait before retrying with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new Error("Request failed after all retry attempts");
  }

  /**
   * Makes a fetch request with authentication headers.
   *
   * @param url The URL to fetch.
   * @param options Fetch options.
   * @returns Promise that resolves to the Response.
   */
  private async fetchWithAuth(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(options.headers);

    // Add authentication
    headers.set("Authorization", `Bearer ${this.config.apiKey}`);

    // Add custom headers from config
    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const combinedSignal = combineSignals(controller.signal, options.signal);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: combinedSignal.signal,
      });

      return response;
    } catch (error) {
      if (
        isAbortError(error) &&
        controller.signal.aborted &&
        !options.signal?.aborted
      ) {
        throw new Error(
          `Resend API request timed out after ${this.config.timeout} ms.`,
        );
      }
      throw error;
    } finally {
      combinedSignal.cleanup();
      clearTimeout(timeoutId);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isCallerAbort(
  error: unknown,
  signal?: AbortSignal | null,
): boolean {
  return signal?.aborted === true &&
    (isAbortError(error) || error === signal.reason);
}

function truncateErrorBody(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
