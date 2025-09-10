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
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or AbortError
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw error;
          }

          if (error.message.includes("status: 4")) {
            throw this.createPlunkError(error.message, 400);
          }
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
    throw this.createPlunkError(errorMessage);
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

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(emailData),
      signal,
      // Add timeout if supported by the runtime
      ...(this.config.timeout > 0 &&
          typeof globalThis.AbortSignal?.timeout === "function"
        ? {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(this.config.timeout),
          ].filter(Boolean) as AbortSignal[]),
        }
        : {}),
    });

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "Failed to read error response";
      }

      throw new Error(
        `HTTP ${response.status}: ${response.statusText}. ${errorBody}`,
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
   * Creates a PlunkError from an error message and optional status code.
   *
   * @param message - The error message
   * @param statusCode - Optional HTTP status code
   * @returns PlunkError instance
   */
  private createPlunkError(
    message: string,
    statusCode?: number,
  ): PlunkError {
    return {
      message,
      statusCode,
    };
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
