import { combineSignals, parseRetryAfter } from "@upyo/core";
import type { ResolvedCloudflareConfig } from "./config.ts";
import type { CloudflareEmail } from "./message-converter.ts";
import { backoffMilliseconds, sleep } from "./retry.ts";

/**
 * The parsed reply of the Cloudflare Email Sending API, on success and on
 * failure.
 *
 * @since 0.7.0
 */
export interface CloudflareResponse {
  /**
   * Whether Cloudflare reported the request as successful.
   */
  readonly success: boolean;

  /**
   * Errors reported by Cloudflare.
   */
  readonly errors?: readonly CloudflareError[];

  /**
   * The delivery result.
   */
  readonly result?: {
    /**
     * The identifier of the sent message.
     */
    readonly message_id?: string;

    /**
     * Recipients to whom the message was delivered immediately.
     */
    readonly delivered?: readonly string[];

    /**
     * Recipients whose delivery has been queued.
     */
    readonly queued?: readonly string[];

    /**
     * Recipients that permanently bounced.
     */
    readonly permanent_bounces?: readonly string[];

    /**
     * Recipients dropped because they are on the suppression list.
     */
    readonly suppressed_recipients?: readonly string[];
  } | null;
}

/**
 * An error entry in a Cloudflare API response.
 *
 * @since 0.7.0
 */
export interface CloudflareError {
  /**
   * Numeric Cloudflare error code.
   */
  readonly code?: number;

  /**
   * Error message from Cloudflare.
   */
  readonly message: string;
}

/**
 * Options for creating a {@link CloudflareApiError}.
 *
 * @since 0.7.0
 */
export interface CloudflareApiErrorOptions {
  /**
   * HTTP status code returned by Cloudflare, if the request reached the API.
   */
  readonly statusCode?: number;

  /**
   * Retry delay from Cloudflare's `Retry-After` response header.
   */
  readonly retryAfterMilliseconds?: number;

  /**
   * Number of attempts made before this error was produced.
   */
  readonly attempts?: number;

  /**
   * Cloudflare's parsed reply, if it answered with JSON.
   */
  readonly response?: CloudflareResponse;
}

/**
 * Error thrown when a Cloudflare API request fails.
 *
 * @since 0.7.0
 */
export class CloudflareApiError extends Error {
  /**
   * HTTP status code returned by Cloudflare, if the request reached the API.
   */
  readonly statusCode?: number;

  /**
   * Retry delay from Cloudflare's `Retry-After` response header.
   */
  readonly retryAfterMilliseconds?: number;

  /**
   * Number of attempts made before this error was produced.
   */
  readonly attempts?: number;

  /**
   * Cloudflare's parsed reply, if it answered with JSON.
   */
  readonly response?: CloudflareResponse;

  /**
   * Creates a Cloudflare API error.
   *
   * @param message Error message.
   * @param options Details of the failed request.
   */
  constructor(message: string, options: CloudflareApiErrorOptions = {}) {
    super(message);
    this.name = "CloudflareApiError";
    this.statusCode = options.statusCode;
    this.retryAfterMilliseconds = options.retryAfterMilliseconds;
    this.attempts = options.attempts;
    this.response = options.response;
  }

  /**
   * Errors listed in Cloudflare's reply, if any.  Each has Cloudflare's
   * numeric error code.
   */
  get errors(): readonly CloudflareError[] | undefined {
    const errors = this.response?.errors;
    return errors != null && errors.length > 0 ? errors : undefined;
  }
}

/**
 * HTTP client wrapper for Cloudflare Email Sending API requests.
 */
export class CloudflareHttpClient {
  private config: ResolvedCloudflareConfig;

  constructor(config: ResolvedCloudflareConfig) {
    this.config = config;
  }

  /**
   * Sends a single message via the Cloudflare Email Sending API.
   *
   * @param email The request body.
   * @param signal Optional AbortSignal for cancellation.
   * @returns Promise that resolves to Cloudflare's parsed reply.
   * @throws {CloudflareApiError} If Cloudflare rejects the request, answers
   *         with something other than a successful JSON reply, or does not
   *         answer within the timeout.
   */
  async sendMessage(
    email: CloudflareEmail,
    signal?: AbortSignal,
  ): Promise<CloudflareResponse> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/accounts/${encodeURIComponent(
      this.config.accountId,
    )}/email/sending/send`;
    const body = JSON.stringify(email);

    let attempt = 0;
    while (true) {
      attempt++;
      const response = await this.fetchWithAuth(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal,
        },
        attempt,
      );
      const text = await response.text();

      if (response.ok) {
        return parseSuccess(text, attempt);
      }

      const parsed = parseResponse(text);
      const error = new CloudflareApiError(
        formatErrors(parsed?.errors) ?? describeBody(text, response.status),
        {
          statusCode: response.status,
          retryAfterMilliseconds: parseRetryAfter(
            response.headers.get("Retry-After"),
          ),
          attempts: attempt,
          response: parsed,
        },
      );
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt > this.config.retries) throw error;

      const backoffMs =
        error.retryAfterMilliseconds == null
          ? backoffMilliseconds(attempt)
          : Math.min(error.retryAfterMilliseconds, 60000);
      await sleep(backoffMs, signal);
    }
  }

  private async fetchWithAuth(
    url: string,
    options: RequestInit,
    attempt: number,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(this.config.headers)) {
      headers.set(key, value);
    }
    headers.set("Authorization", `Bearer ${this.config.apiToken}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    const combinedSignal = combineSignals(controller.signal, options.signal);

    try {
      return await fetch(url, {
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
        throw new CloudflareApiError(
          `Cloudflare API request timed out after ${this.config.timeout} ms.`,
          { attempts: attempt },
        );
      }
      throw error;
    } finally {
      combinedSignal.cleanup();
      clearTimeout(timeoutId);
    }
  }
}

function parseSuccess(text: string, attempt: number): CloudflareResponse {
  const body = parseResponse(text);
  if (body == null) {
    throw new CloudflareApiError(
      "Cloudflare API answered with a body that is not a JSON object.",
      { attempts: attempt },
    );
  }
  if (body.success === false) {
    throw new CloudflareApiError(
      formatErrors(body.errors) ?? "Cloudflare API reported a failure.",
      { attempts: attempt, response: body },
    );
  }
  return body;
}

/**
 * Parses a reply body, or returns `undefined` when it is not a JSON object,
 * such as an HTML error page from a proxy.
 */
function parseResponse(text: string): CloudflareResponse | undefined {
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body != null && !Array.isArray(body)
      ? (body as CloudflareResponse)
      : undefined;
  } catch {
    return undefined;
  }
}

function describeBody(text: string, status: number): string {
  const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
  return trimmed === "" ? `HTTP ${status}` : trimmed;
}

function formatErrors(
  errors: readonly CloudflareError[] | undefined,
): string | undefined {
  if (!Array.isArray(errors) || errors.length < 1) return undefined;
  const messages = errors.map((e) =>
    e.code == null ? e.message : `${e.message} (code ${e.code})`,
  );
  return messages.join("; ");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
