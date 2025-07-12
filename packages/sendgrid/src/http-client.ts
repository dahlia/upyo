import type { ResolvedSendGridConfig } from "./config.ts";

/**
 * Response from SendGrid API for sending messages.
 */
export interface SendGridResponse {
  /**
   * HTTP status code returned by SendGrid.
   */
  readonly statusCode?: number;

  /**
   * Response body from SendGrid (usually empty on success).
   */
  readonly body?: string;

  /**
   * Response headers from SendGrid.
   */
  readonly headers?: Record<string, string>;
}

/**
 * Error response from SendGrid API.
 */
export interface SendGridError {
  /**
   * Error message from SendGrid.
   */
  readonly message: string;

  /**
   * HTTP status code.
   */
  readonly statusCode?: number;

  /**
   * Additional error details.
   */
  readonly errors?: {
    readonly message: string;
    readonly field?: string;
    readonly help?: string;
  }[];
}

/**
 * HTTP client wrapper for SendGrid API requests.
 *
 * This class handles authentication, request formatting, error handling,
 * and retry logic for SendGrid API calls.
 */
export class SendGridHttpClient {
  config: ResolvedSendGridConfig;

  constructor(config: ResolvedSendGridConfig) {
    this.config = config;
  }

  /**
   * Sends a message via SendGrid API.
   *
   * @param messageData The JSON data to send to SendGrid.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to the SendGrid response.
   */
  sendMessage(
    messageData: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<SendGridResponse> {
    const url = `${this.config.baseUrl}/mail/send`;

    return this.makeRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageData),
      signal,
    });
  }

  /**
   * Makes an HTTP request to SendGrid API with retry logic.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the parsed response.
   */
  async makeRequest(
    url: string,
    options: RequestInit,
  ): Promise<SendGridResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.fetchWithAuth(url, options);

        // Get response text
        const text = await response.text();

        // SendGrid returns 202 for successful sends
        if (response.status === 202) {
          return {
            statusCode: response.status,
            body: text,
            headers: this.headersToRecord(response.headers),
          };
        }

        // Handle errors
        let errorData: SendGridError;
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { message: text || `HTTP ${response.status}` };
        }

        throw new SendGridApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData.errors,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or if it's the last attempt
        if (
          error instanceof SendGridApiError &&
          error.statusCode &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        if (attempt === this.config.retries) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  /**
   * Makes a fetch request with SendGrid authentication.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the fetch response.
   */
  async fetchWithAuth(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(options.headers);

    // Add authentication header
    headers.set("Authorization", `Bearer ${this.config.apiKey}`);

    // Add custom headers from config
    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Combine signals if provided
    let signal = controller.signal;
    if (options.signal) {
      // Use the external signal if provided, timeout will still work
      signal = options.signal;
      // If the external signal is already aborted, abort our controller too
      if (options.signal.aborted) {
        controller.abort();
      } else {
        // Listen for abort on the external signal
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      return await globalThis.fetch(url, {
        ...options,
        headers,
        signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Converts Headers object to a plain Record.
   *
   * @param headers The Headers object to convert.
   * @returns A plain object with header key-value pairs.
   */
  headersToRecord(headers: Headers): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      record[key] = value;
    }
    return record;
  }
}

/**
 * Custom error class for SendGrid API errors.
 */
export class SendGridApiError extends Error {
  readonly statusCode?: number;
  readonly errors?: {
    readonly message: string;
    readonly field?: string;
    readonly help?: string;
  }[];

  constructor(
    message: string,
    statusCode?: number,
    errors?: Array<{
      message: string;
      field?: string;
      help?: string;
    }>,
  ) {
    super(message);
    this.name = "SendGridApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
