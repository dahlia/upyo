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
        // deno-lint-ignore no-explicit-any
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text);
        }

        if (!response.ok) {
          throw new MailgunApiError(
            data.message ?? `HTTP ${response.status}`,
            response.status,
          );
        }

        return data as MailgunResponse;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

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
   * Makes a fetch request with Mailgun authentication.
   *
   * @param url The URL to make the request to.
   * @param options Fetch options.
   * @returns Promise that resolves to the fetch response.
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

    // Combine signals if provided
    let signal = controller.signal;
    if (options.signal) {
      signal = AbortSignal.any([controller.signal, options.signal]);
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
}

/**
 * Custom error class for Mailgun API errors.
 */
export class MailgunApiError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "MailgunApiError";
    this.statusCode = statusCode;
  }
}
