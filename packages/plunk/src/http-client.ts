import { parseRetryAfter } from "@upyo/core";
import type { ResolvedPlunkConfig } from "./config.ts";

/**
 * Response from Plunk API for sending messages.
 */
export interface PlunkResponse {
  /**
   * Indicates whether the API call was successful.
   */
  readonly success: boolean;

  /**
   * Array of sent email details.
   */
  readonly emails: readonly {
    readonly contact: {
      readonly id: string;
      readonly email: string;
    };
    readonly email: string;
  }[];

  /**
   * Timestamp of the send operation.
   */
  readonly timestamp: string;
}

/**
 * Error response from Plunk API.
 */
export interface PlunkError {
  /**
   * Error message from Plunk.
   */
  readonly message: string;

  /**
   * HTTP status code.
   */
  readonly statusCode?: number;

  /**
   * Additional error details from Plunk API.
   */
  readonly details?: unknown;
}

/**
 * Error thrown when a Plunk API request fails.
 *
 * @since 0.5.0
 */
export class PlunkApiError extends Error {
  /**
   * HTTP status code returned by Plunk, if the request reached the API.
   */
  readonly statusCode?: number;

  /**
   * Retry delay from Plunk's `Retry-After` response header.
   */
  readonly retryAfterMilliseconds?: number;

  /**
   * Number of attempts made before this error was produced.
   */
  readonly attempts?: number;

  /**
   * Creates a Plunk API error.
   *
   * @param message Error message.
   * @param statusCode HTTP status code returned by Plunk.
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
    this.name = "PlunkApiError";
    this.statusCode = statusCode;
    this.retryAfterMilliseconds = retryAfterMilliseconds;
    this.attempts = attempts;
  }
}

/**
 * HTTP client wrapper for Plunk API requests.
 *
 * This class handles authentication, request formatting, error handling,
 * and retry logic for the Plunk HTTP API.
 */
export class PlunkHttpClient {
  private config: ResolvedPlunkConfig;

  /**
   * Creates a new Plunk HTTP client instance.
   *
   * @param config - Resolved Plunk configuration
   */
  constructor(config: ResolvedPlunkConfig) {
    this.config = config;
  }

  /**
   * Sends a message via the Plunk API.
   *
   * This method makes a POST request to the `/v1/send` endpoint with proper
   * authentication, retry logic, and error handling.
   *
   * @param emailData - The email data in Plunk API format
   * @param signal - Optional AbortSignal for request cancellation
   * @returns Promise that resolves to Plunk API response
   * @throws PlunkError if the request fails after all retries
   */
  async sendMessage(
    emailData: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<PlunkResponse> {
    const url = `${this.config.baseUrl}/v1/send`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      try {
        const response = await this.makeRequest(url, emailData, signal);
        return await this.parseResponse(response);
      } catch (error) {
        if (isCallerAbort(error, signal)) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or AbortError
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        if (
          error instanceof PlunkApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw new PlunkApiError(
            error.message,
            error.statusCode,
            error.retryAfterMilliseconds,
            attempt + 1,
          );
        }

        // If this was the last attempt, throw the error
        if (attempt === this.config.retries) {
          break;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.sleep(delay);
      }
    }

    // All retries failed
    const errorMessage = lastError?.message ?? "Unknown error occurred";
    if (lastError instanceof PlunkApiError) {
      throw new PlunkApiError(
        lastError.message,
        lastError.statusCode,
        lastError.retryAfterMilliseconds,
        this.config.retries + 1,
      );
    }
    throw new PlunkApiError(
      errorMessage,
      undefined,
      undefined,
      this.config.retries + 1,
    );
  }

  /**
   * Makes an HTTP request to the Plunk API.
   *
   * @param url - The request URL
   * @param emailData - The email data to send
   * @param signal - Optional AbortSignal for cancellation
   * @returns Promise that resolves to the Response object
   */
  private async makeRequest(
    url: string,
    emailData: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      ...this.config.headers,
    };

    const timeoutController = new AbortController();
    const timeoutId = this.config.timeout > 0
      ? setTimeout(() => timeoutController.abort(), this.config.timeout)
      : undefined;
    const combinedSignal = combineSignals(timeoutController.signal, signal);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(emailData),
        signal: combinedSignal.signal,
      });
    } catch (error) {
      if (
        isAbortError(error) &&
        timeoutController.signal.aborted &&
        !signal?.aborted
      ) {
        throw new Error(
          `Plunk API request timed out after ${this.config.timeout} ms.`,
        );
      }
      throw error;
    } finally {
      combinedSignal.cleanup();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "Failed to read error response";
      }

      throw new PlunkApiError(
        `HTTP ${response.status}: ${response.statusText}. ${
          truncateErrorBody(errorBody)
        }`,
        response.status,
        parseRetryAfter(response.headers.get("Retry-After")),
      );
    }

    return response;
  }

  /**
   * Parses the response from the Plunk API.
   *
   * @param response - The Response object from fetch
   * @returns Promise that resolves to parsed PlunkResponse
   */
  private async parseResponse(response: Response): Promise<PlunkResponse> {
    try {
      const data = await response.json();

      // Validate response structure
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid response format: expected object");
      }

      if (typeof data.success !== "boolean") {
        throw new Error("Invalid response format: missing success field");
      }

      if (!data.success) {
        throw new Error(
          data.message ?? "Send operation failed without error details",
        );
      }

      return data as PlunkResponse;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Invalid JSON response from Plunk API");
      }
      throw error;
    }
  }

  /**
   * Sleeps for the specified number of milliseconds.
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

interface CombinedSignal {
  readonly signal: AbortSignal;
  cleanup(): void;
}

function combineSignals(
  timeoutSignal: AbortSignal,
  externalSignal?: AbortSignal | null,
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
  const abort = (signal: AbortSignal) => {
    controller.abort(getAbortReason(signal));
  };
  const abortTimeout = () => abort(timeoutSignal);
  const abortExternal = () => abort(externalSignal);

  timeoutSignal.addEventListener("abort", abortTimeout, { once: true });
  externalSignal.addEventListener("abort", abortExternal, { once: true });

  if (timeoutSignal.aborted) {
    abortTimeout();
  } else if (externalSignal.aborted) {
    abortExternal();
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      timeoutSignal.removeEventListener("abort", abortTimeout);
      externalSignal.removeEventListener("abort", abortExternal);
    },
  };
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException("The operation was aborted.", "AbortError");
}

function truncateErrorBody(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
