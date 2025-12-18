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
 * Resend API error class for handling API-specific errors.
 */
export class ResendApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ResendApiError";
    this.statusCode = statusCode;
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

          // Fallback logic for creating a meaningful error message.
          // 1. Use the parsed `errorMessage` if available.
          // 2. Otherwise, use the raw `text` response.
          // 3. If the raw `text` is also empty, fall back to the HTTP status.
          // Using `||` is intentional here to treat empty strings as falsy
          // and ensure a non-empty error message for the tests.
          throw new ResendApiError(
            errorMessage || text || `HTTP ${response.status}`,
            response.status,
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
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or AbortError
        if (
          error instanceof ResendApiError && error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === this.config.retries) {
          throw lastError;
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

    // Combine signals if one is provided
    let signal: AbortSignal;
    if (options.signal) {
      const combinedController = new AbortController();
      const onAbort = () => combinedController.abort();

      options.signal.addEventListener("abort", onAbort, { once: true });
      controller.signal.addEventListener("abort", onAbort, { once: true });

      signal = combinedController.signal;
    } else {
      signal = controller.signal;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
