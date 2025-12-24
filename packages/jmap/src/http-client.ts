import type { ResolvedJmapConfig } from "./config.ts";
import { JmapApiError } from "./errors.ts";
import type { JmapSession } from "./session.ts";

/**
 * JMAP request structure (RFC 8620 Section 3.3).
 * @since 0.4.0
 */
export interface JmapRequest {
  readonly using: readonly string[];
  readonly methodCalls: readonly JmapMethodCall[];
}

/**
 * JMAP method call tuple.
 * @since 0.4.0
 */
export type JmapMethodCall = readonly [string, Record<string, unknown>, string];

/**
 * JMAP response structure (RFC 8620 Section 3.4).
 * @since 0.4.0
 */
export interface JmapResponse {
  readonly methodResponses: readonly [
    string,
    Record<string, unknown>,
    string,
  ][];
  readonly sessionState?: string;
}

/**
 * HTTP client for JMAP API requests.
 * @since 0.4.0
 */
export class JmapHttpClient {
  readonly config: ResolvedJmapConfig;

  constructor(config: ResolvedJmapConfig) {
    this.config = config;
  }

  /**
   * Fetches the JMAP session from the session URL.
   * @param signal Optional abort signal.
   * @returns The JMAP session response.
   * @since 0.4.0
   */
  async fetchSession(signal?: AbortSignal): Promise<JmapSession> {
    signal?.throwIfAborted();

    const response = await this.fetchWithAuth(
      this.config.sessionUrl,
      { method: "GET" },
      signal,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new JmapApiError(
        `Session fetch failed: ${response.status}`,
        response.status,
        text,
      );
    }

    return await response.json();
  }

  /**
   * Executes a JMAP API request.
   * @param apiUrl The JMAP API URL.
   * @param request The JMAP request payload.
   * @param signal Optional abort signal.
   * @returns The JMAP response.
   * @since 0.4.0
   */
  async executeRequest(
    apiUrl: string,
    request: JmapRequest,
    signal?: AbortSignal,
  ): Promise<JmapResponse> {
    signal?.throwIfAborted();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      signal?.throwIfAborted();

      try {
        const response = await this.fetchWithAuth(
          apiUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          },
          signal,
        );

        if (!response.ok) {
          const text = await response.text();
          const error = new JmapApiError(
            `JMAP request failed: ${response.status}`,
            response.status,
            text,
          );

          // Don't retry on 4xx errors (client errors)
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }

          throw error;
        }

        return await response.json();
      } catch (error) {
        // Don't retry if aborted
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        // Don't retry on 4xx errors
        if (error instanceof JmapApiError && error.statusCode !== undefined) {
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.retries) {
          throw error;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  /**
   * Makes an authenticated fetch request.
   * @param url The URL to fetch.
   * @param options Fetch options.
   * @param signal Optional abort signal.
   * @returns The fetch response.
   * @since 0.4.0
   */
  private async fetchWithAuth(
    url: string,
    options: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.config.bearerToken}`);

    // Add custom headers from config
    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }

    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Combine with external signal if provided
    let combinedSignal = controller.signal;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        signal.throwIfAborted();
      }
      signal.addEventListener("abort", () => controller.abort());
      combinedSignal = controller.signal;
    }

    try {
      return await globalThis.fetch(url, {
        ...options,
        headers,
        signal: combinedSignal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
